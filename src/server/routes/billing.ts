import { Router } from 'express';
import type { AuthDb } from '../../auth/types.js';
import { BillingService } from '../../billing/billing-service.js';
import type { Database } from 'better-sqlite3';
import { BillingPaymentService } from '../../billing/payment-service.js';
import type { ReferralService } from '../../referral/referral-service.js';
import { registerBillingAdminUserRoutes } from './billing/admin-user-routes.js';
import { registerBillingAdminRoutes } from './billing/admin-routes.js';
import { registerBillingPaymentRoutes } from './billing/payment-routes.js';
import { registerBillingPublicRoutes } from './billing/public-routes.js';
import { registerBillingUserRoutes } from './billing/user-routes.js';

export function createBillingRouter(
  dataDir: string,
  sharedService?: BillingService,
  referralService?: ReferralService,
  authDb?: AuthDb,
  db?: Database,
): Router {
  const router = Router();
  if (!sharedService && !db) throw new Error('createBillingRouter: db is required when sharedService is not provided');
  const service = sharedService ?? new BillingService(dataDir, db!);
  const paymentService = new BillingPaymentService(dataDir, service);

  if (referralService) {
    paymentService.onTopupCredited = (userId, totalPoints) =>
      referralService.onUserRecharged(userId, totalPoints);
  }

  registerBillingAdminUserRoutes(router, service);
  registerBillingPaymentRoutes(router, paymentService, authDb);
  registerBillingPublicRoutes(router, service);
  registerBillingUserRoutes(router, { authDb, service });
  registerBillingAdminRoutes(router, service);

  return router;
}
