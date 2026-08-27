import { createHash } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthDb, UserProfile } from './types.js';
import { getProfile } from './user-service.js';
import { isRealNameRequired, type RealNamePolicy, type RealNameScene, getRealNamePolicy } from './real-name-policy.js';
import {
  verifyRealNameWithProvider,
  type RealNameVerificationProviderId,
} from './real-name-provider.js';
import {
  appendRealNameAuditLog,
  getRecentRejectedRealNameSummary,
} from './real-name-audit-service.js';

interface RealNameRow extends RowDataPacket {
  real_name_verified_at: string | null;
}

export type RealNameVerificationPayload = {
  realName: string;
  idNumber: string;
  phoneNumber: string;
};

export class RealNameRequiredError extends Error {
  constructor(message = '当前操作需要先完成实名认证') {
    super(message);
    this.name = 'RealNameRequiredError';
  }
}

export class RealNameVerificationFailedError extends Error {
  readonly provider: RealNameVerificationProviderId;
  readonly failedCount: number;
  readonly remainingAttempts: number;
  readonly maxFailedAttempts: number;
  readonly cooldownMinutes: number;
  readonly retryAfterMinutes: number | null;

  constructor(args: {
    message: string;
    provider: RealNameVerificationProviderId;
    failedCount: number;
    remainingAttempts: number;
    maxFailedAttempts: number;
    cooldownMinutes: number;
    retryAfterMinutes?: number | null;
  }) {
    super(args.message);
    this.name = 'RealNameVerificationFailedError';
    this.provider = args.provider;
    this.failedCount = args.failedCount;
    this.remainingAttempts = args.remainingAttempts;
    this.maxFailedAttempts = args.maxFailedAttempts;
    this.cooldownMinutes = args.cooldownMinutes;
    this.retryAfterMinutes = args.retryAfterMinutes ?? null;
  }
}

export class RealNameVerificationCooldownError extends Error {
  readonly retryAfterMinutes: number;
  readonly failedCount: number;
  readonly maxFailedAttempts: number;
  readonly cooldownMinutes: number;

  constructor(args: {
    retryAfterMinutes: number;
    failedCount: number;
    maxFailedAttempts: number;
    cooldownMinutes: number;
  }) {
    super(`实名认证失败次数过多，当前已进入冷却，请在 ${args.retryAfterMinutes} 分钟后再试`);
    this.name = 'RealNameVerificationCooldownError';
    this.retryAfterMinutes = args.retryAfterMinutes;
    this.failedCount = args.failedCount;
    this.maxFailedAttempts = args.maxFailedAttempts;
    this.cooldownMinutes = args.cooldownMinutes;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeRealName(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

function normalizeIdNumber(value: string): string {
  return value.trim().toUpperCase();
}

function normalizePhoneNumber(value: string): string {
  return value.trim();
}

function maskRealName(value: string): string {
  if (value.length <= 1) return '*';
  if (value.length === 2) return `${value[0]}*`;
  return `${value[0]}${'*'.repeat(Math.max(1, value.length - 2))}${value[value.length - 1]}`;
}

function maskIdNumber(value: string): string {
  if (value.length <= 8) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 3)}${'*'.repeat(Math.max(4, value.length - 7))}${value.slice(-4)}`;
}

function maskPhoneNumber(value: string): string {
  if (value.length < 7) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

export function getRealNameVerificationPolicy(): RealNamePolicy {
  return getRealNamePolicy();
}

function resolveRetryAfterMinutes(latestCreatedAt: string | null, cooldownMinutes: number): number | null {
  if (!latestCreatedAt || cooldownMinutes <= 0) {
    return null;
  }

  const latestTimestamp = new Date(latestCreatedAt).getTime();
  if (Number.isNaN(latestTimestamp)) {
    return cooldownMinutes;
  }

  const retryAfterMs = latestTimestamp + cooldownMinutes * 60 * 1000 - Date.now();
  if (retryAfterMs <= 0) {
    return null;
  }

  return Math.max(1, Math.ceil(retryAfterMs / 60000));
}

async function assertRealNameVerificationNotCoolingDown(
  db: AuthDb,
  userId: string,
  policy: RealNamePolicy,
): Promise<void> {
  if (policy.maxFailedAttempts <= 0 || policy.cooldownMinutes <= 0) {
    return;
  }

  const summary = await getRecentRejectedRealNameSummary(db, userId, policy.cooldownMinutes);
  if (summary.failedCount < policy.maxFailedAttempts || !summary.latestCreatedAt) {
    return;
  }

  const retryAfterMinutes = resolveRetryAfterMinutes(summary.latestCreatedAt, policy.cooldownMinutes);
  if (!retryAfterMinutes) {
    return;
  }

  throw new RealNameVerificationCooldownError({
    retryAfterMinutes,
    failedCount: summary.failedCount,
    maxFailedAttempts: policy.maxFailedAttempts,
    cooldownMinutes: policy.cooldownMinutes,
  });
}

export async function verifyRealName(
  db: AuthDb,
  userId: string,
  payload: RealNameVerificationPayload,
): Promise<UserProfile> {
  const policy = getRealNamePolicy();
  await assertRealNameVerificationNotCoolingDown(db, userId, policy);

  const realName = normalizeRealName(payload.realName);
  const idNumber = normalizeIdNumber(payload.idNumber);
  const phoneNumber = normalizePhoneNumber(payload.phoneNumber);
  const providerResult = await verifyRealNameWithProvider({
    realName,
    idNumber,
    phoneNumber,
  });

  if (!providerResult.passed) {
    const rejectedSummaryBeforePersist = await getRecentRejectedRealNameSummary(db, userId, policy.cooldownMinutes);
    const nextFailedCount = rejectedSummaryBeforePersist.failedCount + 1;
    const nextRemainingAttempts = Math.max(0, policy.maxFailedAttempts - nextFailedCount);

    await appendRealNameAuditLog(db, {
      action: 'verify_submission',
      status: 'rejected',
      userId,
      provider: providerResult.provider,
      detail: JSON.stringify({
        message: providerResult.detail,
        realNameMasked: maskRealName(realName),
        idNumberMasked: maskIdNumber(idNumber),
        phoneNumberMasked: maskPhoneNumber(phoneNumber),
        failedCount: nextFailedCount,
        remainingAttempts: nextRemainingAttempts,
        maxFailedAttempts: policy.maxFailedAttempts,
        cooldownMinutes: policy.cooldownMinutes,
      }),
    });

    const summary = await getRecentRejectedRealNameSummary(db, userId, policy.cooldownMinutes);
    const remainingAttempts = Math.max(0, policy.maxFailedAttempts - summary.failedCount);
    const retryAfterMinutes = remainingAttempts > 0
      ? null
      : resolveRetryAfterMinutes(summary.latestCreatedAt, policy.cooldownMinutes) ?? policy.cooldownMinutes;
    const message = remainingAttempts > 0
      ? `${providerResult.detail}。当前窗口内还可重试 ${remainingAttempts} 次，连续失败 ${policy.maxFailedAttempts} 次会进入 ${policy.cooldownMinutes} 分钟冷却`
      : `${providerResult.detail}。已达到失败上限，请在 ${retryAfterMinutes} 分钟后再试`;

    throw new RealNameVerificationFailedError({
      message,
      provider: providerResult.provider,
      failedCount: summary.failedCount,
      remainingAttempts,
      maxFailedAttempts: policy.maxFailedAttempts,
      cooldownMinutes: policy.cooldownMinutes,
      retryAfterMinutes,
    });
  }

  await db.execute<ResultSetHeader>(
    `UPDATE users
     SET real_name = ?,
         real_name_masked = ?,
         real_name_id_number_hash = ?,
         real_name_id_number_masked = ?,
         real_name_phone_hash = ?,
         real_name_phone_masked = ?,
         real_name_verified_at = NOW()
     WHERE id = ?`,
    [
      realName,
      maskRealName(realName),
      sha256(idNumber),
      maskIdNumber(idNumber),
      sha256(phoneNumber),
      maskPhoneNumber(phoneNumber),
      userId,
    ],
  );

  await appendRealNameAuditLog(db, {
    action: 'verify_submission',
    status: 'success',
    userId,
    provider: providerResult.provider,
    detail: JSON.stringify({
      message: providerResult.detail,
      realNameMasked: maskRealName(realName),
      idNumberMasked: maskIdNumber(idNumber),
      phoneNumberMasked: maskPhoneNumber(phoneNumber),
    }),
  });

  const profile = await getProfile(db, userId);
  if (!profile) {
    throw new Error('用户不存在');
  }
  return profile;
}

export async function assertRealNameVerified(
  db: AuthDb,
  userId: string,
  scene: RealNameScene,
): Promise<void> {
  if (!isRealNameRequired(scene)) return;

  const profile = await getProfile(db, userId);
  if (!profile) {
    throw new Error('用户不存在');
  }

  if (profile.role === 'admin' || profile.realNameVerified) {
    return;
  }

  throw new RealNameRequiredError();
}
