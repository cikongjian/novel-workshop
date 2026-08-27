import type { Router } from 'express';
import { registerAuthCreatorApplicationRoutes } from './handlers/auth-creator/application-routes.js';
import { registerAuthCreatorInviteRoutes } from './handlers/auth-creator/invite-routes.js';
import { registerAuthCreatorStatusRoutes } from './handlers/auth-creator/status-routes.js';
import type { AuthCreatorRouteDeps } from './handlers/auth-creator/route-support.js';

export function registerAuthCreatorRoutes(router: Router, deps: AuthCreatorRouteDeps): void {
  registerAuthCreatorApplicationRoutes(router, deps);
  registerAuthCreatorInviteRoutes(router, deps);
  registerAuthCreatorStatusRoutes(router, deps);
}
