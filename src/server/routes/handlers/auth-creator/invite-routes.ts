import type { Router } from 'express';
import { CreatorStatusOperationError, redeemCreatorInviteCode } from '../../../../auth/creator-service.js';
import { recordComplianceEventFromRequest } from '../../../../compliance/compliance-event-support.js';
import { InvalidInviteCodeError } from '../../../../auth/user-service.js';
import { ValidationError } from '../../../errors.js';
import { RedeemCreatorInviteBody, type AuthCreatorRouteDeps } from './route-support.js';

export function registerAuthCreatorInviteRoutes(router: Router, deps: AuthCreatorRouteDeps): void {
  const { db, complianceEventManager } = deps;

  router.post('/creator-invite/redeem', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }

      const parsed = RedeemCreatorInviteBody.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('邀请码参数无效', parsed.error.flatten().fieldErrors);
      }

      const profile = await redeemCreatorInviteCode(db, req.auth.id, parsed.data.inviteCode);
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'creator',
        eventType: 'creator_invite_redeem',
        status: 'success',
        actorUserId: req.auth.id,
        actorUsername: req.auth.username,
        actorRole: req.auth.role,
        targetType: 'user',
        targetId: req.auth.id,
        targetLabel: profile.penName || profile.username,
        detail: {
          inviteCodeLength: parsed.data.inviteCode.length,
          creatorStatus: profile.creatorStatus,
        },
      });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof InvalidInviteCodeError || error instanceof CreatorStatusOperationError) {
        next(new ValidationError(error.message));
        return;
      }
      next(error);
    }
  });
}
