import { Router } from 'express';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { registerFactGraphReadRoutes } from './handlers/fact-graph/read-routes.js';
import { registerFactGraphRebuildRoutes } from './handlers/fact-graph/rebuild-routes.js';
import { createFactGraphAccessMiddleware } from './handlers/fact-graph/route-support.js';

export function createFactGraphRouter(novelManager: NovelManager, novelMemory?: NovelMemory): Router {
  const router = Router({ mergeParams: true });
  router.use(createFactGraphAccessMiddleware(novelManager));
  registerFactGraphReadRoutes(router, novelManager, novelMemory);
  registerFactGraphRebuildRoutes(router, novelManager, novelMemory);

  return router;
}
