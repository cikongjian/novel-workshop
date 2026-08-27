import { Router } from 'express';
import { registerAdaptationDeprecatedRoutes } from './handlers/adaptation/deprecated-routes.js';
import { registerAdaptationGenerationRoutes } from './handlers/adaptation/generation-routes.js';
import { registerAdaptationPackageRoutes } from './handlers/adaptation/package-routes.js';
import {
  resolveAdaptationRouteDeps,
  type AdaptationRouterDeps,
} from './handlers/adaptation/route-support.js';

export { type AdaptationRouterDeps } from './handlers/adaptation/route-support.js';

export function createAdaptationRouter(deps: AdaptationRouterDeps): Router {
  const router = Router({ mergeParams: true });
  const resolvedDeps = resolveAdaptationRouteDeps(deps);

  registerAdaptationDeprecatedRoutes(router, resolvedDeps);
  registerAdaptationGenerationRoutes(router, resolvedDeps);
  registerAdaptationPackageRoutes(router, resolvedDeps);

  return router;
}
