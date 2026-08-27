import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthDb, CreatorStatus } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AdminUserService');

export type AdminUserListInput = {
  keyword?: string;
  limit?: number;
  offset?: number;
};

export type UserStatus = 'active' | 'disabled';

export type AdminUserListItem = {
  id: string;
  username: string;
  penName: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  status: UserStatus;
  creatorStatus: CreatorStatus;
  creatorAppliedAt: string | null;
  creatorApprovedAt: string | null;
  totalGeneratedWords: number;
  balancePoints: number;
  frozenPoints: number;
  quotaUsed: number;
  quotaTotal: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type AdminUserListResult = {
  items: AdminUserListItem[];
  total: number;
  limit: number;
  offset: number;
};

interface UserListRow extends RowDataPacket {
  id: string;
  username: string;
  pen_name: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  status: UserStatus;
  creator_status: CreatorStatus;
  creator_applied_at: string | Date | null;
  creator_approved_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  last_login_at: string | Date | null;
}

interface LegacyUserListRow extends RowDataPacket {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: UserStatus;
}

interface CountRow extends RowDataPacket {
  total: number;
}

function normalizeTimestamp(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function normalizeOptionalTimestamp(value: string | Date | null): string | null {
  if (!value) return null;
  return normalizeTimestamp(value);
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === 'ER_BAD_FIELD_ERROR';
}

export async function listUsers(
  db: AuthDb,
  input: AdminUserListInput = {},
): Promise<AdminUserListResult> {
  const keyword = input.keyword?.trim() ?? '';
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 200);
  const offset = Math.max(Math.floor(input.offset ?? 0), 0);
  const likeKeyword = `%${keyword}%`;
  const paginationClause = `LIMIT ${limit} OFFSET ${offset}`;

  const [countRows] = keyword
    ? await db.execute<CountRow[]>(
      'SELECT COUNT(*) AS total FROM users WHERE username LIKE ? OR id LIKE ?',
      [likeKeyword, likeKeyword],
    )
    : await db.execute<CountRow[]>('SELECT COUNT(*) AS total FROM users');

  let items: AdminUserListItem[];
  try {
    const [rows] = keyword
      ? await db.execute<UserListRow[]>(
        `SELECT id, username, role, status, created_at, updated_at
                , pen_name, phone, creator_status, creator_applied_at, creator_approved_at, last_login_at
         FROM users
         WHERE username LIKE ? OR id LIKE ?
         ORDER BY created_at DESC
         ${paginationClause}`,
        [likeKeyword, likeKeyword],
      )
      : await db.execute<UserListRow[]>(
        `SELECT id, username, role, status, created_at, updated_at,
                pen_name, phone, creator_status, creator_applied_at, creator_approved_at, last_login_at
         FROM users
         ORDER BY created_at DESC
         ${paginationClause}`,
      );

    items = rows.map((row) => ({
      id: row.id,
      username: row.username,
      penName: row.pen_name,
      phone: row.phone ?? null,
      role: row.role,
      status: row.status ?? 'active',
      creatorStatus: row.creator_status ?? (row.role === 'admin' ? 'approved' : 'none'),
      creatorAppliedAt: normalizeOptionalTimestamp(row.creator_applied_at),
      creatorApprovedAt: normalizeOptionalTimestamp(row.creator_approved_at),
      totalGeneratedWords: 0,
      balancePoints: 0,
      frozenPoints: 0,
      quotaUsed: 0,
      quotaTotal: 0,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
      lastLoginAt: normalizeOptionalTimestamp(row.last_login_at),
    }));
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const [legacyRows] = keyword
      ? await db.execute<LegacyUserListRow[]>(
        `SELECT id, username, role
         FROM users
         WHERE username LIKE ? OR id LIKE ?
         ORDER BY username ASC
         ${paginationClause}`,
        [likeKeyword, likeKeyword],
      )
      : await db.execute<LegacyUserListRow[]>(
        `SELECT id, username, role
         FROM users
         ORDER BY username ASC
         ${paginationClause}`,
      );

    items = legacyRows.map((row) => ({
      id: row.id,
      username: row.username,
      penName: null,
      phone: null,
      role: row.role,
      status: row.status ?? 'active',
      creatorStatus: row.role === 'admin' ? 'approved' : 'none',
      creatorAppliedAt: null,
      creatorApprovedAt: null,
      totalGeneratedWords: 0,
      balancePoints: 0,
      frozenPoints: 0,
      quotaUsed: 0,
      quotaTotal: 0,
      createdAt: '',
      updatedAt: '',
      lastLoginAt: null,
    }));
  }

  return {
    items,
    total: Number(countRows[0]?.total ?? 0),
    limit,
    offset,
  };
}

/** 设置用户状态（禁用 / 启用），不可操作自己或其他管理员 */
export async function setUserStatus(
  db: AuthDb,
  targetUserId: string,
  status: UserStatus,
  operatorId: string,
): Promise<void> {
  if (targetUserId === operatorId) {
    throw new Error('不能修改自己的状态');
  }
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE users SET status = ? WHERE id = ? AND role != 'admin'`,
    [status, targetUserId],
  );
  if (result.affectedRows === 0) {
    throw new Error('用户不存在或无法修改管理员状态');
  }
  log.info(`用户 ${targetUserId} 状态已设为 ${status}（操作者: ${operatorId}）`);
}

/** 删除用户，不可删除自己或管理员 */
export async function deleteAdminUser(
  db: AuthDb,
  targetUserId: string,
  operatorId: string,
): Promise<void> {
  if (targetUserId === operatorId) {
    throw new Error('不能删除自己的账号');
  }
  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM users WHERE id = ? AND role != 'admin'`,
    [targetUserId],
  );
  if (result.affectedRows === 0) {
    throw new Error('用户不存在或无法删除管理员账号');
  }
  log.info(`用户 ${targetUserId} 已被删除（操作者: ${operatorId}）`);
}
