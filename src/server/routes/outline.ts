import { Router } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import { checkNovelAccess } from '../middleware/novel-access.js';
import type { OutlineDeps } from './handlers/outline/route-types.js';
import { registerOutlineReadRoutes } from './handlers/outline/read-routes.js';
import { registerOutlineAiRoutes } from './handlers/outline/ai-routes.js';

/**
 * 创建大纲路由
 * 前缀: /api/novels/:novelId/outline
 */
export function createOutlineRouter(depsOrManager: NovelManager | OutlineDeps): Router {
  // 兼容旧调用方式：直接传 NovelManager
  const deps: OutlineDeps = 'getNovel' in depsOrManager
    ? { novelManager: depsOrManager as NovelManager }
    : depsOrManager as OutlineDeps;
  const { novelManager, agents, modelClient, broadcast } = deps;
  const router = Router({ mergeParams: true });

  router.use(async (req, res, next) => {
    const novelId = (req.params as Record<string, string>).novelId;
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    next();
  });
  registerOutlineReadRoutes(router, { novelManager });
  registerOutlineAiRoutes(router, {
    novelManager,
    agents,
    modelClient,
    broadcast,
    authDb: deps.authDb,
  });

  return router;
}
