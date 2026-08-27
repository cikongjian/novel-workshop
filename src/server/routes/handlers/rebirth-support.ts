import type { Response, Router } from 'express';
import type { AgentEvent, AgentRole } from '../../../agents/types.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../ai/usage-context.js';
import type { BatchEvent, BatchJob, BatchQueue } from '../../../pipeline/batch-queue.js';
import { runBatchFinalizePass } from '../../../pipeline/batch-finalize-pass.js';
import type { ChapterGenerationResult } from '../../../pipeline/types.js';
import { RebirthPipeline } from '../../../pipeline/rebirth-pipeline.js';
import { saveGenerationResults } from '../../../services/generation-result-service.js';
import { schedulePostSaveBackgroundTasks } from '../../../services/generation-background-tasks.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';

export function sendRebirthChapterDirectionDeprecated(res: Response): void {
  res.status(410).json({
    error: '重生章节干预公开接口已弃用',
    code: 'REBIRTH_CHAPTER_DIRECTION_DEPRECATED',
  });
}

export function getRebirthBatchQueue(router: Router): BatchQueue | undefined {
  return (router as Router & { __batchQueue?: BatchQueue }).__batchQueue;
}

export function buildRebirthResponse(params: {
  result: {
    newNovelId: string;
    totalChapters: number;
  };
  blueprint: {
    title: string;
    synopsis: string;
    characters: unknown[];
    worldEntries: unknown[];
    qualityNotes?: string;
    rewriteDirection?: string;
  };
  autoGenerate: boolean;
}): {
  newNovelId: string;
  totalChapters: number;
  blueprint: {
    title: string;
    synopsis: string;
    characterCount: number;
    worldEntryCount: number;
    qualityNotes?: string;
    rewriteDirection?: string;
  };
  autoGenerate: boolean;
} {
  return {
    newNovelId: params.result.newNovelId,
    totalChapters: params.result.totalChapters,
    blueprint: {
      title: params.blueprint.title,
      synopsis: params.blueprint.synopsis,
      characterCount: params.blueprint.characters.length,
      worldEntryCount: params.blueprint.worldEntries.length,
      qualityNotes: params.blueprint.qualityNotes,
      rewriteDirection: params.blueprint.rewriteDirection,
    },
    autoGenerate: params.autoGenerate,
  };
}

export function createRebirthPipeline(deps: GenerateDeps): RebirthPipeline {
  return new RebirthPipeline(
    deps.agents as Map<AgentRole, any>,
    deps.novelManager,
    deps.modelClient,
  );
}

export function startRebirthAutoGeneration(params: {
  deps: GenerateDeps;
  req: {
    auth?: { id?: string };
    headers: Record<string, string | string[] | undefined>;
  };
  sourceNovelId: string;
  sourceNovel: NonNullable<Awaited<ReturnType<GenerateDeps['novelManager']['getNovel']>>>;
  newNovelId: string;
  totalChapters: number;
  autoFinalize: boolean;
  userDirection: string;
  maxWordCount?: number;
  rewriteDirection?: string;
  batchQueue: BatchQueue;
}): void {
  const {
    deps,
    req,
    sourceNovelId,
    sourceNovel,
    newNovelId,
    totalChapters,
    autoFinalize,
    userDirection,
    maxWordCount,
    rewriteDirection,
    batchQueue,
  } = params;
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
  } = deps;
  const aiUsageContext = getAiUsageContext();

  void runWithAiUsageContextAsync(
    {
      ...(aiUsageContext ?? {
        scope: 'http',
        operationKey: 'generate.rebirth',
        operationLabel: 'Rebirth',
        operationRegistered: true,
      }),
      novelId: newNovelId,
    },
    async () => {
      const rebirthModelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel: sourceNovel,
      });
      if (rebirthModelAccess.error && sourceNovel.modelConfig?.source === 'user-profile') {
        broadcastJson?.({
          type: 'rebirth',
          event: 'rebirth:error',
          payload: { novelId: sourceNovelId, error: rebirthModelAccess.error },
        });
        return;
      }

      const rebirthModelOverride = rebirthModelAccess.client;
      const job = batchQueue.createJob(newNovelId, 1, totalChapters, autoFinalize);
      return batchQueue.execute({
        job,
        generateFn: async (chapterNumber: number, signal: AbortSignal) => {
          return chapterPipeline.fork().generateChapter({
            novelId: newNovelId,
            chapterNumber,
            userDirection: rewriteDirection ?? userDirection,
            maxWordCount,
            signal,
            onEvent: (event: AgentEvent) => { broadcast(event); },
            modelOverride: rebirthModelOverride,
          });
        },
        postProcessFn: async (chapterNumber: number, rawResult: unknown) => {
          const genResult = rawResult as ChapterGenerationResult;
          await saveGenerationResults(novelManager, newNovelId, chapterNumber, genResult);
          schedulePostSaveBackgroundTasks(
            novelManager,
            novelMemory,
            newNovelId,
            chapterNumber,
            genResult,
            agents,
            modelClient,
            storyStateManager,
          );
          broadcast({
            type: 'pipeline:complete',
            agentRole: 'writer',
            novelId: newNovelId,
            chapterNumber,
            data: '',
            timestamp: new Date().toISOString(),
          });
        },
        onBatchEvent: (event: BatchEvent) => {
          broadcastJson?.({
            type: 'batch',
            event: event.type,
            payload: { ...event, rebirthFrom: sourceNovelId },
          });
        },
      }).then(async (completedJob: BatchJob) => {
        if (!autoFinalize || !finalizePipeline) {
          return;
        }
        if (completedJob.status !== 'completed') {
          return;
        }

        const successChapters = completedJob.items
          .filter(item => item.status === 'completed')
          .map(item => item.chapterNumber);
        if (successChapters.length === 0) {
          return;
        }

        await runBatchFinalizePass({
          batchId: completedJob.id,
          novelId: newNovelId,
          chapters: successChapters,
          finalizeFn: async (chapterNumber: number) => {
            await finalizePipeline.finalize({
              novelId: newNovelId,
              chapterNumber,
              onEvent: (event: AgentEvent) => { broadcast(event); },
              modelOverride: rebirthModelOverride,
            });
          },
          onEvent: (event) => {
            broadcastJson?.({
              type: 'batch-finalize',
              event: event.type,
              payload: { ...event, rebirthFrom: sourceNovelId },
            });
          },
        });
      }).catch((err: unknown) => {
        console.error('[重生批量生成] 执行失败:', err);
      });
    },
  ).catch((err: unknown) => {
    console.error('[重生批量生成] 执行失败:', err);
  });
}
