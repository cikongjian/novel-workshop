import type { Router } from 'express';
import { registerBatchTitleRoutes } from './title-backfill-routes.js';
import { registerSingleTitleRoutes } from './title-generate-routes.js';
export type { ChapterTitleDeps } from './title-route-support.js';

export function registerTitleRoutes(router: Router, deps: import('./title-route-support.js').ChapterTitleDeps): void {
  registerSingleTitleRoutes(router, deps);
  registerBatchTitleRoutes(router, deps);
}
