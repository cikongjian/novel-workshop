import { Router } from 'express';
import { registerAnchorCharacterPoolRoutes } from './handlers/universe-anchor/character-pool-routes.js';
import { registerAnchorCrudRoutes } from './handlers/universe-anchor/crud-routes.js';
import { registerAnchorGenerationRoutes } from './handlers/universe-anchor/generation-routes.js';
import { registerAnchorLinkRoutes } from './handlers/universe-anchor/link-routes.js';
import type { AnchorRouteDeps } from './handlers/universe-anchor/route-support.js';

export function createAnchorRouter(deps: AnchorRouteDeps) {
  const router = Router();

  registerAnchorCrudRoutes(router, deps);
  registerAnchorGenerationRoutes(router, deps);
  registerAnchorCharacterPoolRoutes(router, deps);
  registerAnchorLinkRoutes(router, deps);

  return router;
}
