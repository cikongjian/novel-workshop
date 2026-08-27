import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { registerGenerateChapterRoutes } from './chapter-generate-routes.js';
import { registerResizeChapterRoutes } from './chapter-resize-routes.js';
import { registerReviseChapterRoutes } from './chapter-revise-routes.js';

export function registerChapterRoutes(router: Router, deps: GenerateDeps): void {
  registerGenerateChapterRoutes(router, deps);
  registerReviseChapterRoutes(router, deps);
  registerResizeChapterRoutes(router, deps);
}
