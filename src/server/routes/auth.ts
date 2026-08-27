import { Router } from 'express';
import { registerAuthAdminRoutes } from './handlers/auth/admin-routes.js';
import { registerAuthProfileRoutes } from './handlers/auth/profile-routes.js';
import { type AuthRouteDeps } from './handlers/auth/route-support.js';
import { registerAuthSessionRoutes } from './handlers/auth/session-routes.js';
import { registerTrialAccountRoutes } from './handlers/auth/trial-account-routes.js';
import { registerAuthCreatorRoutes } from './auth-creator-routes.js';
import { registerAuthUserApiRoutes } from './auth-user-api-routes.js';
import type { TrialAccountService } from '../../auth/trial-account-service.js';

export { type AuthRouteDeps } from './handlers/auth/route-support.js';

export function createAuthRouter(deps: AuthRouteDeps, trialAccountService?: TrialAccountService): Router {
  const router = Router();

  registerAuthSessionRoutes(router, deps, trialAccountService);
  registerAuthAdminRoutes(router, deps);
  registerAuthProfileRoutes(router, deps);
  registerAuthCreatorRoutes(router, {
    db: deps.db,
    complianceEventManager: deps.complianceEventManager,
  });
  registerAuthUserApiRoutes(router, deps.db);

  if (trialAccountService) {
    registerTrialAccountRoutes(router, deps, trialAccountService);
  }

  return router;
}
