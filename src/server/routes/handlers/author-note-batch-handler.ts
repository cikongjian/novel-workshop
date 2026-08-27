import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { registerAuthorNoteBatchDetectRoutes } from './author-note-batch-detect-routes.js';
import { registerAuthorNoteBatchJobRoutes } from './author-note-batch-job-routes.js';

export function registerAuthorNoteBatchRoutes(router: Router, deps: GenerateDeps): void {
  registerAuthorNoteBatchDetectRoutes(router, deps);
  registerAuthorNoteBatchJobRoutes(router, deps);
}
