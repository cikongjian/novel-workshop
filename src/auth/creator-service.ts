import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthDb, CreatorStatus, UserProfile } from './types.js';
import { getProfile } from './user-service.js';
import { InvalidInviteCodeError } from './user-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CreatorService');

interface CreatorStateRow extends RowDataPacket {
  id: string;
  username: string;
  role: 'user' | 'admin';
  creator_status: CreatorStatus;
}

interface InviteCodeRow extends RowDataPacket {
  code: string;
}

export interface ReviewCreatorStatusInput {
  status: Exclude<CreatorStatus, 'pending'>;
  rejectReason?: string | null;
  operatorId: string;
}

async function getCreatorState(db: AuthDb, userId: string): Promise<CreatorStateRow | null> {
  const [rows] = await db.execute<CreatorStateRow[]>(
    'SELECT id, username, role, creator_status FROM users WHERE id = ?',
    [userId],
  );
  return rows[0] ?? null;
}

async function requireProfile(db: AuthDb, userId: string): Promise<UserProfile> {
  const profile = await getProfile(db, userId);
  if (!profile) {
    throw new Error('用户不存在');
  }
  return profile;
}

export async function redeemCreatorInviteCode(
  db: AuthDb,
  userId: string,
  inviteCode: string,
): Promise<UserProfile> {
  const normalizedInviteCode = inviteCode.trim();
  if (!normalizedInviteCode) {
    throw new InvalidInviteCodeError();
  }

  const conn = await db.getConnection();
  let username = userId;
  try {
    await conn.beginTransaction();

    const [users] = await conn.execute<CreatorStateRow[]>(
      'SELECT id, username, role, creator_status FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );
    const state = users[0];
    if (!state) {
      throw new Error('用户不存在');
    }
    username = state.username;

    if (state.role === 'admin') {
      throw new CreatorStatusOperationError('管理员账号无需使用邀请码开通作家资格');
    }
    if (state.creator_status === 'approved') {
      throw new CreatorStatusOperationError('当前账号已经是作家，无需重复兑换邀请码');
    }
    if (state.creator_status === 'suspended') {
      throw new CreatorStatusOperationError('当前作家资格已停用，请联系管理员处理');
    }

    const [codes] = await conn.execute<InviteCodeRow[]>(
      'SELECT code FROM invite_codes WHERE code = ? AND used_by IS NULL FOR UPDATE',
      [normalizedInviteCode],
    );
    if (codes.length === 0) {
      throw new InvalidInviteCodeError();
    }

    await conn.execute<ResultSetHeader>(
      `UPDATE users
       SET creator_status = 'approved',
           creator_applied_at = COALESCE(creator_applied_at, NOW()),
           creator_approved_at = NOW(),
           creator_rejected_at = NULL,
           creator_reject_reason = NULL
       WHERE id = ?`,
      [userId],
    );

    await conn.execute<ResultSetHeader>(
      'UPDATE invite_codes SET used_by = ?, used_at = NOW() WHERE code = ?',
      [userId, normalizedInviteCode],
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const profile = await requireProfile(db, userId);
  log.info(`user ${username} redeemed creator invite code`);
  return profile;
}

export async function reviewCreatorStatus(
  db: AuthDb,
  userId: string,
  input: ReviewCreatorStatusInput,
): Promise<UserProfile> {
  const state = await getCreatorState(db, userId);
  if (!state) {
    throw new Error('用户不存在');
  }
  if (state.role === 'admin') {
    throw new CreatorStatusOperationError('不能修改管理员的作家资格状态');
  }

  const rejectReason = input.rejectReason?.trim() || null;

  if (input.status === 'approved') {
    await db.execute<ResultSetHeader>(
      `UPDATE users
       SET creator_status = 'approved',
           creator_applied_at = COALESCE(creator_applied_at, NOW()),
           creator_approved_at = NOW(),
           creator_rejected_at = NULL,
           creator_reject_reason = NULL
       WHERE id = ?`,
      [userId],
    );
  } else if (input.status === 'rejected') {
    await db.execute<ResultSetHeader>(
      `UPDATE users
       SET creator_status = 'rejected',
           creator_rejected_at = NOW(),
           creator_approved_at = NULL,
           creator_reject_reason = ?
       WHERE id = ?`,
      [rejectReason, userId],
    );
  } else if (input.status === 'suspended') {
    await db.execute<ResultSetHeader>(
      `UPDATE users
       SET creator_status = 'suspended',
           creator_rejected_at = COALESCE(creator_rejected_at, NOW()),
           creator_reject_reason = ?
       WHERE id = ?`,
      [rejectReason, userId],
    );
  } else {
    await db.execute<ResultSetHeader>(
      `UPDATE users
       SET creator_status = 'none',
           creator_applied_at = NULL,
           creator_approved_at = NULL,
           creator_rejected_at = NULL,
           creator_reject_reason = NULL
       WHERE id = ?`,
      [userId],
    );
  }

  const profile = await requireProfile(db, userId);
  log.info(`operator ${input.operatorId} updated ${state.username} creator status to ${input.status}`);
  return profile;
}

export async function getCreatorStatus(db: AuthDb, userId: string): Promise<CreatorStatus | null> {
  const state = await getCreatorState(db, userId);
  return state?.creator_status ?? null;
}

export class CreatorStatusOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreatorStatusOperationError';
  }
}
