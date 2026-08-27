import type { Router } from 'express';
import { ConflictError, ValidationError } from '../../../errors.js';
import {
  EmailConflictError,
  changePassword,
  changeUsername,
  getProfile,
  updateProfile,
  WrongPasswordError,
  UsernameConflictError,
} from '../../../../auth/user-service.js';
import {
  getRealNameVerificationPolicy,
  RealNameVerificationCooldownError,
  RealNameVerificationFailedError,
  verifyRealName,
} from '../../../../auth/real-name-service.js';
import { getPasswordPolicy, validatePasswordAgainstPolicy } from '../../../../auth/password-policy.js';
import {
  ChangePasswordInputSchema,
  ChangeUsernameSchema,
  RealNameVerificationSchema,
  UpdateProfileSchema,
  type AuthRouteDeps,
} from './route-support.js';
import {
  auditPublicTextFields,
  buildPublicTextBlockMessage,
} from '../../../../compliance/public-text-moderation.js';
import { buildComplianceRequestContext } from '../../../../compliance/compliance-event-manager.js';
import { recordComplianceEventFromRequest } from '../../../../compliance/compliance-event-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export function registerAuthProfileRoutes(router: Router, deps: AuthRouteDeps): void {
  const { db } = deps;

  router.get('/profile', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }
      const profile = await getProfile(db, req.auth.id);
      if (!profile) {
        res.status(404).json({ error: '用户不存在' });
        return;
      }
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  router.get('/real-name/policy', (_req, res) => {
    res.json(getRealNameVerificationPolicy());
  });

  router.post('/real-name/verify', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }
      const parsed = RealNameVerificationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('实名认证参数无效', parsed.error.flatten().fieldErrors);
      }
      const profile = await verifyRealName(db, req.auth.id, parsed.data);
      await deps.complianceEventManager?.record({
        category: 'real_name',
        eventType: 'real_name_verify',
        status: 'success',
        actorUserId: req.auth.id,
        actorUsername: req.auth.username,
        actorRole: req.auth.role,
        targetType: 'user',
        targetId: req.auth.id,
        targetLabel: req.auth.username,
        request: buildComplianceRequestContext(req),
        detail: {
          realNameMasked: profile.realNameMasked,
          idNumberMasked: profile.realNameIdNumberMasked,
          phoneNumberMasked: profile.realNamePhoneMasked,
        },
      });
      res.json(profile);
    } catch (error) {
      if (req.auth) {
        await deps.complianceEventManager?.record({
          category: 'real_name',
          eventType: 'real_name_verify',
          status: error instanceof RealNameVerificationFailedError ? 'rejected' : 'failure',
          actorUserId: req.auth.id,
          actorUsername: req.auth.username,
          actorRole: req.auth.role,
          targetType: 'user',
          targetId: req.auth.id,
          targetLabel: req.auth.username,
          request: buildComplianceRequestContext(req),
          detail: {
            message: safeErrorMessage(error, String(error)),
          },
        });
      }
      if (error instanceof RealNameVerificationCooldownError) {
        next(new ValidationError(error.message, {
          retryAfterMinutes: error.retryAfterMinutes,
          failedCount: error.failedCount,
          maxFailedAttempts: error.maxFailedAttempts,
          cooldownMinutes: error.cooldownMinutes,
        }));
      } else if (error instanceof RealNameVerificationFailedError) {
        next(new ValidationError(error.message, {
          provider: error.provider,
          failedCount: error.failedCount,
          remainingAttempts: error.remainingAttempts,
          maxFailedAttempts: error.maxFailedAttempts,
          cooldownMinutes: error.cooldownMinutes,
          retryAfterMinutes: error.retryAfterMinutes,
        }));
      } else {
        next(error);
      }
    }
  });

  router.patch('/profile', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }
      const parsed = UpdateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('资料参数无效', parsed.error.flatten().fieldErrors);
      }
      const blockedField = await auditPublicTextFields({
        fields: [
          { field: 'penName', label: '笔名', value: parsed.data.penName },
          { field: 'bio', label: '个人简介', value: parsed.data.bio },
        ],
        contentAuditService: deps.contentAuditService,
        operationKey: 'system.profile-audit',
        operationLabel: '资料审核',
      });
      if (blockedField) {
        await recordComplianceEventFromRequest(req, deps.complianceEventManager, {
          category: 'auth',
          eventType: 'profile_update_reject',
          status: 'rejected',
          actorUserId: req.auth.id,
          actorUsername: req.auth.username,
          actorRole: req.auth.role,
          targetType: 'user',
          targetId: req.auth.id,
          targetLabel: req.auth.username,
          detail: {
            field: blockedField.field,
            fieldLabel: blockedField.label,
            overallScore: blockedField.result.overallScore,
            violationTypes: blockedField.result.violations.map((item) => item.type),
            contentPreview: blockedField.value.slice(0, 60),
            fields: Object.keys(parsed.data).sort(),
          },
        });
        res.status(400).json({
          error: buildPublicTextBlockMessage(blockedField.result, {
            subjectLabel: blockedField.label,
          }),
          code: 'PROFILE_CONTENT_BLOCKED',
        });
        return;
      }

      if (parsed.data.penName !== undefined && deps.bookStoreManager) {
        const oldProfile = await getProfile(db, req.auth.id);
        const oldName = oldProfile?.penName?.trim() ?? '';
        const newName = parsed.data.penName?.trim() ?? '';
        if (newName !== oldName) {
          await deps.bookStoreManager.onAuthorProfileChanged(req.auth.id);
        }
      }

      const profile = await updateProfile(db, req.auth.id, parsed.data);
      await recordComplianceEventFromRequest(req, deps.complianceEventManager, {
        category: 'auth',
        eventType: 'profile_update',
        status: 'success',
        actorUserId: req.auth.id,
        actorUsername: req.auth.username,
        actorRole: req.auth.role,
        targetType: 'user',
        targetId: req.auth.id,
        targetLabel: profile.penName || profile.username,
        detail: {
          fields: Object.keys(parsed.data).sort(),
        },
      });
      res.json(profile);
    } catch (error) {
      if (error instanceof EmailConflictError) {
        next(new ConflictError(error.message));
      } else {
        next(error);
      }
    }
  });

  router.post('/change-password', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }
      const parsed = ChangePasswordInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('密码参数无效', parsed.error.flatten().fieldErrors);
      }
      const passwordError = validatePasswordAgainstPolicy(parsed.data.newPassword, getPasswordPolicy());
      if (passwordError) {
        throw new ValidationError('修改密码参数无效', { newPassword: [passwordError] });
      }
      await changePassword(db, req.auth.id, parsed.data.oldPassword, parsed.data.newPassword);
      await recordComplianceEventFromRequest(req, deps.complianceEventManager, {
        category: 'auth',
        eventType: 'password_change',
        status: 'success',
        actorUserId: req.auth.id,
        actorUsername: req.auth.username,
        actorRole: req.auth.role,
        targetType: 'user',
        targetId: req.auth.id,
        targetLabel: req.auth.username,
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        next(new ValidationError(error.message));
      } else {
        next(error);
      }
    }
  });

  router.post('/change-username', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }
      const parsed = ChangeUsernameSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('用户名参数无效', parsed.error.flatten().fieldErrors);
      }
      const blockedField = await auditPublicTextFields({
        fields: [
          { field: 'newUsername', label: '用户名', value: parsed.data.newUsername },
        ],
        contentAuditService: deps.contentAuditService,
        operationKey: 'system.username-audit',
        operationLabel: '用户名审核',
      });
      if (blockedField) {
        await recordComplianceEventFromRequest(req, deps.complianceEventManager, {
          category: 'auth',
          eventType: 'username_change_reject',
          status: 'rejected',
          actorUserId: req.auth.id,
          actorUsername: req.auth.username,
          actorRole: req.auth.role,
          targetType: 'user',
          targetId: req.auth.id,
          targetLabel: req.auth.username,
          detail: {
            field: blockedField.field,
            fieldLabel: blockedField.label,
            overallScore: blockedField.result.overallScore,
            violationTypes: blockedField.result.violations.map((item) => item.type),
            contentPreview: blockedField.value.slice(0, 60),
          },
        });
        res.status(400).json({
          error: buildPublicTextBlockMessage(blockedField.result, {
            subjectLabel: blockedField.label,
          }),
          code: 'USERNAME_CONTENT_BLOCKED',
        });
        return;
      }
      if (deps.bookStoreManager) {
        await deps.bookStoreManager.onAuthorProfileChanged(req.auth.id);
      }
      await changeUsername(db, req.auth.id, parsed.data.currentPassword, parsed.data.newUsername);
      await recordComplianceEventFromRequest(req, deps.complianceEventManager, {
        category: 'auth',
        eventType: 'username_change',
        status: 'success',
        actorUserId: req.auth.id,
        actorUsername: req.auth.username,
        actorRole: req.auth.role,
        targetType: 'user',
        targetId: req.auth.id,
        targetLabel: parsed.data.newUsername,
        detail: {
          previousUsername: req.auth.username,
        },
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        next(new ValidationError(error.message));
      } else if (error instanceof UsernameConflictError) {
        next(new ConflictError(error.message));
      } else {
        next(error);
      }
    }
  });
}
