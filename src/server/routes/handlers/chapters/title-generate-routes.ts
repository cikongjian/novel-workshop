import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import { generateAndAdoptChapterTitle, type ChapterTitleDeps } from './title-route-support.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('chapter-title-routes');

export function registerSingleTitleRoutes(router: Router, deps: ChapterTitleDeps): void {
  router.post('/:num/generate-title', async (req, res) => {
    const { authDb, modelClient, novelManager } = deps;
    if (!deps.agents) {
      res.status(503).json({ error: 'AI Agent 尚未就绪' });
      return;
    }
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const num = Number(req.params.num);

      let activeModelClient = modelClient;
      if (authDb) {
        const novel = await novelManager.getNovel(novelId);
        if (novel) {
          const modelAccess = await resolveUserModelAccess({
            authDb,
            userId: req.auth?.id,
            headers: req.headers,
            novel,
          });
          activeModelClient = modelAccess.client ?? modelClient;
        }
      }
      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 模型未配置，请先在设置页配置 API Key 或在"我的→自有模型"中添加' });
        return;
      }

      const resolvedDeps: ChapterTitleDeps = { ...deps, modelClient: activeModelClient };
      const result = await generateAndAdoptChapterTitle({
        deps: resolvedDeps,
        novelId,
        chapterNumber: num,
        adoptionMode: 'manual',
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '生成标题失败');
      const status = message.includes('不存在') ? 404 : message.includes('未就绪') || message.includes('未配置') ? 503 : 500;
      log.error('章节标题生成失败', {
        chapterNumber: Number(req.params.num),
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(status).json({ error: message });
    }
  });
}
