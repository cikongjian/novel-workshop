import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AuthDb } from '../../auth/types.js';
import type { EmailService } from '../../email/email-service.js';
import {
  submitApplication,
  listApplications,
  approveApplication,
  rejectApplication,
  ApplicationError,
} from '../../auth/application-service.js';
import { requireAdmin } from '../middleware/auth.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ApplicationRoutes');

const ApplyBody = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
  phone: z.string().trim().max(20).optional(),
  identityLabel: z.string().trim().max(50).optional(),
  reason: z.string().trim().max(1000).optional(),
  captchaId: z.string().trim().min(1),
  captchaText: z.string().trim().min(1),
  captchaDuration: z.coerce.number().int().positive().optional(),
});

const ListQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const ReviewBody = z.object({
  adminNote: z.string().trim().max(500).optional(),
});

export interface ApplicationRouteDeps {
  db: AuthDb;
  getEmailService?: () => EmailService | undefined;
  verifyCaptcha?: (captchaId: string, captchaText: string) => Promise<boolean>;
  verifySliderCaptcha?: (challengeId: string, position: number, durationMs: number) => Promise<boolean>;
  getPlatformUrl?: () => string | undefined;
}

function resolvePlatformLoginUrl(raw: string | undefined, req: Request): string {
  const configured = raw?.trim();
  if (!configured) {
    return `${req.protocol}://${req.get('host')}/login`;
  }

  try {
    const url = new URL(configured);
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/login';
    }
    return url.toString();
  } catch {
    return configured;
  }
}

function sendKnownError(res: import('express').Response, error: unknown, fallbackMessage: string): boolean {
  if (error instanceof ApplicationError) {
    res.status(error.statusCode).json({ error: safeErrorMessage(error, fallbackMessage) });
    return true;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.errors[0]?.message ?? fallbackMessage });
    return true;
  }
  return false;
}

export function createApplicationsRouter(deps: ApplicationRouteDeps): Router {
  const router = Router();

  router.post('/apply', async (req, res, next) => {
    try {
      const body = ApplyBody.parse(req.body);

      if (body.captchaDuration !== undefined && deps.verifySliderCaptcha) {
        const position = Number.parseFloat(body.captchaText);
        if (Number.isNaN(position)) {
          res.status(400).json({ error: 'Invalid slider captcha payload.' });
          return;
        }

        const valid = await deps.verifySliderCaptcha(body.captchaId, position, body.captchaDuration);
        if (!valid) {
          res.status(400).json({ error: 'Captcha verification failed or expired.' });
          return;
        }
      } else if (deps.verifyCaptcha) {
        const valid = await deps.verifyCaptcha(body.captchaId, body.captchaText);
        if (!valid) {
          res.status(400).json({ error: 'Captcha verification failed or expired.' });
          return;
        }
      }

      await submitApplication(deps.db, {
        email: body.email,
        name: body.name,
        phone: body.phone,
        identityLabel: body.identityLabel,
        reason: body.reason,
      });

      res.status(201).json({
        ok: true,
        message: 'Application submitted. We will email the invite code after approval.',
      });
    } catch (error) {
      if (sendKnownError(res, error, 'Failed to submit application.')) {
        return;
      }
      next(error);
    }
  });

  router.get('/', requireAdmin(), async (req, res, next) => {
    try {
      const query = ListQuery.parse(req.query);
      const result = await listApplications(deps.db, query);
      res.json(result);
    } catch (error) {
      if (sendKnownError(res, error, 'Failed to load applications.')) {
        return;
      }

      log.error('failed to load invite applications', {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  router.post('/:id/approve', requireAdmin(), async (req, res, next) => {
    try {
      const appId = String(req.params.id);
      const body = ReviewBody.parse(req.body);
      const { application, inviteCode } = await approveApplication(
        deps.db,
        appId,
        req.auth!.id,
        body.adminNote,
      );

      let emailSent = false;
      const emailService = deps.getEmailService?.();
      if (emailService) {
        try {
          const url = resolvePlatformLoginUrl(deps.getPlatformUrl?.(), req);
          await emailService.sendInviteCodeEmail(application.email, application.name, inviteCode, url);
          emailSent = true;
        } catch (error) {
          log.error('failed to send invite code email', {
            appId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      res.json({ ok: true, inviteCode, emailSent });
    } catch (error) {
      if (sendKnownError(res, error, 'Failed to approve application.')) {
        return;
      }
      next(error);
    }
  });

  router.post('/:id/reject', requireAdmin(), async (req, res, next) => {
    try {
      const appId = String(req.params.id);
      const body = ReviewBody.parse(req.body);
      const application = await rejectApplication(
        deps.db,
        appId,
        req.auth!.id,
        body.adminNote,
      );

      let emailSent = false;
      const emailService = deps.getEmailService?.();
      if (emailService) {
        try {
          await emailService.sendRejectionEmail(application.email, application.name, body.adminNote);
          emailSent = true;
        } catch (error) {
          log.error('failed to send rejection email', {
            appId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      res.json({ ok: true, emailSent });
    } catch (error) {
      if (sendKnownError(res, error, 'Failed to reject application.')) {
        return;
      }
      next(error);
    }
  });

  return router;
}
