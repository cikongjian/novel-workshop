import type { Router } from 'express';
import type { BillingService } from '../../../billing/billing-service.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import {
  EstimateBody,
  sendDeprecated,
} from './route-support.js';

export function registerBillingPublicRoutes(router: Router, service: BillingService): void {
  router.get('/pricing', async (_req, res) => {
    try {
      res.json(await service.getPricingCatalog());
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load pricing') });
    }
  });

  router.get('/rules', async (_req, res) => sendDeprecated(res, 'BILLING_RULES_DEPRECATED'));
  router.get('/packages', async (_req, res) => sendDeprecated(res, 'BILLING_PACKAGES_DEPRECATED'));

  router.post('/estimate', async (req, res) => {
    const parsed = EstimateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    try {
      res.json(await service.estimate(parsed.data));
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to estimate billing') });
    }
  });
}
