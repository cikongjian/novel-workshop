import type { Router } from 'express';
import { getConfig } from '../../../config/index.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../ai/usage-context.js';
import { createLogger } from '../../../utils/logger.js';
import { executeReindexMemory } from '../../../scripts/reindex-memory.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveCompatibleApiKey } from './api-key.js';
import {
  type MemoryRouteDeps,
  ReindexMemoryBody,
  finishReindexTask,
  getReindexStatusSnapshot,
  isReindexRunning,
  isSelectedScopeMissingNovelIds,
  resolveSelectedNovelIds,
  startReindexTask,
  updateReindexProgress,
} from './memory-support.js';

const log = createLogger('memory-routes');

export function registerMemoryReindexRoutes(
  router: Router,
  deps: MemoryRouteDeps,
): void {
  router.post('/reindex-memory', async (req, res) => {
    const parsed = ReindexMemoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    const {
      scope,
      novelIds,
      clearBeforeRebuild,
      dryRun,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel,
      embeddingBaseUrl,
    } = parsed.data;
    const selectedNovelIds = resolveSelectedNovelIds(scope, novelIds);

    if (isSelectedScopeMissingNovelIds(scope, selectedNovelIds)) {
      res.status(400).json({ error: 'novelIds is required when scope is selected' });
      return;
    }

    const cfg = getConfig();
    const resolvedEmbeddingProvider = embeddingProvider?.trim() || cfg.embedding.provider;
    const resolvedEmbeddingBaseUrl = embeddingBaseUrl?.trim() || cfg.embedding.baseUrl || undefined;
    const incomingEmbeddingApiKey = (embeddingApiKey ?? '').includes('****')
      ? cfg.embedding.apiKey
      : (embeddingApiKey ?? '');
    const effectiveApiKey = resolveCompatibleApiKey({
      provider: resolvedEmbeddingProvider,
      apiKey: incomingEmbeddingApiKey || cfg.embedding.apiKey,
      baseUrl: resolvedEmbeddingBaseUrl,
    });
    if (!effectiveApiKey) {
      res.status(400).json({ error: 'EMBEDDING_API_KEY is not configured' });
      return;
    }

    if (isReindexRunning()) {
      res.status(409).json({ error: '已有重建任务正在进行，请等待完成后再试' });
      return;
    }

    if (dryRun) {
      try {
        const summary = await executeReindexMemory({
          novelIds: selectedNovelIds,
          clearBeforeRebuild,
          dryRun: true,
          embeddingProvider: resolvedEmbeddingProvider,
          embeddingApiKey: incomingEmbeddingApiKey || cfg.embedding.apiKey,
          embeddingModel: embeddingModel?.trim() || cfg.embedding.model,
          embeddingBaseUrl: resolvedEmbeddingBaseUrl,
          logger: (message) => log.info(message),
        });
        res.json(summary);
      } catch (err) {
        res.status(500).json({
          error: 'Failed to run memory index dry-run',
          detail: safeErrorMessage(err, '记忆索引试运行失败'),
        });
      }
      return;
    }

    const aiUsageContext = getAiUsageContext();
    startReindexTask();
    res.status(202).json({ accepted: true, message: '重建任务已启动，进度通过 WebSocket 推送' });

    void runWithAiUsageContextAsync(
      aiUsageContext ?? {
        scope: 'http',
        operationKey: 'settings.memory-reindex',
        operationLabel: 'Settings memory reindex',
        operationRegistered: true,
        novelId: selectedNovelIds?.length === 1 ? selectedNovelIds[0] : undefined,
      },
      async () => {
        try {
          const summary = await executeReindexMemory({
            novelIds: selectedNovelIds,
            clearBeforeRebuild,
            dryRun: false,
            embeddingProvider: resolvedEmbeddingProvider,
            embeddingApiKey: incomingEmbeddingApiKey || cfg.embedding.apiKey,
            embeddingModel: embeddingModel?.trim() || cfg.embedding.model,
            embeddingBaseUrl: resolvedEmbeddingBaseUrl,
            logger: (message) => log.info(message),
            onProgress: deps.broadcastJson
              ? (progress) => {
                  updateReindexProgress(progress);
                  deps.broadcastJson?.({ type: 'reindex:progress', ...progress });
                }
              : undefined,
          });
          deps.broadcastJson?.({ type: 'reindex:complete', ok: summary.ok, summary });
          log.info(`记忆索引重建完成：成功 ${summary.successNovels}，失败 ${summary.failedNovels}`);
        } catch (err) {
          deps.broadcastJson?.({
            type: 'reindex:complete',
            ok: false,
            error: safeErrorMessage(err, '记忆索引重建失败'),
          });
          log.error(`记忆索引重建失败: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          finishReindexTask();
        }
      },
    );
  });

  router.get('/reindex-status', (_req, res) => {
    res.json(getReindexStatusSnapshot());
  });
}
