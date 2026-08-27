import type { Router } from 'express';
import {
  CreatorApplicationError,
  listCreatorApplications,
  reviewCreatorApplication,
  submitCreatorApplication,
} from '../../../../auth/creator-application-service.js';
import { CreatorStatusOperationError } from '../../../../auth/creator-service.js';
import { recordComplianceEventFromRequest } from '../../../../compliance/compliance-event-support.js';
import { ValidationError } from '../../../errors.js';
import { requireAdmin } from '../../../middleware/auth.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { ensureRealNameVerified } from '../../helpers/real-name.js';
import {
  ListCreatorApplicationsQuery,
  ReviewCreatorApplicationBody,
  SubmitCreatorApplicationBody,
  type AuthCreatorRouteDeps,
} from './route-support.js';

export function registerAuthCreatorApplicationRoutes(router: Router, deps: AuthCreatorRouteDeps): void {
  const { db, complianceEventManager } = deps;

  router.post('/creator-applications', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }
      await ensureRealNameVerified(db, req.auth, 'creatorApplication');

      const parsed = SubmitCreatorApplicationBody.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('作家申请参数无效', parsed.error.flatten().fieldErrors);
      }

      const profile = await submitCreatorApplication(db, req.auth.id, {
        penName: parsed.data.penName,
        email: parsed.data.email,
        bio: parsed.data.bio,
        reason: parsed.data.reason,
        sampleWork: parsed.data.sampleWork,
      });
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'creator',
        eventType: 'creator_application_submit',
        status: 'success',
        actorUserId: req.auth.id,
        actorUsername: req.auth.username,
        actorRole: req.auth.role,
        targetType: 'user',
        targetId: req.auth.id,
        targetLabel: parsed.data.penName,
        detail: {
          email: parsed.data.email,
          reasonLength: parsed.data.reason.length,
          sampleWorkLength: parsed.data.sampleWork?.length ?? 0,
          creatorStatus: profile.creatorStatus,
        },
      });
      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof CreatorApplicationError || error instanceof CreatorStatusOperationError) {
        next(new ValidationError(error.message));
        return;
      }
      next(error);
    }
  });

  router.get('/creator-applications', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = ListCreatorApplicationsQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('作家申请查询参数无效', parsed.error.flatten().fieldErrors);
      }

      const result = await listCreatorApplications(db, parsed.data);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/creator-applications/:applicationId/review', requireAdmin(), async (req, res, next) => {
    try {
      const parsed = ReviewCreatorApplicationBody.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('作家申请审核参数无效', parsed.error.flatten().fieldErrors);
      }

      const result = await reviewCreatorApplication(db, String(req.params.applicationId), {
        status: parsed.data.status,
        adminNote: parsed.data.adminNote,
        operatorId: req.auth!.id,
      });
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'creator',
        eventType: 'creator_application_review',
        status: parsed.data.status === 'approved' ? 'success' : 'rejected',
        actorUserId: req.auth!.id,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'creator_application',
        targetId: String(req.params.applicationId),
        targetLabel: result.profile.penName || result.profile.username,
        detail: {
          reviewStatus: parsed.data.status,
          reviewedUserId: result.profile.id,
          applicationStatus: result.application.status,
          adminNote: parsed.data.adminNote || null,
        },
      });
      res.json(result);
    } catch (error) {
      if (error instanceof CreatorApplicationError) {
        if (error.statusCode === 404) {
          res.status(404).json({ error: safeErrorMessage(error, '申请不存在') });
          return;
        }
        next(new ValidationError(error.message));
        return;
      }
      next(error);
    }
  });
}
