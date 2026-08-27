import type { Router } from 'express';
import type { ShuangwenDeps } from './types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { ApplyBody } from './types.js';
import {
  requireReady,
  generateArtifacts,
  generateOpeningChapterWithUnifiedPipeline,
  loadAccessibleNovel,
  resolveShuangwenModelClient,
} from './shared-helpers.js';
import { mergeOutlineWithExistingChapters, ensureOutlinedChapters, seedCharactersFromShuangwenBlueprint } from './utils.js';
import { beginKickstartBilling, cancelKickstartBilling, settleKickstartBilling, type KickstartBillingSession } from './billing-helpers.js';

export function registerApplyRoutes(router: Router, deps: ShuangwenDeps): void {
  // /apply：将结果写入已有小说（显式触发，避免误伤正常写作流程）
  router.post('/apply', async (req, res) => {
    const parsed = ApplyBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      return;
    }
    const ready = requireReady(res, deps);
    if (!ready) return;

    let billingSession: KickstartBillingSession | null = null;
    try {
      const body = parsed.data;
      const existingNovel = await loadAccessibleNovel({
        req,
        res,
        deps,
        novelId: body.novelId,
      });
      if (!existingNovel) return;
      const modelState = await resolveShuangwenModelClient({
        req,
        res,
        deps,
        novel: existingNovel,
      });
      if (!modelState) return;
      const billing = await beginKickstartBilling(
        req,
        res,
        deps.billingService,
        body.novelId,
        modelState.modelAccess.billingBypass,
      );
      if (billing.blocked) return;
      billingSession = billing.session;
      // seedIdea 容错：空小说可能没有 synopsis/description，用标题兜底
      const seedIdea = body.seedIdea
        || existingNovel.synopsis
        || existingNovel.description
        || body.synopsisHint
        || body.titleHint
        || existingNovel.title
        || '未命名小说';
      const { genreUsed, audienceUsed, blueprint, runResult } = await generateArtifacts({
        modelClient: modelState.modelClient,
        agents: ready.agents,
        novelIdForContext: body.novelId,
        inputGenre: body.genre,
        inputAudience: body.audience,
        seedIdea,
        titleHint: body.titleHint || existingNovel.title,
        synopsisHint: body.synopsisHint || existingNovel.synopsis || existingNovel.description,
        outlineChapters: body.outlineChapters,
        targetChapters: body.targetChapters,
        includeMarketing: body.includeMarketing,
        sampleChapter: false,
        maxWordCount: body.maxWordCount,
        temperatureOverride: body.temperatureOverride,
        existingNovel,
      });

      if (body.overwriteMeta) {
        await deps.novelManager.updateNovel(body.novelId, {
          title: body.titleHint || blueprint.titleCandidates[0] || existingNovel.title,
          synopsis: body.synopsisHint || blueprint.synopsis || existingNovel.synopsis,
          genre: genreUsed,
        });
      }

      const persistDetails: Record<string, unknown> = {};
      // 合并大纲：保留已有章节的真实摘要，只对未写章节使用生成内容
      const mergedOutline = await mergeOutlineWithExistingChapters({
        novelManager: deps.novelManager, novelId: body.novelId, generatedOutline: runResult.outline,
      });
      await deps.novelManager.saveOutline(body.novelId, mergedOutline);
      persistDetails.outlineSaved = true;

      // 持久化爽文蓝图
      await deps.novelManager.updateNovel(body.novelId, { shuangwenBlueprint: blueprint } as Record<string, unknown>);
      persistDetails.blueprintSaved = true;

      // 初始化主角/反派角色档案（用于角色面板"暂无描述"的基础信息）
      try {
        await seedCharactersFromShuangwenBlueprint({ novelManager: deps.novelManager, novelId: body.novelId, blueprint });
        persistDetails.charactersSeeded = true;
      } catch {
        persistDetails.charactersSeeded = false;
      }

      if (body.createChapterShells) {
        const skip = new Set<number>();
        if (body.sampleChapter) skip.add(1);
        persistDetails.chapterShells = await ensureOutlinedChapters({
          novelManager: deps.novelManager,
          novelId: body.novelId,
          chapterOutlines: mergedOutline.chapters.map(ch => ({
            chapterNumber: ch.chapterNumber,
            title: ch.title ?? '',
            summary: ch.summary ?? '',
          })),
          skipChapterNumbers: skip,
        });
      }

      if (body.sampleChapter) {
        const existingChapters = await deps.novelManager.listChapters(body.novelId);
        const existingChapter1 = existingChapters.find(ch => ch.chapterNumber === 1);

        if (!existingChapter1 || body.overwriteChapter1) {
          const generated = await generateOpeningChapterWithUnifiedPipeline({
            deps,
            novelId: body.novelId,
            blueprint,
            audience: audienceUsed as 'male' | 'female',
            maxWordCount: body.maxWordCount,
            modelClient: modelState.modelClient,
          });
          runResult.sampleChapter = generated.sampleChapter;
          persistDetails.chapter1Saved = true;
        } else {
          persistDetails.chapter1Saved = false;
          persistDetails.chapter1SkipReason = 'chapter 1 exists (set overwriteChapter1=true to replace)';
        }
      }

      await settleKickstartBilling(deps.billingService, billingSession);
      res.json({
        mode: 'apply',
        novelId: body.novelId,
        resolved: { genre: genreUsed, audience: audienceUsed },
        billingBypassed: modelState.modelAccess.billingBypass,
        modelAccessSource: modelState.modelAccess.source,
        persisted: true,
        persistDetails,
        ...runResult,
      });
    } catch (err) {
      await cancelKickstartBilling(deps.billingService, billingSession);
      const message = safeErrorMessage(err, '爽文管线应用失败');
      res.status(500).json({ error: message });
    }
  });
}
