import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import type { ShuangwenDeps } from './types.js';
import { CreateBody } from './types.js';
import { ShuangwenPipeline, inferShuangwenAudienceFromGenre } from '../../../../pipeline/shuangwen-pipeline.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { requireReady, generateOpeningChapterWithUnifiedPipeline, createUiHelpers, resolveShuangwenModelClient } from './shared-helpers.js';
import { ensureOutlinedChapters, seedCharactersFromShuangwenBlueprint, now } from './utils.js';
import {
  beginKickstartBilling,
  bindKickstartBillingBizId,
  cancelKickstartBilling,
  settleKickstartBilling,
  type KickstartBillingSession,
} from './billing-helpers.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../../ai/usage-context.js';
import { generateAndPersistConstitution } from '../shared/constitution-service.js';

const WEAK_TITLE_PATTERNS = [
  /今天不退场/,
  /不退场$/,
  /烂局/,
  /王炸/,
  /这波.*稳/,
  /稳了稳了/,
  /不认命/,
  /我才是主角/,
];

// 过度套用的题材词：若候选标题以这类词作为核心卖点（而非 seedIdea 实际内容），
// 降权处理，避免不管用户输入什么都收口到"XX系统/金手指"类题材。
const OVERUSED_TROPE_PATTERNS = [
  /系统$/,
  /签到系统/,
  /金手指/,
  /面板$/,
];

function selectBlueprintTitle(candidates: string[], fallback: string): string {
  const cleaned = candidates.map(title => title.trim()).filter(Boolean);
  // 优先选择既非空泛口号、又非过度套路题材词的候选
  const strong = cleaned.find(title =>
    !WEAK_TITLE_PATTERNS.some(p => p.test(title)) &&
    !OVERUSED_TROPE_PATTERNS.some(p => p.test(title))
  );
  if (strong) return strong;
  // 其次选择非空泛口号的候选（即便带套路词也允许，避免无题可选）
  return cleaned.find(title => !WEAK_TITLE_PATTERNS.some(p => p.test(title))) || cleaned[0] || fallback;
}

export function registerCreateAsyncRoutes(router: Router, deps: ShuangwenDeps): void {
  // /create-async：立即创建小说并返回 novelId，后台跑爽文管线并通过 WebSocket 推送进度
  router.post('/create-async', async (req, res) => {
    const parsed = CreateBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      return;
    }
    const ready = requireReady(res, deps);
    if (!ready) return;

    let billingSession: KickstartBillingSession | null = null;
    try {
      const body = parsed.data;
      const modelState = await resolveShuangwenModelClient({ req, res, deps });
      if (!modelState) return;
      const genreUsed = body.genre;
      const audienceUsed = body.audience ?? inferShuangwenAudienceFromGenre(genreUsed);
      const taskId = randomUUID();
      const billing = await beginKickstartBilling(
        req,
        res,
        deps.billingService,
        taskId,
        modelState.modelAccess.billingBypass,
      );
      if (billing.blocked) return;
      billingSession = billing.session;

      const provisionalTitle = (body.title || body.titleHint || '').trim() || '爽文生成中';
      const provisionalSynopsis = (body.synopsis || body.synopsisHint || '').trim()
        || (body.seedIdea || '').trim().slice(0, 800);

      const created = await deps.novelManager.createNovel({
        title: provisionalTitle,
        genre: genreUsed,
        synopsis: provisionalSynopsis,
        description: '',
        constitutionTags: body.constitutionTags,
        ownerId: req.auth?.id ?? 'dev',
      });
      const userApiModelConfig = modelState.modelAccess.profileId
        ? {
            source: 'user-profile' as const,
            provider: modelState.modelAccess.provider as any,
            model: modelState.modelAccess.model ?? '',
            baseUrl: modelState.modelAccess.baseUrl ?? '',
            apiKey: '',
            userApiProfileId: modelState.modelAccess.profileId,
            userApiProfileStorageMode: modelState.modelAccess.profileStorageMode,
            userApiProfileName: modelState.modelAccess.profileName,
          }
        : null;
      if (userApiModelConfig?.provider && userApiModelConfig.model) {
        await deps.novelManager.updateNovel(created.id, { modelConfig: userApiModelConfig } as Record<string, unknown>);
      }
      const aiUsageContext = getAiUsageContext();
      await bindKickstartBillingBizId(deps.billingService, billingSession, created.id);

      res.status(202).json({
        mode: 'create-async',
        taskId,
        novelId: created.id,
        resolved: { genre: genreUsed, audience: audienceUsed },
        billingBypassed: modelState.modelAccess.billingBypass,
        modelAccessSource: modelState.modelAccess.source,
        persisted: true,
        persistDetails: { novelCreated: true },
      });

      const { emit, startPipelineUi, pipelineUiChunk, pipelineUiComplete } = createUiHelpers(deps.broadcast);

      setImmediate(() => {
        void runWithAiUsageContextAsync(
          {
            ...(aiUsageContext ?? {
              scope: 'http',
              operationKey: 'shuangwen.create-async',
              operationLabel: 'Shuangwen create async',
              operationRegistered: true,
            }),
            novelId: created.id,
          },
          async () => {
          startPipelineUi(created.id);
          pipelineUiChunk(created.id, '开书任务已提交，正在初始化项目…\n');

          const pipeline = new ShuangwenPipeline({
            modelClient: modelState.modelClient,
            agents: ready.agents,
            onEvent: (event) => {
              emit(event);
            },
          });

          try {
            pipelineUiChunk(created.id, '生成策划蓝图…\n');
            const seedIdea = body.seedIdea || body.synopsisHint || body.synopsis || body.titleHint || body.title || '未命名爽文';
            const blueprint = await pipeline.generateBlueprint({
              audience: audienceUsed as any,
              genre: genreUsed,
              seedIdea,
              titleHint: body.titleHint || body.title,
              synopsisHint: body.synopsisHint || body.synopsis,
              temperatureOverride: body.temperatureOverride,
            });

            const blueprintTitle = selectBlueprintTitle(blueprint.titleCandidates, created.title);
            await deps.novelManager.updateNovel(created.id, {
              title: blueprintTitle,
              synopsis: blueprint.synopsis || created.synopsis,
              shuangwenBlueprint: blueprint,
              genre: genreUsed,
            } as Record<string, unknown>);
            emit({
              type: 'novel:metadata-updated',
              agentRole: 'writing-assistant',
              novelId: created.id,
              chapterNumber: 1,
              data: JSON.stringify({ title: blueprintTitle, synopsis: blueprint.synopsis || created.synopsis }),
              timestamp: new Date().toISOString(),
            });

            pipelineUiChunk(created.id, '蓝图完成，进入开篇生成管线…\n');
            const runResult = await pipeline.runFromBlueprint({
              novelId: created.id,
              audience: audienceUsed as any,
              genre: genreUsed,
              blueprint,
              outlineChapters: body.outlineChapters,
              targetChapters: body.targetChapters,
              includeMarketing: body.includeMarketing,
              sampleChapter: false,
              maxWordCount: body.maxWordCount,
              temperatureOverride: body.temperatureOverride,
            });

            const persistDetails: Record<string, unknown> = {};
            pipelineUiChunk(created.id, '保存章节蓝图…\n');
            await deps.novelManager.saveOutline(created.id, runResult.outline);
            persistDetails.outlineSaved = true;

            // 持久化爽文蓝图
            pipelineUiChunk(created.id, '写入作品设定…\n');
            await deps.novelManager.updateNovel(created.id, { shuangwenBlueprint: blueprint } as Record<string, unknown>);
            persistDetails.blueprintSaved = true;

            // 生成小说宪章
            try {
              pipelineUiChunk(created.id, '生成创作宪章…\n');
              const novelSnapshot = await deps.novelManager.getNovel(created.id);
              if (novelSnapshot) {
                await generateAndPersistConstitution({
                  novel: novelSnapshot,
                  novelManager: deps.novelManager,
                  modelClient: modelState.modelClient,
                  source: 'kickstart',
                });
                persistDetails.constitutionGenerated = true;
              }
            } catch {
              persistDetails.constitutionGenerated = false;
            }

            // 初始化主角/反派角色档案（用于角色面板"暂无描述"的基础信息）
            try {
              pipelineUiChunk(created.id, '初始化角色卡…\n');
              await seedCharactersFromShuangwenBlueprint({ novelManager: deps.novelManager, novelId: created.id, blueprint });
              persistDetails.charactersSeeded = true;
            } catch {
              persistDetails.charactersSeeded = false;
            }

            // 只有显式要求时才创建"仅大纲"的章节壳
            if (body.createChapterShells) {
              const skip = new Set<number>();
              if (body.sampleChapter) skip.add(1);
              persistDetails.chapterShells = await ensureOutlinedChapters({
                novelManager: deps.novelManager,
                novelId: created.id,
                chapterOutlines: runResult.outline.chapters.map(ch => ({
                  chapterNumber: ch.chapterNumber,
                  title: ch.title ?? '',
                  summary: ch.summary ?? '',
                })),
                skipChapterNumbers: skip,
              });
            }

            if (body.sampleChapter) {
              const existingChapters = await deps.novelManager.listChapters(created.id);
              const existingChapter1 = existingChapters.find(ch => ch.chapterNumber === 1);
              if (!existingChapter1 || body.overwriteChapter1) {
                pipelineUiChunk(created.id, '统一开篇管线生成第 1 章…\n');
                const generated = await generateOpeningChapterWithUnifiedPipeline({
                  deps,
                  novelId: created.id,
                  blueprint,
                  audience: audienceUsed,
                  maxWordCount: body.maxWordCount,
                  modelClient: modelState.modelClient,
                  onEvent: emit,
                });
                runResult.sampleChapter = generated.sampleChapter;
                persistDetails.chapter1Saved = true;
                // 通知第 1 章已生成（fire-and-forget，失败不阻塞）
                try {
                  const chapter1ForNotify = await deps.novelManager.getChapter(created.id, 1);
                  deps.notificationService?.notifyChapterReady(req.auth?.id ?? created.ownerId, {
                    novelId: created.id,
                    novelTitle: created.title,
                    chapterNumber: 1,
                    chapterTitle: chapter1ForNotify?.title ?? generated.sampleChapter?.title,
                  });
                } catch (notifyErr) {
                  console.warn(`[爽文create-async] 第1章通知失败（已忽略）novel=${created.id}:`, notifyErr instanceof Error ? notifyErr.message : notifyErr);
                }
              } else {
                persistDetails.chapter1Saved = false;
                persistDetails.chapter1SkipReason = 'chapter 1 exists (set overwriteChapter1=true to replace)';
              }
            }

            const shouldUpdateTitle = !(body.title && body.title.trim());
            const shouldUpdateSynopsis = !(body.synopsis && body.synopsis.trim());
            if (shouldUpdateTitle || shouldUpdateSynopsis) {
              pipelineUiChunk(created.id, '同步书名和简介…\n');
              await deps.novelManager.updateNovel(created.id, {
                ...(shouldUpdateTitle ? { title: selectBlueprintTitle(blueprint.titleCandidates, created.title) } : {}),
                ...(shouldUpdateSynopsis ? { synopsis: blueprint.synopsis || created.synopsis } : {}),
                genre: genreUsed,
              });
              persistDetails.metaUpdated = true;
            }

            pipelineUiChunk(created.id, '整理结果并完成收尾…\n');
            pipelineUiComplete(created.id, '爽文管线已完成（大纲/样章已写入）。');

            await settleKickstartBilling(deps.billingService, billingSession);
            emit({
              type: 'pipeline:complete',
              agentRole: 'writing-assistant',
              novelId: created.id,
              chapterNumber: 1,
              data: JSON.stringify({ taskId, persistDetails }),
              timestamp: now(),
            });
          } catch (err) {
            console.error('[爽文create-async] 管线执行失败:', err);
            await cancelKickstartBilling(deps.billingService, billingSession);
            // 临时诊断：把完整错误 + stack 暴露到前端 generation-status，便于无日志环境定位
            const errDetail = err instanceof Error
              ? `${err.name}: ${err.message}`
              : `NonError: ${String(err)}`;
            const errStack = err instanceof Error && err.stack ? `\n[STACK]\n${err.stack}` : '';
            const message = `爽文管线执行失败：${errDetail}${errStack}`;
            emit({
              type: 'agent:error',
              agentRole: 'writing-assistant',
              novelId: created.id,
              chapterNumber: 1,
              data: message,
              timestamp: now(),
            });
            emit({
              type: 'pipeline:complete',
              agentRole: 'writing-assistant',
              novelId: created.id,
              chapterNumber: 1,
              data: JSON.stringify({ taskId, error: message }),
              timestamp: now(),
            });
          }
          },
        );
      });
    } catch (err) {
      await cancelKickstartBilling(deps.billingService, billingSession);
      const message = safeErrorMessage(err, '爽文异步创建失败');
      res.status(500).json({ error: message });
    }
  });
}
