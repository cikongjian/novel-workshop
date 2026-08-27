import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import type { AgentEvent } from '../../../agents/types.js';
import { BatchReviseBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { buildChapterCost } from '../../../cost/build-chapter-cost.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../ai/usage-context.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

export function registerBatchReviseRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, batchRevisionPipeline, broadcast, broadcastJson } = deps;

  router.post('/batch-revise', async (req, res) => {
    try {
      if (!batchRevisionPipeline) {
        res.status(501).json({ error: '批量修订管线未启用' });
        return;
      }
      const parsed = BatchReviseBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { novelId, fromChapter, toChapter, userDirection } = parsed.data;
      if (fromChapter > toChapter) {
        res.status(400).json({ error: '起始章节不能大于结束章节' });
        return;
      }
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const taskId = randomUUID();
      const aiUsageContext = getAiUsageContext();
      res.json({ taskId, status: 'started', fromChapter, toChapter });

      void runWithAiUsageContextAsync(
        aiUsageContext ?? {
          scope: 'http',
          operationKey: 'generate.batch-revise',
          operationLabel: 'Batch revise',
          operationRegistered: true,
          novelId,
        },
        async () => batchRevisionPipeline.batchRevise({
          novelId,
          fromChapter,
          toChapter,
          userDirection: userDirection || undefined,
          onEvent: (event: AgentEvent) => {
            broadcast(event);
            if (broadcastJson) {
              broadcastJson({ type: 'batch-revise', taskId, event: event.type, payload: event });
            }
          },
        }).then(async (result) => {
          for (const revised of result.revisedChapters) {
            const existing = await novelManager.getChapter(novelId, revised.chapterNumber);
            if (existing) {
              await novelManager.saveChapter(novelId, {
                ...existing,
                content: revised.revisedContent,
                wordCount: revised.revisedWordCount,
                revisionCount: (existing.revisionCount ?? 0) + 1,
                status: 'edited',
                updatedAt: new Date().toISOString(),
              });
            }
            const costSummary = buildChapterCost(novelId, revised.chapterNumber, revised.agentOutputs, {
              operationType: 'revise',
              operationLabel: '批量修订',
            });
            if (costSummary.totalInputTokens > 0 || costSummary.totalOutputTokens > 0) {
              await novelManager.appendChapterCost(novelId, costSummary);
            }
          }
          if (broadcastJson) {
            broadcastJson({
              type: 'batch-revise',
              taskId,
              event: 'batch-revise:complete',
              payload: {
                totalChapters: result.revisedChapters.length,
                qualityIssuesFound: result.skeleton.qualityIssues.length,
              },
            });
          }
        }).catch(err => {
          console.error('[批量修订] 执行失败:', err);
          if (broadcastJson) {
            broadcastJson({
              type: 'batch-revise',
              taskId,
              event: 'batch-revise:error',
              payload: { error: safeErrorMessage(err, String(err)) },
            });
          }
        }),
      );
    } catch (err) {
      const message = safeErrorMessage(err, '启动批量修订失败');
      res.status(500).json({ error: message });
    }
  });
}
