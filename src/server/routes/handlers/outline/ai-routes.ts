import type { Router } from 'express';
import { registerOutlineAnalyzeRoutes } from './analyze-routes.js';
import { registerOutlineExtendRoutes } from './extend-routes.js';
import { registerOutlineGenerateRoutes } from './generate-routes.js';
import { registerOutlineSyncRoutes } from './sync-routes.js';
export type { OutlineAiRouteDeps } from './ai-route-support.js';

export function registerOutlineAiRoutes(
  router: Router,
  deps: import('./ai-route-support.js').OutlineAiRouteDeps,
): void {
  registerOutlineGenerateRoutes(router, deps);
  registerOutlineExtendRoutes(router, deps);
  registerOutlineSyncRoutes(router, deps);
  registerOutlineAnalyzeRoutes(router, deps);
}
