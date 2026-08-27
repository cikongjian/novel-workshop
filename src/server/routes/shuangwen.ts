import { Router } from 'express';
import type { ShuangwenDeps } from './handlers/shuangwen/types.js';
import { registerPreviewRoutes } from './handlers/shuangwen/preview-handler.js';
import { registerApplyRoutes } from './handlers/shuangwen/apply-handler.js';
import { registerCreateRoutes } from './handlers/shuangwen/create-handler.js';
import { registerCreateAsyncRoutes } from './handlers/shuangwen/create-async-handler.js';
import { registerGenerateChapterRoutes } from './handlers/shuangwen/generate-chapter-handler.js';

/**
 * 爽文管线 API
 * prefix: /api/shuangwen
 */
export function createShuangwenRouter(deps: ShuangwenDeps): Router {
  const router = Router();

  registerPreviewRoutes(router, deps);
  registerApplyRoutes(router, deps);
  registerCreateRoutes(router, deps);
  registerCreateAsyncRoutes(router, deps);
  registerGenerateChapterRoutes(router, deps);

  return router;
}

// Re-export ShuangwenDeps type for backward compatibility
export type { ShuangwenDeps };
