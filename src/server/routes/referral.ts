import { Router } from 'express';
import { z } from 'zod';
import type { ReferralService } from '../../referral/referral-service.js';
import {
  ReferralNotEnabledError,
  ReferralNoQuotaError,
} from '../../referral/referral-service.js';
import { requireAdmin } from '../middleware/auth.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ReferralRoute');

function isDbUnavailable(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return typeof code === 'string' && [
    'ER_NO_SUCH_TABLE',
    'ER_BAD_DB_ERROR',
    'ECONNREFUSED',
    'PROTOCOL_CONNECTION_LOST',
    'PROTOCOL_SEQUENCE_TIMEOUT',
  ].includes(code);
}

const TierUpdateBody = z.object({
  tierName: z.string().min(1).max(50).optional(),
  minRechargeCny: z.number().min(0).optional(),
  referralQuota: z.number().int().min(-1).optional(),
  commissionPct: z.number().min(0).max(100).optional(),
  description: z.string().max(200).nullable().optional(),
});

const ConfigUpdateBody = z.object({
  enabled: z.boolean().optional(),
  registerRewardPoints: z.number().int().min(0).max(100000).optional(),
  registerRewardDelayHours: z.number().int().min(0).max(168).optional(),
  requiredActivityCount: z.number().int().min(1).max(100).optional(),
  commissionDelayDays: z.number().int().min(0).max(30).optional(),
  commissionMinRechargePoints: z.number().int().min(0).max(10000).optional(),
  flagSameIpCount: z.number().int().min(1).max(100).optional(),
  maxMonthlyRegisterRewards: z.number().int().min(1).max(10000).optional(),
  maxMonthlyCommissionPoints: z.number().int().min(0).max(10000000).optional(),
});

export function createReferralRouter(referralService: ReferralService): Router {
  const router = Router();

  const sendDeprecated = (res: import('express').Response, code: string) => {
    res.status(410).json({
      error: 'Referral legacy public endpoint has been deprecated.',
      code,
    });
  };

  router.get('/tiers', async (_req, res) => {
    sendDeprecated(res, 'REFERRAL_PUBLIC_TIERS_DEPRECATED');
  });

  router.get('/me/code', async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) {
      res.status(401).json({ error: '未登录' });
      return;
    }

    try {
      const result = await referralService.getMyReferralCode(userId);
      res.json(result);
    } catch (err) {
      if (err instanceof ReferralNotEnabledError) {
        res.status(403).json({ error: safeErrorMessage(err, '拉新功能未开启') });
      } else if (err instanceof ReferralNoQuotaError) {
        res.status(403).json({ error: safeErrorMessage(err, '无拉新资格或名额已用完') });
      } else if (isDbUnavailable(err)) {
        res.status(503).json({ error: '拉新数据库未就绪' });
      } else {
        res.status(500).json({ error: '获取推荐码失败' });
      }
    }
  });

  router.get('/me/stats', async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) {
      res.status(401).json({ error: '未登录' });
      return;
    }

    try {
      const stats = await referralService.getUserReferralStats(userId);
      res.json(stats);
    } catch (err) {
      if (isDbUnavailable(err)) {
        res.status(503).json({ error: '拉新数据库未就绪，请重启后端或检查 MySQL 配置' });
      } else {
        log.error('getUserReferralStats failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        res.status(500).json({ error: '获取拉新统计失败' });
      }
    }
  });

  router.get('/me/events', async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    sendDeprecated(res, 'REFERRAL_MY_EVENTS_DEPRECATED');
  });

  router.get('/me/commissions', async (req, res) => {
    const userId = req.auth?.id;
    if (!userId) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    sendDeprecated(res, 'REFERRAL_MY_COMMISSIONS_DEPRECATED');
  });

  router.get('/admin/config', requireAdmin(), async (_req, res) => {
    try {
      res.json(await referralService.getAdminConfig());
    } catch {
      res.status(500).json({ error: '获取配置失败' });
    }
  });

  router.put('/admin/config', requireAdmin(), async (req, res) => {
    const parsed = ConfigUpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '参数无效', details: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      const config = await referralService.updateAdminConfig(parsed.data);
      res.json(config);
    } catch {
      res.status(500).json({ error: '更新配置失败' });
    }
  });

  router.get('/admin/tiers', requireAdmin(), async (_req, res) => {
    try {
      res.json(await referralService.getAdminTiers());
    } catch {
      res.status(500).json({ error: '获取席位等级失败' });
    }
  });

  router.put('/admin/tiers/:level', requireAdmin(), async (req, res) => {
    const level = Number.parseInt(String(req.params.level), 10);
    if (!Number.isFinite(level) || level < 0 || level > 10) {
      res.status(400).json({ error: '等级无效' });
      return;
    }

    const parsed = TierUpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '参数无效', details: parsed.error.flatten().fieldErrors });
      return;
    }

    try {
      await referralService.updateAdminTier(level, parsed.data);
      const tiers = await referralService.getAdminTiers();
      res.json(tiers.find((item) => item.tierLevel === level) ?? null);
    } catch {
      res.status(500).json({ error: '更新席位等级失败' });
    }
  });

  router.get('/admin/overview', requireAdmin(), async (_req, res) => {
    sendDeprecated(res, 'REFERRAL_ADMIN_OVERVIEW_DEPRECATED');
  });

  router.get('/admin/events', requireAdmin(), async (_req, res) => {
    sendDeprecated(res, 'REFERRAL_ADMIN_EVENTS_DEPRECATED');
  });

  router.post('/admin/events/:id/status', requireAdmin(), async (_req, res) => {
    sendDeprecated(res, 'REFERRAL_ADMIN_EVENT_STATUS_DEPRECATED');
  });

  return router;
}
