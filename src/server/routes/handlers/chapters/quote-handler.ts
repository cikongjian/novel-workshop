import type { Router } from 'express';
import { registerQuoteCleanupRoutes } from './quote-cleanup-routes.js';
export type { ChapterQuoteDeps } from './quote-route-support.js';

export function registerQuoteRoutes(router: Router, deps: import('./quote-route-support.js').ChapterQuoteDeps): void {
  registerQuoteCleanupRoutes(router, deps);
}
