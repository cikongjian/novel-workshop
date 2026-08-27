import type { Router } from 'express';
import { z } from 'zod';
import { BillingPaymentService } from '../../../billing/payment-service.js';
import { BillingUserId } from '../../../billing/types.js';
import type { AuthDb } from '../../../auth/types.js';
import { ensureRealNameVerified } from '../helpers/real-name.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

const CreateTopupOrderBody = z.object({
  packageId: z.string().min(1).max(64).optional(),
  points: z.number().int().positive().max(1_000_000).optional(),
  amountCny: z.number().positive().max(100_000).optional(),
  remark: z.string().trim().max(200).optional(),
  channel: z.enum(['alipay', 'wechat']),
}).superRefine((value, ctx) => {
  if (!value.packageId && typeof value.points !== 'number') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'packageId or points is required',
      path: ['packageId'],
    });
  }

  if (value.packageId && (typeof value.points === 'number' || typeof value.amountCny === 'number')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'packageId cannot be combined with custom points or amountCny',
      path: ['packageId'],
    });
  }

  if (!value.packageId && typeof value.amountCny === 'number' && typeof value.points !== 'number') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'amountCny requires points',
      path: ['amountCny'],
    });
  }
});

function parseUserId(raw: string): string | null {
  const parsed = BillingUserId.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

type AccessError = { statusCode: 401 | 403; message: string } | null;

function authorizeUserAccess(req: import('express').Request, userId: string): AccessError {
  const authId = req.auth?.id;
  const authRole = req.auth?.role;
  if (authRole === 'admin') return null;
  if (process.env.NODE_ENV === 'development' && authId === 'dev') return null;
  if (!authId) return { statusCode: 401, message: 'Unauthorized' };
  if (authId !== userId) return { statusCode: 403, message: 'Forbidden' };
  return null;
}

/**
 * 安全地获取请求 IP。
 * 使用 req.ip（受 Express trust proxy 配置控制），不自行解析 X-Forwarded-For。
 */
function resolveRequestIp(req: import('express').Request): string {
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function registerBillingPaymentRoutes(
  router: Router,
  paymentService: BillingPaymentService,
  authDb?: AuthDb,
): void {
  router.post('/users/:userId/topups/orders', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const accessErr = authorizeUserAccess(req, userId);
    if (accessErr) {
      res.status(accessErr.statusCode).json({ error: accessErr.message });
      return;
    }

    const parsed = CreateTopupOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    try {
      await ensureRealNameVerified(authDb, req.auth, 'billing');
      const result = await paymentService.createTopupOrder(userId, {
        ...parsed.data,
        client: {
          userAgent: req.headers['user-agent'],
          ip: resolveRequestIp(req),
          prefersMobile: /iphone|android|mobile/i.test(req.headers['user-agent'] ?? ''),
        },
      });
      res.status(201).json(result);
    } catch (err) {
      const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((err as { statusCode: number }).statusCode)
        : 400;
      res.status(statusCode).json({ error: safeErrorMessage(err, 'Failed to create topup order') });
    }
  });

  router.get('/users/:userId/topups/orders', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const accessErr = authorizeUserAccess(req, userId);
    if (accessErr) {
      res.status(accessErr.statusCode).json({ error: accessErr.message });
      return;
    }

    try {
      res.json(await paymentService.listOrdersForUser(userId, 20));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load topup orders') });
    }
  });

  router.get('/users/:userId/topups/orders/:orderId', async (req, res) => {
    const userId = parseUserId(req.params.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const accessErr = authorizeUserAccess(req, userId);
    if (accessErr) {
      res.status(accessErr.statusCode).json({ error: accessErr.message });
      return;
    }

    try {
      const order = await paymentService.getOrder(req.params.orderId);
      if (!order || order.userId !== userId) {
        res.status(404).json({ error: 'Topup order not found' });
        return;
      }
      res.json(order);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, 'Failed to load topup order') });
    }
  });

  router.post('/payments/callback/alipay', async (req, res) => {
    try {
      await paymentService.handleAlipayCallback(req.body as Record<string, string | string[] | undefined>);
      res.type('text/plain').send('success');
    } catch (err) {
      res.status(400).type('text/plain').send(safeErrorMessage(err, 'failure'));
    }
  });

  router.post('/payments/callback/wechat', async (req, res) => {
    try {
      const rawBody = (req as import('express').Request & { rawBody?: string }).rawBody
        ?? JSON.stringify(req.body ?? {});
      await paymentService.handleWechatCallback(req.headers, rawBody);
      res.json({ code: 'SUCCESS', message: '成功' });
    } catch (err) {
      res.status(400).json({ code: 'FAIL', message: safeErrorMessage(err, 'failure') });
    }
  });
}
