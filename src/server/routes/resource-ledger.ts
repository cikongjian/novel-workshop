import { Router } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { StoryStateManager } from '../../novel/story-state-manager.js';
import { checkNovelAccess } from '../middleware/novel-access.js';

export function createResourceLedgerRouter(
  storyStateManager: StoryStateManager,
  novelManager: NovelManager,
): Router {
  const router = Router();
  const sendDeprecated = (res: import('express').Response) => {
    res.status(410).json({
      error: '资源账本公开接口已弃用',
      code: 'RESOURCE_LEDGER_DEPRECATED',
    });
  };

  router.use('/:novelId', async (req, res, next) => {
    const novelId = Array.isArray(req.params.novelId) ? req.params.novelId[0] : req.params.novelId;
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    next();
  });

  // GET /api/resource-ledger/:novelId - 获取资源账本
  router.get('/:novelId', async (_req, res) => sendDeprecated(res));

  // POST /api/resource-ledger/:novelId/entries - 添加资源条目
  router.post('/:novelId/entries', async (_req, res) => sendDeprecated(res));

  // PUT /api/resource-ledger/:novelId/entries/:entryId - 更新资源条目
  router.put('/:novelId/entries/:entryId', async (_req, res) => sendDeprecated(res));

  // DELETE /api/resource-ledger/:novelId/entries/:entryId - 删除资源条目
  router.delete('/:novelId/entries/:entryId', async (_req, res) => sendDeprecated(res));

  // POST /api/resource-ledger/:novelId/transactions - 添加交易记录
  router.post('/:novelId/transactions', async (_req, res) => sendDeprecated(res));

  // GET /api/resource-ledger/:novelId/transactions - 获取交易历史
  router.get('/:novelId/transactions', async (_req, res) => sendDeprecated(res));

  return router;
}
