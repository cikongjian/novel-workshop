import { Router } from 'express';
import { registerShortStoryGenerationRoutes } from './handlers/short-story/generation-routes.js';
import { registerShortStoryReadRoutes } from './handlers/short-story/read-routes.js';
import type { ShortStoryRouterDeps } from './handlers/short-story/route-support.js';

export function createShortStoryRouter(deps: ShortStoryRouterDeps): Router {
  const router = Router();

  registerShortStoryGenerationRoutes(router, deps);
  registerShortStoryReadRoutes(router, deps);

  return router;
}
