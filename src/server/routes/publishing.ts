import { Router } from 'express';
import { z } from 'zod';
import type { PublishingAdvisorService } from '../../publishing/publishing-advisor-service.js';
import { DraftPublishingRecommendationBodySchema } from '../../publishing/publishing-types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { checkNovelAccess } from '../middleware/novel-access.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

type PublishingRouterDeps = {
  publishingAdvisorService: PublishingAdvisorService;
  novelManager: NovelManager;
};

export function createPublishingRouter(deps: PublishingRouterDeps): Router {
  const router = Router();

  function sendDeprecated(res: import('express').Response, code: string) {
    const messageByCode: Record<string, string> = {
      PUBLISHING_OVERVIEW_DEPRECATED: '该平台概览接口已下线，请改用当前按作品/草稿的推荐接口。',
    };
    return res.status(410).json({
      error: messageByCode[code] ?? '该上架推荐接口已下线。',
      code,
    });
  }

  async function ensureNovelAccess(
    req: import('express').Request,
    res: import('express').Response,
    novelId: string,
  ): Promise<boolean> {
    const access = await checkNovelAccess(req, deps.novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return false;
    }
    return true;
  }

  router.get('/overview', async (_req, res) =>
    sendDeprecated(res, 'PUBLISHING_OVERVIEW_DEPRECATED'));

  router.post('/recommend', async (req, res) => {
    try {
      const body = DraftPublishingRecommendationBodySchema.parse(req.body);
      const result = await deps.publishingAdvisorService.recommendDraft(body);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0]?.message ?? '请求参数无效' });
        return;
      }
      const message = safeErrorMessage(error, '草稿平台推荐失败');
      res.status(500).json({ error: message });
    }
  });

  router.get('/novels/:novelId/recommendation', async (req, res) => {
    if (!(await ensureNovelAccess(req, res, req.params.novelId))) {
      return;
    }
    try {
      const result = await deps.publishingAdvisorService.recommendNovel(req.params.novelId);
      res.json(result);
    } catch (error) {
      const isNotFound = error instanceof Error && (error.message.includes('不存在') || error.message.includes('not found'));
      res.status(isNotFound ? 404 : 500).json({ error: safeErrorMessage(error, '小说平台推荐失败') });
    }
  });

  router.get('/novels/:novelId/latest', async (req, res) => {
    if (!(await ensureNovelAccess(req, res, req.params.novelId))) {
      return;
    }
    try {
      const result = await deps.publishingAdvisorService.getSavedRecommendation(req.params.novelId);
      res.json({ recommendation: result });
    } catch (error) {
      const isNotFound = error instanceof Error && (error.message.includes('不存在') || error.message.includes('not found'));
      res.status(isNotFound ? 404 : 500).json({ error: safeErrorMessage(error, '读取已保存推荐失败') });
    }
  });

  router.delete('/novels/:novelId/latest', async (req, res) => {
    if (!(await ensureNovelAccess(req, res, req.params.novelId))) {
      return;
    }
    try {
      await deps.publishingAdvisorService.clearSavedRecommendation(req.params.novelId);
      res.status(204).send();
    } catch (error) {
      const isNotFound = error instanceof Error && (error.message.includes('不存在') || error.message.includes('not found'));
      res.status(isNotFound ? 404 : 500).json({ error: safeErrorMessage(error, '清除已保存推荐失败') });
    }
  });

  return router;
}
