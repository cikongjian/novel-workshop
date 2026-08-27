import type { Router } from 'express';
import {
  clearLoginFailures,
  recordLoginFailure,
  checkLoginRateLimit,
} from '../../../middleware/login-rate-limit.js';
import { createRegistrationRateLimit } from '../../../middleware/registration-rate-limit.js';
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '../../../errors.js';
import { getConfig } from '../../../../config/index.js';
import { getPasswordPolicy, validatePasswordAgainstPolicy } from '../../../../auth/password-policy.js';
import {
  createUser,
  InvalidInviteCodeError,
  resetPasswordByPhone,
  UsernameConflictError,
  UsernamePhoneMismatchError,
  UserDisabledError,
  verifyCredentials,
  recordLogin,
} from '../../../../auth/user-service.js';
import {
  createRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../../../../auth/jwt-service.js';
import {
  assertSliderCaptcha,
  ForgotPasswordInputSchema,
  LoginSchema,
  RefreshSchema,
  RegisterInputSchema,
  requireProfile,
  toAuthUserInfo,
  type AuthRouteDeps,
} from './route-support.js';
import { buildComplianceRequestContext } from '../../../../compliance/compliance-event-manager.js';
import { listUserApiProfiles } from '../../../../auth/user-api-service.js';
import type { TrialAccountService } from '../../../../auth/trial-account-service.js';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
} from './session-cookie.js';

export function registerAuthSessionRoutes(
  router: Router,
  deps: AuthRouteDeps,
  trialAccountService?: TrialAccountService,
): void {
  const {
    billingService,
    config,
    db,
    ipBlacklistService,
    redis,
    referralService,
    complianceEventManager,
    verifySliderCaptcha,
    notificationService,
  } = deps;

  const regProtection = getConfig().registrationProtection;
  const regRateLimit = createRegistrationRateLimit({
    redis,
    hourMax: regProtection.regPerHour,
    dayMax: regProtection.regPerDay,
  });
  const conditionalRegRateLimit = (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    if (regProtection.enabled) {
      regRateLimit(req, res, next);
    } else {
      next();
    }
  };

  router.get('/password-policy', (_req, res) => {
    res.json(getPasswordPolicy());
  });

  router.post('/register', conditionalRegRateLimit, async (req, res, next) => {
    const protectionEnabled = getConfig().registrationProtection.enabled;
    const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    try {
      if (protectionEnabled && ipBlacklistService && await ipBlacklistService.isBlocked(clientIp)) {
        throw new ForbiddenError('该IP已被临时封禁，请稍后再试');
      }
      const parsed = RegisterInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('注册参数无效', parsed.error.flatten().fieldErrors);
      }
      const {
        username,
        password,
        phone,
        inviteCode,
        referralCode,
        sliderChallengeId,
        sliderPosition,
        sliderDuration,
      } = parsed.data;
      const passwordError = validatePasswordAgainstPolicy(password, getPasswordPolicy());
      if (passwordError) {
        throw new ValidationError('注册参数无效', { password: [passwordError] });
      }
      await assertSliderCaptcha(verifySliderCaptcha, sliderChallengeId, sliderPosition, sliderDuration);
      const user = await createUser(db, username, password, phone, inviteCode, referralCode, referralService);
      const profile = await requireProfile(db, user.id);

      if (billingService) {
        try {
          await billingService.grantSignupGift(user.id);
        } catch (giftErr) {
          console.warn(
            `[auth/register] 注册赠送积分失败 userId=${user.id}:`,
            giftErr instanceof Error ? giftErr.message : giftErr,
          );
        }
      }

      if (referralService && referralCode) {
        const ip = req.ip ?? null;
        void referralService.onUserRegistered(user.id, referralCode, ip, null);
      }

      const accessToken = signAccessToken(
        { userId: user.id, username: user.username, role: user.role },
        config.jwtSecret,
        config.jwtExpiresIn,
      );
      const refreshToken = await createRefreshToken(redis, user.id, config.refreshExpiresInDays);
      if (ipBlacklistService) {
        void ipBlacklistService.resetFailures(clientIp);
      }
      if (complianceEventManager) {
        await complianceEventManager.record({
          category: 'auth',
          eventType: 'register',
          status: 'success',
          actorUserId: user.id,
          actorUsername: user.username,
          actorRole: user.role,
          targetType: 'user',
          targetId: user.id,
          targetLabel: user.username,
          request: buildComplianceRequestContext(req),
          detail: {
            inviteCodeUsed: Boolean(inviteCode),
            referralCodeUsed: Boolean(referralCode),
          },
        });
      }
      setRefreshTokenCookie(res, refreshToken, config.refreshExpiresInDays);
      res.status(201).json({
        user: toAuthUserInfo(profile),
        accessToken,
      });
    } catch (error) {
      if (ipBlacklistService && !(error instanceof ForbiddenError)) {
        void ipBlacklistService.recordFailure(clientIp);
      }
      if (error instanceof InvalidInviteCodeError) {
        next(new ValidationError(error.message));
      } else if (error instanceof UsernameConflictError) {
        next(new ConflictError(error.message));
      } else {
        next(error);
      }
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('登录参数无效', parsed.error.flatten().fieldErrors);
      }
      const { username, password, sliderChallengeId, sliderPosition, sliderDuration } = parsed.data;
      const retryAfter = await checkLoginRateLimit(username, redis);
      if (retryAfter > 0) {
        res.status(429).json({
          error: '登录尝试过于频繁，请稍后再试',
          code: 'LOGIN_RATE_LIMIT',
          retryAfter,
        });
        return;
      }
      await assertSliderCaptcha(verifySliderCaptcha, sliderChallengeId, sliderPosition, sliderDuration);
      const user = await verifyCredentials(db, username, password);
      if (!user) {
        await recordLoginFailure(username, redis);
        throw new UnauthorizedError('用户名或密码错误');
      }
      await clearLoginFailures(username, redis);
      const profile = await requireProfile(db, user.id);

      // 体验账号过期检查
      if (trialAccountService) {
        const expired = await trialAccountService.isExpired(user.id);
        if (expired) {
          throw new UnauthorizedError('体验账号已过期，请联系管理员');
        }
      }

      // 记录最近登录时间（非阻塞，失败不影响登录主流程）
      void recordLogin(db, user.id);

      const accessToken = signAccessToken(
        { userId: profile.id, username: profile.username, role: profile.role },
        config.jwtSecret,
        config.jwtExpiresIn,
      );
      const refreshToken = await createRefreshToken(redis, user.id, config.refreshExpiresInDays);
      if (complianceEventManager) {
        await complianceEventManager.record({
          category: 'auth',
          eventType: 'login',
          status: 'success',
          actorUserId: profile.id,
          actorUsername: profile.username,
          actorRole: profile.role,
          targetType: 'session',
          targetId: profile.id,
          targetLabel: profile.username,
          request: buildComplianceRequestContext(req),
          detail: {
            creatorStatus: profile.creatorStatus,
          },
        });
      }

      // 检查创作者是否已配置自有 API，未配置则推送提醒消息
      if (notificationService && profile.creatorStatus === 'approved') {
        try {
          const apiProfiles = await listUserApiProfiles(db, profile.id);
          const hasText = apiProfiles.some((p) => p.scope === 'model' && p.enabled);
          const hasImage = apiProfiles.some((p) => p.scope === 'image-generation' && p.enabled);
          const missing: string[] = [];
          if (!hasText) missing.push('文字模型');
          if (!hasImage) missing.push('文生图模型');
          if (missing.length > 0) {
            notificationService.addInAppNotification(profile.id, {
              userId: profile.id,
              type: 'reminder',
              title: '您的自有 API 尚未完整配置',
              body: `缺少${missing.join('和')}配置，点击前往 API 设置页面完善信息`,
              data: { route: '/m/api-settings' },
            });
          }
        } catch { /* 静默，登录流程不受影响 */ }
      }

      setRefreshTokenCookie(res, refreshToken, config.refreshExpiresInDays);
      res.json({
        user: toAuthUserInfo(profile),
        accessToken,
      });
    } catch (error) {
      if (error instanceof UserDisabledError) {
        next(new UnauthorizedError('用户名或密码错误'));
      } else {
        next(error);
      }
    }
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const parsed = RefreshSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError('refresh token 格式无效');
      }
      const refreshToken = parsed.data.refreshToken ?? readRefreshTokenCookie(req);
      if (!refreshToken) {
        throw new ValidationError('缺少 refresh token');
      }
      const result = await rotateRefreshToken(redis, refreshToken, config.refreshExpiresInDays);
      if (!result) {
        clearRefreshTokenCookie(res);
        throw new UnauthorizedError('refresh token 无效或已过期');
      }
      const profile = await requireProfile(db, result.userId);
      const accessToken = signAccessToken(
        { userId: profile.id, username: profile.username, role: profile.role },
        config.jwtSecret,
        config.jwtExpiresIn,
      );
      setRefreshTokenCookie(res, result.newToken, config.refreshExpiresInDays);
      res.json({
        accessToken,
        user: toAuthUserInfo(profile),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const parsed = RefreshSchema.safeParse(req.body ?? {});
      const refreshToken = parsed.success
        ? parsed.data.refreshToken ?? readRefreshTokenCookie(req)
        : readRefreshTokenCookie(req);
      try {
        if (refreshToken) {
          await revokeRefreshToken(redis, refreshToken);
        }
      } finally {
        clearRefreshTokenCookie(res);
      }
      if (req.auth && complianceEventManager) {
        await complianceEventManager.record({
          category: 'auth',
          eventType: 'logout',
          status: 'success',
          actorUserId: req.auth.id,
          actorUsername: req.auth.username,
          actorRole: req.auth.role,
          targetType: 'session',
          targetId: req.auth.id,
          targetLabel: req.auth.username,
          request: buildComplianceRequestContext(req),
        });
      }
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', async (req, res, next) => {
    try {
      if (!req.auth) {
        res.status(401).json({ error: '未登录' });
        return;
      }
      const profile = await requireProfile(db, req.auth.id);
      res.json(toAuthUserInfo(profile));
    } catch (error) {
      next(error);
    }
  });

  // POST /auth/forgot-password — 通过用户名+手机号重置密码
  router.post('/forgot-password', async (req, res, next) => {
    try {
      const parsed = ForgotPasswordInputSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('参数无效', parsed.error.flatten().fieldErrors);
      }
      const { username, phone, newPassword, sliderChallengeId, sliderPosition, sliderDuration } = parsed.data;

      await assertSliderCaptcha(verifySliderCaptcha, sliderChallengeId, sliderPosition, sliderDuration);

      const passwordPolicy = getPasswordPolicy();
      validatePasswordAgainstPolicy(newPassword, passwordPolicy);

      await resetPasswordByPhone(db, username, phone, newPassword);

      if (complianceEventManager) {
        await complianceEventManager.record({
          category: 'auth',
          eventType: 'password_reset',
          status: 'success',
          actorUsername: username,
          actorRole: 'user',
          targetType: 'user',
          targetId: username,
          detail: { method: 'phone' },
          request: buildComplianceRequestContext(req),
        });
      }

      res.json({ ok: true, message: '密码重置成功，请重新登录' });
    } catch (error) {
      if (error instanceof UsernamePhoneMismatchError) {
        next(new ValidationError(error.message));
      } else {
        next(error);
      }
    }
  });
}
