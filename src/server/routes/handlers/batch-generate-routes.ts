import type { Router } from 'express';
import type { AgentEvent } from '../../../agents/types.js';
import type { ChapterPipeline } from '../../../pipeline/chapter-pipeline.js';
import type { ChapterGenerationResult } from '../../../pipeline/types.js';
import { BatchBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import type { ResolvedUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { saveGenerationResults, ensureFailedChapterRecord } from '../../../services/generation-result-service.js';
import { schedulePostSaveBackgroundTasks } from '../../../services/generation-background-tasks.js';
import type { BatchEvent, BatchQueue } from '../../../pipeline/batch-queue.js';
import { runBatchFinalizePass } from '../../../pipeline/batch-finalize-pass.js';
import { buildChapterCost } from '../../../cost/build-chapter-cost.js';
import { getConfig } from '../../../config/index.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../ai/usage-context.js';
import { batchLogger, emitBatchChapterFailure } from './batch-route-support.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { shouldPersistGenerationFailure } from '../../../services/generation-failure-classifier.js';

export function registerBatchGenerateRoutes(
  router: Router,
  deps: GenerateDeps,
  batchQueue: BatchQueue,
): void {
  const {
    novelManager,
    novelMemory,
    chapterPipeline,
    finalizePipeline,
    modelClient,
    broadcast,
    broadcastJson,
    agents,
    storyStateManager,
    authDb,
    notificationService,
  } = deps;

  router.post('/batch', async (req, res) => {
    try {
      const parsed = BatchBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { novelId, fromChapter, toChapter, autoFinalize: autoFinalizeParam, userDirection, maxWordCount } = parsed.data;
      // 若前端未显式指定，则以全局配置 autoFinalize.enabled 为准
      const autoFinalize = req.body?.autoFinalize === undefined
        ? getConfig().autoFinalize.enabled
        : autoFinalizeParam;

      if (batchQueue.isRunning(novelId)) {
        res.status(409).json({ error: '该小说已有批量任务正在执行' });
        return;
      }
      // 用户级并发限制：单用户最多同时运行 1 个批量任务
      // 章节生成管线内部有 10+ 个串行 agent 调用，多任务并行会导致 LLM API 限流，反而更慢
      const userId = req.auth?.id;
      const userJobCheck = batchQueue.canUserStartJob(userId);
      if (!userJobCheck.allowed) {
        const runningJob = userJobCheck.runningJob;
        res.status(429).json({
          error: userJobCheck.reason,
          code: 'USER_CONCURRENT_LIMIT',
          runningJob: runningJob ? {
            novelId: runningJob.novelId,
            status: runningJob.status,
            currentIndex: runningJob.currentIndex,
            totalItems: runningJob.items.length,
            createdAt: runningJob.createdAt,
          } : undefined,
        });
        return;
      }
      if (!batchQueue.canStartNewJob()) {
        res.status(429).json({
          error: `已达到全局最大并发数限制（${batchQueue.getRunningJobsCount()}/5），请等待其他任务完成`,
        });
        return;
      }
      if (fromChapter > toChapter) {
        res.status(400).json({ error: '起始章节不能大于结束章节' });
        return;
      }
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const aiUsageContext = getAiUsageContext();

      // 模型访问检查必须在发送响应之前完成，否则 ERR_HTTP_HEADERS_SENT 会阻止 batch 任务启动
      // 解密失败时静默回退到平台模型，避免阻塞批量生成
      let batchModelAccess: ResolvedUserModelAccess;
      try {
        batchModelAccess = await resolveUserModelAccess({
          authDb,
          userId: req.auth?.id,
          headers: req.headers,
          novel,
        });
      } catch (modelResolveErr) {
        console.warn(`[batch-generate] resolveUserModelAccess 失败，回退到平台模型 novel=${novelId}:`, modelResolveErr instanceof Error ? modelResolveErr.message : modelResolveErr);
        batchModelAccess = {
          client: undefined,
          billingBypass: false,
          source: 'platform-global' as const,
        };
      }
      if (batchModelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: batchModelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }

      const job = batchQueue.createJob(novelId, fromChapter, toChapter, autoFinalize, userId);
      res.json({ batchId: job.id, status: 'started', items: job.items });

      const batchModelOverride = batchModelAccess.client;
      const batchBackgroundModelClient = batchModelOverride ?? modelClient;
      void runWithAiUsageContextAsync(
        aiUsageContext ?? {
          scope: 'http',
          operationKey: 'generate.batch',
          operationLabel: 'Batch generate',
          operationRegistered: true,
          novelId,
        },
        async () => batchQueue.execute({
          job,
          options: {
            // 智能超时：空闲 8 分钟无心跳判定卡死；总时长兜底 60 分钟。
            // 单个 agent 的流式输出会持续触发心跳（见 chapter-pipeline runAgent），
            // 因此 8 分钟仅在真正卡死（长时间零输出）时触发。
            idleTimeoutMs: 8 * 60 * 1000,
            maxTotalTimeoutMs: 60 * 60 * 1000,
            maxAutoRetries: 1,
            retryDelayMs: 5_000,
          },
          generateFn: async (chapterNumber: number, signal: AbortSignal, heartbeat: (stage?: string) => void) => {
            try {
              const bootstrapChapter = chapterNumber === 1;
              const isolatedChapterPipeline = chapterPipeline.fork();
              let result: Awaited<ReturnType<ChapterPipeline['generateChapter']>>;
              try {
                result = await isolatedChapterPipeline.generateChapter({
                  novelId,
                  chapterNumber,
                  userDirection,
                  maxWordCount,
                  modelOverride: batchModelOverride,
                  skipStrictGate: bootstrapChapter,
                  signal,
                  onEvent: (event: AgentEvent) => { broadcast(event); },
                  onHeartbeat: (stage: string) => heartbeat(stage),
                });
              } catch (generationError) {
                if (signal.aborted) throw generationError;
                const isStrictFailure = generationError instanceof Error
                  && /未通过（strict）|未通过\(strict\)/.test(generationError.message);
                if (bootstrapChapter || !isStrictFailure) {
                  throw generationError;
                }
                console.warn(`[batch-generate] strict gate failed, retry with skipStrictGate novel=${novelId} chapter=${chapterNumber}: ${(generationError as Error).message}`);
                result = await isolatedChapterPipeline.generateChapter({
                  novelId,
                  chapterNumber,
                  userDirection,
                  maxWordCount,
                  modelOverride: batchModelOverride,
                  skipStrictGate: true,
                  signal,
                  onEvent: (event: AgentEvent) => { broadcast(event); },
                  onHeartbeat: (stage: string) => heartbeat(stage),
                });
              }
              return result;
            } catch (generationError) {
              if (shouldPersistGenerationFailure({ error: generationError, signal })) {
                try {
                  await ensureFailedChapterRecord({
                    novelManager,
                    novelId,
                    chapterNumber,
                    errorMessage: generationError instanceof Error ? generationError.message : String(generationError),
                    retryable: true,
                  });
                } catch (saveErr) {
                  console.warn(`[batch-generate] 保存失败章节记录失败 novel=${novelId} chapter=${chapterNumber}:`, saveErr instanceof Error ? saveErr.message : saveErr);
                }
              }
              emitBatchChapterFailure(broadcast, { novelId, chapterNumber, error: generationError });
              throw generationError;
            }
          },
          postProcessFn: async (chapterNumber: number, rawResult: unknown) => {
            const result = rawResult as ChapterGenerationResult;
            if (!result?.chapterContent || result.chapterContent.trim().length === 0) {
              throw new Error(`章节 ${chapterNumber} 生成内容为空，无法落库`);
            }
            try {
              await saveGenerationResults(novelManager, novelId, chapterNumber, result);
            } catch (saveError) {
              await ensureFailedChapterRecord({
                novelManager,
                novelId,
                chapterNumber,
                errorMessage: saveError instanceof Error ? saveError.message : String(saveError),
                retryable: true,
              });
              throw saveError;
            }
            // 通知章节已生成（fire-and-forget，失败不阻塞主流程）
            try {
              const chapterForNotify = await novelManager.getChapter(novelId, chapterNumber);
              notificationService?.notifyChapterReady(novel.ownerId ?? '', {
                novelId,
                novelTitle: novel.title,
                chapterNumber,
                chapterTitle: chapterForNotify?.title,
              });
            } catch (notifyErr) {
              console.warn(`[batch-generate] notify 失败（已忽略）novel=${novelId} chapter=${chapterNumber}:`, notifyErr instanceof Error ? notifyErr.message : notifyErr);
            }
            await schedulePostSaveBackgroundTasks(
              novelManager,
              novelMemory,
              novelId,
              chapterNumber,
              result,
              agents,
              batchBackgroundModelClient,
              storyStateManager,
            );
            const costSummary = buildChapterCost(novelId, chapterNumber, result.agentOutputs, {
              operationType: 'generate',
              operationLabel: '批量生成',
            });
            try {
              await novelManager.appendChapterCost(novelId, costSummary);
            } catch (costErr) {
              console.warn(`[batch-generate] 成本写入失败，不影响主流程 novel=${novelId} chapter=${chapterNumber}:`, costErr instanceof Error ? costErr.message : costErr);
            }
            broadcast({
              type: 'pipeline:complete',
              agentRole: 'writer',
              novelId,
              chapterNumber,
              data: JSON.stringify({ chapterNumber, cost: costSummary }),
              timestamp: new Date().toISOString(),
            });
          },
          onBatchEvent: (event: BatchEvent) => {
            if (broadcastJson) {
              broadcastJson({ type: 'batch', event: event.type, payload: event });
            }
          },
        }).then(async (completedJob) => {
          batchLogger.debug('auto-finalize check', { autoFinalize, hasFinalizePipeline: !!finalizePipeline, jobStatus: completedJob.status });
          if (!autoFinalize || !finalizePipeline) return;
          if (completedJob.status !== 'completed') return;

          const successChapters = completedJob.items
            .filter(i => i.status === 'completed')
            .map(i => i.chapterNumber);
          batchLogger.info('auto-finalize', { chapterCount: successChapters.length, chapters: successChapters });
          if (successChapters.length === 0) return;

          await runBatchFinalizePass({
            batchId: completedJob.id,
            novelId,
            chapters: successChapters,
            finalizeFn: async (chapterNumber: number) => {
              await finalizePipeline.finalize({
                novelId,
                chapterNumber,
                onEvent: (event: AgentEvent) => { broadcast(event); },
                modelOverride: batchModelOverride,
              });
            },
            onEvent: (event) => {
              if (broadcastJson) {
                broadcastJson({ type: 'batch-finalize', event: event.type, payload: event });
              }
            },
          });
        }).catch(err => {
          console.error('[批量生成] 执行失败:', err);
        }),
      );
    } catch (err) {
      const message = safeErrorMessage(err, '启动批量生成失败');
      res.status(500).json({ error: message });
    }
  });
}
