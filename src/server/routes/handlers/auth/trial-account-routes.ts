import type { Router } from 'express';
import type { TrialAccountService } from '../../../../auth/trial-account-service.js';
import {
  deleteAdminUser,
  setUserStatus,
} from '../../../../auth/admin-user-service.js';
import { requireAdmin } from '../../../middleware/auth.js';
import { z } from 'zod';
import { createLogger } from '../../../../utils/logger.js';
import type { AuthRouteDeps } from './route-support.js';

const log = createLogger('TrialAccountRoutes');

const CreateTrialAccountsBody = z.object({
  count: z.number().int().min(1).max(50).default(1),
  initialPoints: z.number().int().min(0).max(1_000_000).default(2000),
  trialQuotaChars: z.number().int().min(0).max(10_000_000).default(50000),
  expiresAt: z.string().min(1),
  password: z.string().min(1).max(64).optional(),
});

export function registerTrialAccountRoutes(
  router: Router,
  deps: AuthRouteDeps,
  trialAccountService: TrialAccountService,
): void {
  const { billingService, db } = deps;

  // 批量创建体验账号
  router.post('/admin/trial-accounts', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = CreateTrialAccountsBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数无效' });
        return;
      }
      const result = await trialAccountService.createTrialAccounts(
        db,
        billingService,
        parsed.data,
        req.auth!.id,
      );
      res.status(201).json(result);
    } catch (error) {
      log.error('创建体验账号失败', { error: error instanceof Error ? error.message : String(error) });
      next(error);
    }
  });

  // 列出所有体验账号
  router.get('/admin/trial-accounts', requireAdmin(), async (_req, res, next) => {
    try {
      const accounts = await trialAccountService.listAll();
      res.json({ accounts });
    } catch (error) {
      next(error);
    }
  });

  // 删除体验账号
  router.delete('/admin/trial-accounts/:userId', requireAdmin(), async (req, res, next) => {
    try {
      const userId = String(req.params.userId);
      await deleteAdminUser(db, userId, req.auth!.id);
      await trialAccountService.deleteMeta(userId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // 启用/禁用体验账号
  router.patch('/admin/trial-accounts/:userId/status', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = z.object({ status: z.enum(['active', 'disabled']) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: '状态参数无效' });
        return;
      }
      await setUserStatus(db, String(req.params.userId), parsed.data.status, req.auth!.id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}
