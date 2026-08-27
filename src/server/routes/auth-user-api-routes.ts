import { Router } from 'express';
import type { AuthDb } from '../../auth/types.js';
import { registerAuthUserApiPolicyRoutes } from './handlers/auth-user-api/policy-routes.js';
import { registerAuthUserApiProfileRoutes } from './handlers/auth-user-api/profile-routes.js';
import { registerAuthUserApiTestRoutes } from './handlers/auth-user-api/test-routes.js';

export function registerAuthUserApiRoutes(router: Router, db: AuthDb): void {
  registerAuthUserApiPolicyRoutes(router, db);
  registerAuthUserApiProfileRoutes(router, db);
  registerAuthUserApiTestRoutes(router, db);
}
