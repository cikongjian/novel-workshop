import type { Router } from 'express';
import type { BillingService } from '../../../billing/billing-service.js';
import { requireAdmin } from '../../middleware/auth.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { z } from 'zod';
import {
  BatchStatusBody,
  BillingConfigBody,
  BillingPageQuery,
  buildNextBillingConfig,
  CodeStatusBody,
  ManualCodeBody,
} from './route-support.js';

const TrialQuotaBody = z.object({
  trialQuotaChars: z.number().int().min(0),
});

export function registerBillingAdminRoutes(router: Router, service: BillingService): void {
  router.get('/admin/config', requireAdmin(), async (_req, res) => {
    try {
      res.json(await service.getSystemConfig());
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load billing config') });
    }
  });

  router.put('/admin/config', requireAdmin(), async (req, res) => {
    const parsed = BillingConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    try {
      res.json(await service.updateSystemConfig(buildNextBillingConfig(parsed.data)));
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to save billing config') });
    }
  });

  // PUT /api/billing/admin/trial-quota — 单独更新试用配额
  router.put('/admin/trial-quota', requireAdmin(), async (req, res) => {
    const parsed = TrialQuotaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    try {
      const current = await service.getSystemConfig();
      await service.updateSystemConfig({
        ...current,
        trialQuotaChars: parsed.data.trialQuotaChars,
        updatedAt: new Date().toISOString(),
      });
      res.json({ ok: true, trialQuotaChars: parsed.data.trialQuotaChars });
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to update trial quota') });
    }
  });

  router.get('/admin/redemption-codes', requireAdmin(), async (_req, res) => {
    try {
      res.json(await service.listAllRedemptionCodes());
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load redemption codes') });
    }
  });

  router.get('/admin/redemption-codes-page', requireAdmin(), async (req, res) => {
    const parsed = BillingPageQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
      return;
    }
    try {
      res.json(await service.listRedemptionCodesPage(parsed.data));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load redemption codes') });
    }
  });

  router.get('/admin/redemption-batches', requireAdmin(), async (req, res) => {
    const parsed = BillingPageQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
      return;
    }
    try {
      res.json(await service.listRedemptionCodeBatchesPage(parsed.data));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load redemption batches') });
    }
  });

  router.get('/admin/redemption-batches/:batchKey/codes', requireAdmin(), async (req, res) => {
    const rawBatchKey = req.params.batchKey;
    const batchKey = typeof rawBatchKey === 'string' ? rawBatchKey.trim() : '';
    if (!batchKey) {
      res.status(400).json({ error: 'Invalid batch key' });
      return;
    }
    try {
      res.json(await service.listRedemptionCodesByBatch(batchKey));
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to load redemption batch codes') });
    }
  });

  router.post('/admin/redemption-codes/manual', requireAdmin(), async (req, res) => {
    const parsed = ManualCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    try {
      res.status(201).json(await service.createManualRedemptionCodes(parsed.data));
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to create manual codes') });
    }
  });

  router.post('/admin/redemption-codes/:codeId/status', requireAdmin(), async (req, res) => {
    const rawCodeId = req.params.codeId;
    const codeId = typeof rawCodeId === 'string' ? rawCodeId.trim() : '';
    if (!codeId) {
      res.status(400).json({ error: 'Invalid code id' });
      return;
    }
    const parsed = CodeStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    try {
      res.json(await service.updateRedemptionCodeStatus(codeId, parsed.data.status));
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to update code status') });
    }
  });

  router.post('/admin/redemption-batches/:batchKey/status', requireAdmin(), async (req, res) => {
    const rawBatchKey = req.params.batchKey;
    const batchKey = typeof rawBatchKey === 'string' ? rawBatchKey.trim() : '';
    if (!batchKey) {
      res.status(400).json({ error: 'Invalid batch key' });
      return;
    }
    const parsed = BatchStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    try {
      res.json(await service.updateRedemptionCodeBatchStatus(batchKey, parsed.data.status));
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to update batch status') });
    }
  });
}
