import { Router } from 'express';
import { registerActiveSyncRoutes } from './handlers/sync/active-routes.js';
import { registerPassiveSyncRoutes } from './handlers/sync/passive-routes.js';
import type { SyncRouterDeps } from './handlers/sync/route-support.js';

export function createSyncRouter(deps: SyncRouterDeps): Router {
  const router = Router();

  registerPassiveSyncRoutes(router, deps);
  registerActiveSyncRoutes(router, deps);

  return router;
}
