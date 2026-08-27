import type { RowDataPacket } from 'mysql2/promise';
import type { AuthDb, CreatorStatus } from './types.js';
import { createLogger } from '../utils/logger.js';

export const adminUserInsightsLogger = createLogger('AdminUserInsights');

export type AdminUserCoreProfile = {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  creatorStatus: CreatorStatus;
  creatorAppliedAt: string | null;
  creatorApprovedAt: string | null;
  creatorRejectedAt: string | null;
  creatorRejectReason: string | null;
  realNameVerified: boolean;
  realNameVerifiedAt: string | null;
  realNameMasked: string | null;
  realNameIdNumberMasked: string | null;
  realNamePhoneMasked: string | null;
  penName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

interface AdminUserCoreRow extends RowDataPacket {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  creator_status: CreatorStatus;
  creator_applied_at: string | Date | null;
  creator_approved_at: string | Date | null;
  creator_rejected_at: string | Date | null;
  creator_reject_reason: string | null;
  real_name_verified_at: string | Date | null;
  real_name_masked: string | null;
  real_name_id_number_masked: string | null;
  real_name_phone_masked: string | null;
  pen_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  email: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface LegacyUserRowWithAudit extends RowDataPacket {
  id: string;
  username: string;
  role: 'user' | 'admin';
  created_at?: string | Date | null;
}

interface LegacyUserRow extends RowDataPacket {
  id: string;
  username: string;
  role: 'user' | 'admin';
}

export function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toIsoStringRequired(value: string | Date | null | undefined): string {
  return toIsoString(value) ?? new Date(0).toISOString();
}

/** Safe descending comparator for timestamp values that may be Date objects or strings. */
export function compareTimestampsDesc(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
): number {
  const sa = toIsoString(a) ?? '';
  const sb = toIsoString(b) ?? '';
  return sb.localeCompare(sa);
}

export function pickLatest(values: Array<string | Date | null | undefined>): string | null {
  return values
    .map((value) => {
      if (!value) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
      return typeof value === 'string' ? value : null;
    })
    .filter((value): value is string => value !== null)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export function getDbErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

export function isSchemaCompatibilityError(error: unknown): boolean {
  const code = getDbErrorCode(error);
  if (code === 'ER_BAD_FIELD_ERROR' || code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR') {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('no such table')
    || message.includes('no such column')
    || message.includes('has no column named');
}

export function logCompatibilityFallback(section: string, error: unknown): void {
  adminUserInsightsLogger.warn(`${section} schema unavailable, falling back`, {
    code: getDbErrorCode(error),
    message: error instanceof Error ? error.message : String(error),
  });
}

export function logOptionalSectionFallback(section: string, error: unknown): void {
  adminUserInsightsLogger.warn(`${section} unavailable in admin user insights, using defaults`, {
    code: getDbErrorCode(error),
    message: error instanceof Error ? error.message : String(error),
  });
}

function rowToAdminUserCoreProfile(row: AdminUserCoreRow): AdminUserCoreProfile {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status ?? 'active',
    creatorStatus: row.creator_status ?? (row.role === 'admin' ? 'approved' : 'none'),
    creatorAppliedAt: toIsoString(row.creator_applied_at),
    creatorApprovedAt: toIsoString(row.creator_approved_at),
    creatorRejectedAt: toIsoString(row.creator_rejected_at),
    creatorRejectReason: row.creator_reject_reason,
    realNameVerified: Boolean(row.real_name_verified_at),
    realNameVerifiedAt: toIsoString(row.real_name_verified_at),
    realNameMasked: row.real_name_masked,
    realNameIdNumberMasked: row.real_name_id_number_masked,
    realNamePhoneMasked: row.real_name_phone_masked,
    penName: row.pen_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    email: row.email,
    createdAt: toIsoStringRequired(row.created_at),
    updatedAt: toIsoStringRequired(row.updated_at),
  };
}

function legacyRowToAdminUserCoreProfile(row: LegacyUserRowWithAudit | LegacyUserRow): AdminUserCoreProfile {
  const createdAt = 'created_at' in row ? row.created_at : null;
  const safeCreatedAt = toIsoStringRequired(createdAt);

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: 'active',
    creatorStatus: row.role === 'admin' ? 'approved' : 'none',
    creatorAppliedAt: null,
    creatorApprovedAt: null,
    creatorRejectedAt: null,
    creatorRejectReason: null,
    realNameVerified: false,
    realNameVerifiedAt: null,
    realNameMasked: null,
    realNameIdNumberMasked: null,
    realNamePhoneMasked: null,
    penName: null,
    avatarUrl: null,
    bio: null,
    email: null,
    createdAt: safeCreatedAt,
    updatedAt: safeCreatedAt,
  };
}

export async function getAdminUserCoreProfile(
  db: AuthDb,
  userId: string,
): Promise<AdminUserCoreProfile | null> {
  try {
    const [rows] = await db.execute<AdminUserCoreRow[]>(
      `SELECT
        id,
        username,
        role,
        status,
        creator_status,
        creator_applied_at,
        creator_approved_at,
        creator_rejected_at,
        creator_reject_reason,
        real_name_verified_at,
        real_name_masked,
        real_name_id_number_masked,
        real_name_phone_masked,
        pen_name,
        avatar_url,
        bio,
        email,
        created_at,
        updated_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );

    const row = rows[0];
    return row ? rowToAdminUserCoreProfile(row) : null;
  } catch (error) {
    logCompatibilityFallback('admin user core profile', error);
  }

  try {
    const [rows] = await db.execute<LegacyUserRowWithAudit[]>(
      `SELECT id, username, role, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );

    const row = rows[0];
    return row ? legacyRowToAdminUserCoreProfile(row) : null;
  } catch (error) {
    logCompatibilityFallback('admin user audit fields', error);
  }

  try {
    const [rows] = await db.execute<LegacyUserRow[]>(
      `SELECT id, username, role
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );

    const row = rows[0];
    return row ? legacyRowToAdminUserCoreProfile(row) : null;
  } catch (error) {
    adminUserInsightsLogger.error('all user profile queries failed', {
      userId,
      code: getDbErrorCode(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
