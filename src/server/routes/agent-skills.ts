import { Router } from 'express';
import { z } from 'zod';
import type { AuthDb } from '../../auth/types.js';
import { AGENT_NAMES, type AgentRole } from '../../agents/types.js';
import { getAgentSkillService } from '../../agent-skills/service.js';
import { getConfig, getNovelsDir } from '../../config/index.js';
import { createModelClient } from '../../models/provider.js';
import { NovelManager } from '../../novel/novel-manager.js';
import { SkillGeneratorAgent } from '../../agents/skill-generator.js';
import { compileStartupOpeningStrategy } from '../../agent-skills/opening-strategy.js';
import type { BillingService } from '../../billing/billing-service.js';
import { ensureAdmin } from './handlers/agent-skills/admin-support.js';
import { registerAgentSkillAnalyticsRoutes } from './handlers/agent-skills/analytics-routes.js';
import { registerAgentSkillCommercialAbTestRoute } from './handlers/agent-skills/commercial-ab-test-routes.js';
import { registerAgentSkillEffectRoutes } from './handlers/agent-skills/effect-routes.js';
import { registerAgentSkillManagementRoutes } from './handlers/agent-skills/management-routes.js';
import { registerAgentSkillPolicyRoutes } from './handlers/agent-skills/policy-routes.js';
import { registerAgentSkillVersionRoutes } from './handlers/agent-skills/version-routes.js';
import { resolveUserModelAccess } from './helpers/user-api-model-resolver.js';
import { checkNovelAccess } from '../middleware/novel-access.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';
const KNOWN_ROLES = Object.keys(AGENT_NAMES);

const ResolveBody = z.object({
  novelId: z.string().uuid(),
  genre: z.string().min(1),
  role: z.string().min(1),
  chapterNumber: z.number().int().positive().optional(),
  promptBudgetChars: z.number().int().min(0).max(30000).optional(),
  startupPlatformProfile: z.enum(['auto', 'fanqie', 'qidian']).optional(),
  maxWordCount: z.number().int().positive().max(20000).optional(),
});

const GenerateSkillBody = z.object({
  novelId: z.string().uuid(),
  requirement: z.string().min(10).max(2000),
  targetGenre: z.string().max(50).optional(),
  targetRoles: z.array(z.string().min(1)).optional(),
});

function buildSkillGeneratorOutlineDigest(params: {
  synopsis?: string;
  outline: Awaited<ReturnType<NovelManager['getOutline']>>;
}): string {
  const synopsis = String(params.synopsis ?? '').trim();
  if (synopsis) return synopsis;

  return params.outline.chapters
    .slice(0, 3)
    .map((chapter, index) => {
      const title = String(chapter.title ?? '').trim() || `第${chapter.chapterNumber || index + 1}章`;
      const summary = String(chapter.summary ?? '').trim();
      return summary ? `${title}：${summary}` : title;
    })
    .filter(Boolean)
    .join('\n');
}

export function createAgentSkillsRouter(params: {
  billingService?: BillingService;
  authDb?: AuthDb;
  novelManager?: NovelManager;
} = {}): Router {
  const router = Router();
  const service = getAgentSkillService();
  const { billingService, authDb, novelManager } = params;

  async function ensureNovelAccess(
    req: import('express').Request,
    res: import('express').Response,
    novelId: string,
  ): Promise<boolean> {
    const manager = novelManager ?? new NovelManager(getNovelsDir());
    const access = await checkNovelAccess(req, manager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return false;
    }
    return true;
  }

  registerAgentSkillManagementRoutes(router, { service, ensureAdmin });
  registerAgentSkillCommercialAbTestRoute(router, { ensureAdmin });

  registerAgentSkillPolicyRoutes(router, { service, ensureAdmin, ensureNovelAccess });

  router.post('/resolve', async (req, res) => {
    const parsed = ResolveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数不合法' });
      return;
    }

    if (!KNOWN_ROLES.includes(parsed.data.role)) {
      res.status(400).json({ error: `role 不合法，可选：${KNOWN_ROLES.join(', ')}` });
      return;
    }
    if (!(await ensureNovelAccess(req, res, parsed.data.novelId))) {
      return;
    }

    try {
      const result = await service.resolveSkills({
        novelId: parsed.data.novelId,
        genre: parsed.data.genre,
        role: parsed.data.role as AgentRole,
        chapterNumber: parsed.data.chapterNumber,
        promptBudgetChars: parsed.data.promptBudgetChars,
      });
      const compiledPreview = compileStartupOpeningStrategy({
        role: parsed.data.role as AgentRole,
        context: {
          novelId: parsed.data.novelId,
          genre: parsed.data.genre,
          novelTitle: '',
          novelSynopsis: '',
          chapterNumber: parsed.data.chapterNumber,
          startupPlatformProfile: parsed.data.startupPlatformProfile,
          maxWordCount: parsed.data.maxWordCount,
        },
        skills: result.matchedSkills,
      });
      res.json({
        ...result,
        startupOpeningStrategyPreview: compiledPreview.enabled
          ? {
              enabled: compiledPreview.enabled,
              brief: compiledPreview.brief,
              summary: compiledPreview.summary,
              conflicts: compiledPreview.conflicts,
              consumedSkillIds: compiledPreview.consumedSkillIds,
            }
          : undefined,
      });
    } catch (err) {
      res.status(500).json({ error: '技能解析失败', detail: String(err) });
    }
  });

  router.post('/generate', async (req, res) => {
    const parsed = GenerateSkillBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数不合法' });
      return;
    }
    if (!(await ensureNovelAccess(req, res, parsed.data.novelId))) {
      return;
    }

    const userId = req.auth?.id ?? 'anonymous';

    try {
      const novelManager = new NovelManager(getNovelsDir());
      const [novel, outline, world] = await Promise.all([
        novelManager.getNovel(parsed.data.novelId),
        novelManager.getOutline(parsed.data.novelId),
        novelManager.getWorldEntries(parsed.data.novelId),
      ]);

      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }

      // 检查积分余额
      if (billingService && !modelAccess.billingBypass) {
        const config = await billingService.getSystemConfig();
        const costPoints = config.operationBindings.skillGeneratorCostPoints ?? 99;
        const account = await billingService.getAccount(userId);

        if (account.balancePoints < costPoints) {
          res.status(402).json({
            error: '积分不足',
            required: costPoints,
            balance: account.balancePoints,
          });
          return;
        }

        // 扣除积分
        await billingService.consumePoints(
          userId,
          costPoints,
          'agent-skills.generate',
          `${parsed.data.novelId}-${Date.now()}`,
          `生成自定义技能：${parsed.data.requirement.slice(0, 50)}`,
        );
      }

      // 调用技能生成 Agent
      const modelClient = modelAccess.client ?? createModelClient(getConfig());
      const generator = new SkillGeneratorAgent(modelClient);

      const result = await generator.generate({
        requirement: parsed.data.requirement,
        targetGenre: parsed.data.targetGenre,
        targetRoles: parsed.data.targetRoles,
        novelContext: {
          title: novel.title,
          genre: novel.genre,
          outline: buildSkillGeneratorOutlineDigest({
            synopsis: novel.synopsis,
            outline,
          }),
          worldSetting: world.slice(0, 3).map(e => `${e.name}: ${e.description}`).join('\n'),
        },
      });

      // 保存生成的技能到小说专属技能库
      const createdSkill = await service.createSkill({
        ...result.skill,
        tags: [...(result.skill.tags || []), `novel:${parsed.data.novelId}`],
        createdBy: userId,
      });

      // 自动启用该技能到小说策略
      const novelPolicy = await service.getNovelPolicy(parsed.data.novelId);
      await service.updateNovelPolicy(parsed.data.novelId, {
        ...novelPolicy,
        enabledSkillIds: [...(novelPolicy.enabledSkillIds || []), createdSkill.id],
      });

      res.status(201).json({
        message: '技能生成成功',
        skill: createdSkill,
        reasoning: result.reasoning,
        costPoints: billingService && !modelAccess.billingBypass
          ? (await billingService.getSystemConfig()).operationBindings.skillGeneratorCostPoints ?? 99
          : 0,
        billingBypassed: modelAccess.billingBypass,
        modelAccessSource: modelAccess.source,
      });
    } catch (err) {
      res.status(500).json({
        error: '技能生成失败',
        detail: safeErrorMessage(err, '内部错误'),
      });
    }
  });

  registerAgentSkillAnalyticsRoutes(router, { service, ensureAdmin });

  registerAgentSkillEffectRoutes(router, { ensureNovelAccess });

  registerAgentSkillVersionRoutes(router, { service, ensureAdmin });

  return router;
}
