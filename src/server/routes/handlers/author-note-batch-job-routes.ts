import type { Router } from 'express';
import { getAiUsageContext } from '../../../ai/usage-context.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  cancelAuthorNoteBatch,
  hasRunningAuthorNoteBatch,
  resolveAuthorNoteBatchTargetChapters,
  startAuthorNoteBatchGeneration,
} from './author-note-batch-support.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

export function registerAuthorNoteBatchJobRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, modelClient, agents, authDb } = deps;

  router.post('/batch-author-notes/start', async (req, res) => {
    try {
      const {
        novelId,
        chapterNumbers,
        userDirection,
        maxWords,
        threshold,
        skipExisting = true,
      } = req.body;

      if (!novelId) {
        res.status(400).json({ error: '缺少 novelId' });
        return;
      }

      const agent = agents?.get('author-note-writer');
      if (!agent) {
        res.status(500).json({ error: 'author-note-writer Agent 未注册' });
        return;
      }

      if (hasRunningAuthorNoteBatch(novelId)) {
        res.status(409).json({ error: '该小说已有批量作者有话说任务运行中' });
        return;
      }

      const novel = await novelManager.getNovel(novelId);
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

      const chapters = await novelManager.listChapters(novelId);
      if (chapters.length === 0) {
        res.status(400).json({ error: '该小说没有章节' });
        return;
      }

      let toGenerate;
      try {
        toGenerate = await resolveAuthorNoteBatchTargetChapters(deps, {
          novelId,
          chapterNumbers,
          threshold,
          skipExisting,
        });
      } catch (err) {
        res.status(400).json({ error: safeErrorMessage(err, '章节校验失败') });
        return;
      }

      if (toGenerate.length === 0) {
        res.json({ batchId: null, total: 0, message: '没有需要生成的章节' });
        return;
      }

      const aiUsageContext = getAiUsageContext();
      const started = await startAuthorNoteBatchGeneration(deps, {
        novelId,
        novel,
        toGenerate,
        userDirection: typeof userDirection === 'string' ? userDirection.trim() : '',
        maxWords: typeof maxWords === 'number' ? maxWords : undefined,
        agent,
        activeModelClient: modelAccess.client ?? modelClient,
        usageContext: aiUsageContext,
      });

      res.json(started);
    } catch (err: unknown) {
      const message = safeErrorMessage(err, '批量作者有话说生成失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/batch-author-notes/cancel', (req, res) => {
    const { novelId } = req.body;
    const cancelled = cancelAuthorNoteBatch(novelId);
    if (cancelled) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '没有运行中的批量任务' });
    }
  });
}
