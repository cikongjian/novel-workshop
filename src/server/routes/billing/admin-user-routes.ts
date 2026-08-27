import type { Router } from 'express';
import { z } from 'zod';
import { BillingUserId } from '../../../billing/types.js';
import type { BillingService } from '../../../billing/billing-service.js';
import { requireAdmin } from '../../middleware/auth.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('AUDIT');

const AdjustUserPointsBody = z.object({
  deltaPoints: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, {
    message: 'deltaPoints cannot be 0',
  }),
  remark: z.string().trim().max(200).optional(),
});

const UpdateUserTrialQuotaBody = z.object({
  remainingDelta: z.number().int().min(-100_000_000).max(100_000_000).default(0),
  totalDelta: z.number().int().min(-100_000_000).max(100_000_000).default(0),
}).refine((value) => value.remainingDelta !== 0 || value.totalDelta !== 0, {
  message: 'remainingDelta or totalDelta is required',
});

function parseUserId(raw: string): string | null {
  const parsed = BillingUserId.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function pickRouteParam(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw ?? '';
}

export function registerBillingAdminUserRoutes(router: Router, service: BillingService): void {
  router.post('/admin/users/:userId/trial-quota', requireAdmin(), async (req, res) => {
    const userId = parseUserId(pickRouteParam(req.params.userId));
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const parsed = UpdateUserTrialQuotaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    try {
      logger.info('Admin update trial quota', {
        operatorId: req.auth?.id ?? 'unknown',
        operatorIp: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
        timestamp: new Date().toISOString(),
        targetUserId: userId,
        remainingDelta: parsed.data.remainingDelta,
        totalDelta: parsed.data.totalDelta,
      });
      res.json(await service.adjustUserTrialQuota(userId, parsed.data));
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to update trial quota') });
    }
  });

  router.post('/admin/users/:userId/adjust', requireAdmin(), async (req, res) => {
    const userId = parseUserId(pickRouteParam(req.params.userId));
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const parsed = AdjustUserPointsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    try {
      // 记录审计信息
      const auditInfo = {
        operatorId: req.auth?.id ?? 'unknown',
        operatorIp: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
        timestamp: new Date().toISOString(),
        targetUserId: userId,
        deltaPoints: parsed.data.deltaPoints,
        remark: parsed.data.remark,
      };

      // 记录到审计日志
      logger.info('Admin adjust points', auditInfo);

      const result = await service.adjustPoints(userId, parsed.data.deltaPoints, {
        remark: parsed.data.remark,
        operatorId: req.auth?.id,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, 'Failed to adjust points') });
    }
  });
}
