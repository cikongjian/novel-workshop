import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { registerBatchControlRoutes } from './batch-control-routes.js';
import { registerBatchGenerateRoutes } from './batch-generate-routes.js';
import { registerBatchReviseRoutes } from './batch-revise-routes.js';
import { createBatchQueue } from './batch-route-support.js';

export function registerBatchRoutes(router: Router, deps: GenerateDeps): void {
  const batchQueue = createBatchQueue(router);

  registerBatchGenerateRoutes(router, deps, batchQueue);
  registerBatchControlRoutes(router, batchQueue);
  registerBatchReviseRoutes(router, deps);
}
