import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { registerRewriteExecutionRoutes } from './rewrite-execution-routes.js';
import { registerRewritePreviewRoutes } from './rewrite-preview-routes.js';
import type { CachedRewritePreview } from './rewrite-route-support.js';

export function registerRewriteRoutes(router: Router, deps: GenerateDeps): void {
  const previewCache = new Map<string, CachedRewritePreview>();

  registerRewritePreviewRoutes(router, deps, previewCache);
  registerRewriteExecutionRoutes(router, deps);
}
