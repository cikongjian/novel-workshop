import { z } from 'zod';
import { REFRESH_TOKEN_PATTERN } from './session-cookie.js';
import type { Redis } from 'ioredis';
import { sanitizeTextField } from '../../../../utils/sanitize-input.js';
import type { AuthConfig, AuthDb, UserProfile } from '../../../../auth/types.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import {
  getProfile,
} from '../../../../auth/user-service.js';
import type { BillingService } from '../../../../billing/billing-service.js';
import type { ComplianceEventManager } from '../../../../compliance/compliance-event-manager.js';
import type { ReferralService } from '../../../../referral/referral-service.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { IpBlacklistService } from '../../../middleware/ip-blacklist.js';
import { ValidationError, UnauthorizedError } from '../../../errors.js';
import { createLogger } from '../../../../utils/logger.js';

export interface AuthRouteDeps {
  db: AuthDb;
  redis: Redis;
  config: AuthConfig;
  dataDir?: string;
  billingService?: BillingService;
  referralService?: ReferralService;
  novelManager?: NovelManager;
  bookStoreManager?: import('../../../../bookstore/bookstore-manager.js').BookStoreManager;
  contentAuditService?: ContentAuditService;
  complianceEventManager?: ComplianceEventManager;
  verifySliderCaptcha?: (challengeId: string, position: number, durationMs: number) => Promise<boolean>;
  ipBlacklistService?: IpBlacklistService;
  notificationService?: import('../../../../services/notification-service.js').NotificationService;
}

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  sliderChallengeId: z.string().min(1).optional(),
  sliderPosition: z.number().min(0).max(300).optional(),
  sliderDuration: z.number().min(0).optional(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().regex(REFRESH_TOKEN_PATTERN).optional(),
});

export const ListUsersQuery = z.object({
  keyword: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const CreateInviteCodesBody = z.object({
  count: z.number().int().min(1).max(20).default(1),
});

export const DeleteInviteCodesBody = z.object({
  codes: z.array(z.string().min(1)).min(1).max(100),
});

export const SetUserStatusBody = z.object({
  status: z.enum(['active', 'disabled']),
});

export const UpdateProfileSchema = z.object({
  penName: z.string().max(50).transform(sanitizeTextField).nullable().optional(),
  avatarUrl: z.string().max(500).url('头像必须为有效 URL')
    .refine(url => /^https?:\/\//i.test(url), '头像 URL 必须使用 http 或 https 协议')
    .nullable().optional(),
  bio: z.string().max(300).transform(sanitizeTextField).nullable().optional(),
  email: z.string().email('邮箱格式不正确').max(255).or(z.literal('')).nullable().optional(),
});

export const ChangeUsernameSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newUsername: z.string()
    .min(2, '用户名至少 2 个字符')
    .max(50, '用户名最多 50 个字符')
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fff]+$/, '用户名只能包含字母、数字、下划线和中文'),
});

export const RealNameVerificationSchema = z.object({
  realName: z.string().trim().min(2, '真实姓名至少 2 个字符').max(50, '真实姓名最多 50 个字符'),
  idNumber: z.string().trim().regex(/^(\d{15}|\d{17}[\dXx])$/, '身份证号格式不正确'),
  phoneNumber: z.string().trim().regex(/^1\d{10}$/, '手机号格式不正确'),
});

export const RegisterInputSchema = z.object({
  username: z.string()
    .min(2, '用户名至少 2 个字符')
    .max(50, '用户名最多 50 个字符')
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fff]+$/, '用户名只能包含字母、数字、下划线和中文'),
  password: z.string().min(1).max(128),
  phone: z.string().trim().regex(/^1\d{10}$/, '手机号格式不正确'),
  inviteCode: z.string().min(1).max(32).optional(),
  referralCode: z.string().length(16).optional(),
  sliderChallengeId: z.string().min(1),
  sliderPosition: z.number().min(0).max(300),
  sliderDuration: z.number().min(0),
}).superRefine((value, ctx) => {
  if (value.inviteCode && value.referralCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '邀请码和推荐码不能同时使用',
      path: ['inviteCode'],
    });
  }
});

export const ChangePasswordInputSchema = z.object({
  oldPassword: z.string().min(1, '请输入原密码'),
  newPassword: z.string().min(1).max(128),
});

export const ForgotPasswordInputSchema = z.object({
  username: z.string()
    .min(2, '用户名至少 2 个字符')
    .max(50, '用户名最多 50 个字符'),
  phone: z.string().trim().regex(/^1\d{10}$/, '手机号格式不正确'),
  newPassword: z.string().min(1).max(128),
  sliderChallengeId: z.string().min(1),
  sliderPosition: z.number().min(0).max(300),
  sliderDuration: z.number().min(0),
});

export function toAuthUserInfo(profile: UserProfile) {
  return {
    id: profile.id,
    username: profile.username,
    role: profile.role,
    creatorStatus: profile.creatorStatus,
  };
}

export async function assertSliderCaptcha(
  verifySliderCaptcha: AuthRouteDeps['verifySliderCaptcha'],
  challengeId: string | undefined,
  position: number | undefined,
  durationMs: number | undefined,
): Promise<void> {
  if (!verifySliderCaptcha) return;
  if (process.env.NODE_ENV === 'development') return;
  if (!challengeId || position === undefined || durationMs === undefined) {
    throw new ValidationError('请完成滑块验证');
  }
  const isValid = await verifySliderCaptcha(challengeId, position, durationMs);
  if (!isValid) {
    throw new ValidationError('滑块验证失败，请重试');
  }
}

export async function requireProfile(db: AuthDb, userId: string): Promise<UserProfile> {
  const profile = await getProfile(db, userId);
  if (!profile) {
    throw new UnauthorizedError('用户不存在');
  }
  return profile;
}

const statsLog = createLogger('UserGenerationStats');

export async function attachUserGenerationStats(
  result: import('../../../../auth/admin-user-service.js').AdminUserListResult,
  novelManager?: NovelManager,
): Promise<import('../../../../auth/admin-user-service.js').AdminUserListResult> {
  if (!novelManager || result.items.length === 0) {
    return result;
  }

  try {
    const userIds = new Set(result.items.map((item) => item.id));
    const totalGeneratedWordsByUser = new Map<string, number>();
    const novels = (await novelManager.listNovels()).filter((novel) => userIds.has(novel.ownerId ?? ''));

    for (const novel of novels) {
      const ownerId = novel.ownerId ?? '';
      if (!ownerId) continue;
      totalGeneratedWordsByUser.set(
        ownerId,
        (totalGeneratedWordsByUser.get(ownerId) ?? 0) + (novel.wordCount ?? 0),
      );
    }

    const items = result.items.map((item) => ({
      ...item,
      totalGeneratedWords: totalGeneratedWordsByUser.get(item.id) ?? 0,
    }));

    return { ...result, items };
  } catch (error) {
    statsLog.warn('failed to attach generation stats, returning without stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
}

const billingLog = createLogger('UserBillingQuota');

/**
 * 为用户列表附加计费积分和试用字数额度信息
 */
export async function attachUserBillingAndQuota(
  result: import('../../../../auth/admin-user-service.js').AdminUserListResult,
  billingService?: BillingService,
): Promise<import('../../../../auth/admin-user-service.js').AdminUserListResult> {
  if (!billingService || result.items.length === 0) {
    return result;
  }

  try {
    const userIds = result.items.map((item) => item.id);

    const [accountsMap, trialsMap, config] = await Promise.all([
      billingService.batchGetAccounts(userIds),
      billingService.batchGetTrials(userIds),
      billingService.getSystemConfig(),
    ]);

    const defaultQuotaTotal = config.trialQuotaChars;

    const items = result.items.map((item) => {
      const account = accountsMap.get(item.id);
      const trial = trialsMap.get(item.id);
      const quotaUsed = trial?.usedChars ?? 0;
      const quotaTotal = trial?.totalQuota === undefined ? defaultQuotaTotal : trial.totalQuota;
      return {
        ...item,
        balancePoints: account?.balancePoints ?? 0,
        frozenPoints: account?.frozenPoints ?? 0,
        quotaUsed,
        quotaTotal,
        quotaRemaining: Math.max(0, quotaTotal - quotaUsed),
      };
    });

    return { ...result, items };
  } catch (error) {
    billingLog.warn('failed to attach billing/quota, returning without', {
      error: error instanceof Error ? error.message : String(error),
    });
    return result;
  }
}
