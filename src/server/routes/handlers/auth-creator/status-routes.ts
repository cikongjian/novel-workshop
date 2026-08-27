import type { Router } from 'express';
import { CreatorStatusOperationError, reviewCreatorStatus } from '../../../../auth/creator-service.js';
import { recordComplianceEventFromRequest } from '../../../../compliance/compliance-event-support.js';
import { ValidationError } from '../../../errors.js';
import { requireAdmin } from '../../../middleware/auth.js';
import { ReviewCreatorStatusBody, type AuthCreatorRouteDeps } from './route-support.js';

export function registerAuthCreatorStatusRoutes(router: Router, deps: AuthCreatorRouteDeps): void {
  const { db, complianceEventManager } = deps;

  router.patch('/users/:userId/creator-status', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = ReviewCreatorStatusBody.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('作家状态参数无效', parsed.error.flatten().fieldErrors);
      }

      const profile = await reviewCreatorStatus(db, String(req.params.userId), {
        status: parsed.data.status,
        rejectReason: parsed.data.rejectReason,
        operatorId: req.auth!.id,
      });
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'creator',
        eventType: 'creator_status_review',
        status: parsed.data.status === 'rejected' ? 'rejected' : 'success',
        actorUserId: req.auth!.id,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'user',
        targetId: String(req.params.userId),
        targetLabel: profile.penName || profile.username,
        detail: {
          creatorStatus: parsed.data.status,
          rejectReason: parsed.data.rejectReason ?? null,
        },
      });
      res.json(profile);
    } catch (error) {
      if (error instanceof CreatorStatusOperationError) {
        next(new ValidationError(error.message));
        return;
      }
      next(error);
    }
  });
}
