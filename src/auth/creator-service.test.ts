import { describe, expect, it, vi } from 'vitest';
import {
  CreatorStatusOperationError,
  redeemCreatorInviteCode,
} from './creator-service.js';
import { InvalidInviteCodeError } from './user-service.js';
import type { CreatorStatus } from './types.js';

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createMockDb(options?: {
  creatorStatus?: CreatorStatus;
  role?: 'user' | 'admin';
  inviteCodes?: string[];
}) {
  const user = {
    id: 'user-1',
    username: 'reader-one',
    role: options?.role ?? 'user',
    creatorStatus: options?.creatorStatus ?? 'none' as CreatorStatus,
    creatorAppliedAt: null as string | null,
    creatorApprovedAt: null as string | null,
    creatorRejectedAt: null as string | null,
    creatorRejectReason: null as string | null,
  };
  const inviteCodes = new Map((options?.inviteCodes ?? ['valid-code']).map((code) => [code, null as string | null]));

  const conn = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(() => {}),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      const normalized = normalizeSql(sql);
      if (normalized === 'SELECT id, username, role, creator_status FROM users WHERE id = ? FOR UPDATE') {
        return [[{
          id: user.id,
          username: user.username,
          role: user.role,
          creator_status: user.creatorStatus,
        }], undefined];
      }
      if (normalized === 'SELECT code FROM invite_codes WHERE code = ? AND used_by IS NULL FOR UPDATE') {
        const code = String(params?.[0] ?? '');
        return [inviteCodes.get(code) === null ? [{ code }] : [], undefined];
      }
      if (normalized.startsWith('UPDATE users SET creator_status = \'approved\'')) {
        user.creatorStatus = 'approved';
        user.creatorAppliedAt ??= '2026-03-14T00:00:00.000Z';
        user.creatorApprovedAt = '2026-03-14T00:00:00.000Z';
        user.creatorRejectedAt = null;
        user.creatorRejectReason = null;
        return [{ affectedRows: 1 }, undefined];
      }
      if (normalized === 'UPDATE invite_codes SET used_by = ?, used_at = NOW() WHERE code = ?') {
        const targetUserId = String(params?.[0] ?? '');
        const code = String(params?.[1] ?? '');
        if (!inviteCodes.has(code) || inviteCodes.get(code) !== null) {
          throw new Error('invite code not available');
        }
        inviteCodes.set(code, targetUserId);
        return [{ affectedRows: 1 }, undefined];
      }
      throw new Error(`Unexpected connection SQL: ${normalized}`);
    }),
  };

  const db = {
    getConnection: vi.fn(async () => conn),
    execute: vi.fn(async (sql: string) => {
      const normalized = normalizeSql(sql);
      if (
        normalized.startsWith('SELECT id, username, role, creator_status, creator_applied_at, creator_approved_at,')
        && normalized.includes('FROM users WHERE id = ?')
      ) {
        return [[{
          id: user.id,
          username: user.username,
          role: user.role,
          creator_status: user.creatorStatus,
          creator_applied_at: user.creatorAppliedAt,
          creator_approved_at: user.creatorApprovedAt,
          creator_rejected_at: user.creatorRejectedAt,
          creator_reject_reason: user.creatorRejectReason,
          real_name_verified_at: null,
          real_name_masked: null,
          real_name_id_number_masked: null,
          real_name_phone_masked: null,
          pen_name: null,
          avatar_url: null,
          bio: null,
          email: null,
          created_at: '2026-03-14T00:00:00.000Z',
        }], undefined];
      }
      throw new Error(`Unexpected db SQL: ${normalized}`);
    }),
  };

  return { db: db as any, conn, user, inviteCodes };
}

describe('redeemCreatorInviteCode', () => {
  it('upgrades a reader to creator and consumes the invite code', async () => {
    const { db, conn, inviteCodes } = createMockDb();

    const profile = await redeemCreatorInviteCode(db, 'user-1', 'valid-code');

    expect(profile.creatorStatus).toBe('approved');
    expect(inviteCodes.get('valid-code')).toBe('user-1');
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('rejects an invalid invite code', async () => {
    const { db, conn, user } = createMockDb({ inviteCodes: ['another-code'] });

    await expect(redeemCreatorInviteCode(db, 'user-1', 'missing-code')).rejects.toBeInstanceOf(InvalidInviteCodeError);

    expect(user.creatorStatus).toBe('none');
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('does not allow an approved creator to redeem again', async () => {
    const { db, conn, inviteCodes } = createMockDb({ creatorStatus: 'approved' });

    await expect(redeemCreatorInviteCode(db, 'user-1', 'valid-code')).rejects.toBeInstanceOf(CreatorStatusOperationError);

    expect(inviteCodes.get('valid-code')).toBeNull();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
  });
});
