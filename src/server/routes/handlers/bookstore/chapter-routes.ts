import type { Router } from 'express';
import { registerBookstoreChapterPublishRoutes } from './chapter-publish-routes.js';
import { registerBookstoreChapterScheduleRoutes } from './chapter-schedule-routes.js';
export type { BookstoreChapterRouteDeps } from './chapter-route-support.js';

export function registerBookstoreChapterRoutes(
  router: Router,
  deps: import('./chapter-route-support.js').BookstoreChapterRouteDeps,
): void {
  registerBookstoreChapterPublishRoutes(router, deps);
  registerBookstoreChapterScheduleRoutes(router, deps);
}
