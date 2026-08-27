/**
 * 互动小说路由 —— 仅做路由注册，handler 逻辑在 handlers/interactive/。
 */
import { Router } from 'express';
import { registerInteractiveConfigRoutes } from './handlers/interactive/config-routes.js';
import type { InteractiveRouteDeps } from './handlers/interactive/config-routes.js';

export function createInteractiveRouter(deps: InteractiveRouteDeps): Router {
  const router = Router();
  registerInteractiveConfigRoutes(router, deps);
  return router;
}
