import type { Router } from 'express';
import {
  createInviteCode,
  deleteInviteCodes,
  listInviteCodes,
} from '../../../../auth/user-service.js';
import {
  deleteAdminUser,
  listUsers,
  setUserStatus,
} from '../../../../auth/admin-user-service.js';
import { getAdminCostOverview } from '../../../../auth/admin-cost-overview-service.js';
import { getAdminUserInsights } from '../../../../auth/admin-user-insights-service.js';
import { requireAdmin } from '../../../middleware/auth.js';
import { ValidationError } from '../../../errors.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('AuthAdminRoutes');
import {
  attachUserGenerationStats,
  attachUserBillingAndQuota,
  CreateInviteCodesBody,
  DeleteInviteCodesBody,
  ListUsersQuery,
  SetUserStatusBody,
  type AuthRouteDeps,
} from './route-support.js';

export function registerAuthAdminRoutes(router: Router, deps: AuthRouteDeps): void {
  const { billingService, dataDir, db, novelManager, referralService } = deps;

  router.post('/invite-codes', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = CreateInviteCodesBody.safeParse(req.body);
      const count = parsed.success ? parsed.data.count : 1;
      const codes: string[] = [];
      for (let index = 0; index < count; index += 1) {
        codes.push(await createInviteCode(db, req.auth!.id));
      }
      res.status(201).json({ codes });
    } catch (error) {
      next(error);
    }
  });

  router.get('/invite-codes', requireAdmin(), async (req, res, next) => {
    try {
      res.json(await listInviteCodes(db, req.auth!.id));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/invite-codes', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = DeleteInviteCodesBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: '请提供要删除的邀请码列表' });
        return;
      }
      const deleted = await deleteInviteCodes(db, parsed.data.codes, req.auth!.id);
      res.json({ deleted });
    } catch (error) {
      next(error);
    }
  });

  router.get('/users', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = ListUsersQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('查询参数无效', parsed.error.flatten().fieldErrors);
      }
      const users = await listUsers(db, parsed.data);
      const withStats = await attachUserGenerationStats(users, novelManager);
      const withBilling = await attachUserBillingAndQuota(withStats, billingService);
      res.json(withBilling);
    } catch (error) {
      next(error);
    }
  });

  router.get('/users/:userId/insights', requireAdmin(), async (req, res, next) => {
    try {
      const insights = await getAdminUserInsights(String(req.params.userId), {
        db,
        billingService,
        referralService,
        novelManager,
      });
      if (!insights) {
        res.status(404).json({ error: '用户不存在' });
        return;
      }
      res.json(insights);
    } catch (error) {
      log.error('failed to load admin user insights', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: '加载用户洞察失败，请稍后重试' });
    }
  });

  router.get('/admin/cost-overview', requireAdmin(), async (_req, res, next) => {
    try {
      if (!novelManager) {
        res.status(503).json({ error: '小说管理器未就绪' });
        return;
      }
      res.json(await getAdminCostOverview({
        db,
        dataDir,
        novelManager,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:userId/status', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = SetUserStatusBody.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('状态参数无效', parsed.error.flatten().fieldErrors);
      }
      await setUserStatus(db, String(req.params.userId), parsed.data.status, req.auth!.id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/users/:userId', requireAdmin(), async (req, res, next) => {
    try {
      await deleteAdminUser(db, String(req.params.userId), req.auth!.id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}
