import type { Request, Response, NextFunction } from 'express';
import type { Router } from 'express';
import type { AuthDb } from '../../../auth/types.js';
import type { BillingService } from '../../../billing/billing-service.js';
import { ensureRealNameVerified } from '../helpers/real-name.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import {
  authorizeUserAccess,
  LedgerQuery,
  parseUserId,
  RedeemCodeBody,
  sendDeprecated,
} from './route-support.js';

/** 兑换码暴力枚举防护：每用户 10 分钟内最多 10 次尝试 */
const REDEEM_WINDOW_MS = 10 * 60 * 1000;
const REDEEM_MAX_ATTEMPTS = 10;
const redeemAttemptMap = new Map<string, { count: number; resetAt: number }>();
const redeemCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of redeemAttemptMap) {
    if (now >= entry.resetAt) redeemAttemptMap.delete(key);
  }
}, REDEEM_WINDOW_MS * 2);
redeemCleanupTimer.unref();

function redeemRateLimit(req: Request, res: Response, next: NextFunction): void {
  const userId = req.auth?.id ?? req.ip ?? 'unknown';
  const now = Date.now();
  let entry = redeemAttemptMap.get(userId);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + REDEEM_WINDOW_MS };
  }
  entry.count += 1;
  redeemAttemptMap.set(userId, entry);
  if (entry.count > REDEEM_MAX_ATTEMPTS) {
    res.status(429).json({
      error: '兑换尝试过于频繁，请稍后再试',
      code: 'REDEEM_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }
  next();
}

type BillingUserRouteDeps = {
  authDb?: AuthDb;
  service: BillingService;
};

export function registerBillingUserRoutes(
  router: Router,
  { authDb, service }: BillingUserRouteDeps,
): void {
  router.post('/my/redeem-code', redeemRateLimit, async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsed = RedeemCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    try {
      await ensureRealNameVerified(authDb, req.auth, 'billing');
      res.json(await service.redeemCode(userId, parsed.data.code));
    } catch (err) {
      const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((err as { statusCode: number }).statusCode)
        : 400;
      res.status(statusCode).json({ error: safeErrorMessage(err, 'Failed to redeem code') });
    }
  });

  router.get('/my/overview', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    sendDeprecated(res, 'BILLING_MY_OVERVIEW_DEPRECATED');
  });

  router.get('/my/account', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    sendDeprecated(res, 'BILLING_MY_ACCOUNT_DEPRECATED');
  });

  router.get('/my/ledger', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    sendDeprecated(res, 'BILLING_MY_LEDGER_DEPRECATED');
  });

  router.get('/my/redemption-codes', async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      res.json(await service.listRedemptionCodesForUser(userId));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load redemption codes') });
    }
  });

  router.get('/users/:userId/overview', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const accessErr = authorizeUserAccess(req, userId);
    if (accessErr) {
      res.status(403).json({ error: accessErr });
      return;
    }
    const parsed = LedgerQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
      return;
    }
    try {
      res.json(await service.getOverview(userId, parsed.data.limit ?? 20));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load billing overview') });
    }
  });

  router.get('/users/:userId/account', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const accessErr = authorizeUserAccess(req, userId);
    if (accessErr) {
      res.status(403).json({ error: accessErr });
      return;
    }
    sendDeprecated(res, 'BILLING_USER_ACCOUNT_DEPRECATED');
  });

  router.get('/users/:userId/ledger', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const accessErr = authorizeUserAccess(req, userId);
    if (accessErr) {
      res.status(403).json({ error: accessErr });
      return;
    }
    sendDeprecated(res, 'BILLING_USER_LEDGER_DEPRECATED');
  });
}
