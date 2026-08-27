import { Router } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import {
  buildPublicHomepagePayload,
  getPublishedHomepageChapterPreview,
} from '../../homepage/public-homepage-service.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

export function createHomepageRouter(novelManager: NovelManager): Router {
  const router = Router();

  router.get('/public', async (_req, res) => {
    try {
      const payload = await buildPublicHomepagePayload(novelManager);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取首页展示内容失败') });
    }
  });

  router.get('/public/novels/:novelId/chapters/:chapterNumber', async (req, res) => {
    try {
      const chapterNumber = Number.parseInt(req.params.chapterNumber, 10);
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
        res.status(400).json({ error: '章节号无效' });
        return;
      }

      const payload = await getPublishedHomepageChapterPreview(
        novelManager,
        req.params.novelId,
        chapterNumber,
      );
      if (!payload) {
        res.status(404).json({ error: '未找到已发布的章节预览' });
        return;
      }
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取章节预览失败') });
    }
  });

  return router;
}
