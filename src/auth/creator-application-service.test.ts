import { describe, expect, it, vi } from 'vitest';
import {
  CreatorApplicationError,
  reviewCreatorApplication,
  submitCreatorApplication,
} from './creator-application-service.js';
import type { CreatorStatus } from './types.js';

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createMockDb(options?: {
  creatorStatus?: CreatorStatus;
  role?: 'user' | 'admin';
  existingEmail?: string | null;
}) {
  const user = {
    id: 'user-1',
    username: 'reader-one',
    role: options?.role ?? 'user',
    creatorStatus: options?.creatorStatus ?? 'none' as CreatorStatus,
    penName: '旧笔名',
    email: options?.existingEmail ?? 'old@example.com',
    bio: '旧简介' as string | null,
    creatorAppliedAt: null as string | null,
    creatorApprovedAt: null as string | null,
    creatorRejectedAt: null as string | null,
    creatorRejectReason: null as string | null,
  };

  const applications = new Map<string, any>();

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

      if (normalized === 'SELECT id FROM creator_applications WHERE user_id = ? AND status = ? LIMIT 1 FOR UPDATE') {
        const pending = [...applications.values()].filter((item) => item.user_id === user.id && item.status === 'pending');
        return [pending.map((item) => ({ id: item.id })), undefined];
      }

      if (normalized === 'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1') {
        const email = String(params?.[0] ?? '');
        if (email === 'taken@example.com') {
          return [[{ id: 'other-user' }], undefined];
        }
        return [[], undefined];
      }

      if (normalized.startsWith('INSERT INTO creator_applications')) {
        const [id, userId, penName, email, bio, reason, sampleWork] = params as string[];
        applications.set(id, {
          id,
          user_id: userId,
          username: user.username,
          pen_name: penName,
          email,
          bio,
          reason,
          sample_work: sampleWork,
          status: 'pending',
          admin_note: null,
          reviewed_by: null,
          reviewed_by_username: null,
          reviewed_at: null,
          created_at: '2026-03-14T00:00:00.000Z',
          updated_at: '2026-03-14T00:00:00.000Z',
        });
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalized.startsWith('UPDATE users SET pen_name = ?, email = ?, bio = ?, creator_status = \'pending\'')) {
        user.penName = String(params?.[0] ?? '');
        user.email = String(params?.[1] ?? '');
        user.bio = (params?.[2] as string | null) ?? null;
        user.creatorStatus = 'pending';
        user.creatorAppliedAt = '2026-03-14T00:00:00.000Z';
        user.creatorApprovedAt = null;
        user.creatorRejectedAt = null;
        user.creatorRejectReason = null;
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalized.startsWith('SELECT ca.id, ca.user_id, u.username,')) {
        const applicationId = String(params?.[0] ?? '');
        const app = applications.get(applicationId);
        return [app ? [app] : [], undefined];
      }

      if (normalized.startsWith('UPDATE creator_applications SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?')) {
        const [status, adminNote, reviewedBy, applicationId] = params as string[];
        const app = applications.get(applicationId);
        app.status = status;
        app.admin_note = adminNote;
        app.reviewed_by = reviewedBy;
        app.reviewed_by_username = reviewedBy === 'admin-1' ? 'admin' : null;
        app.reviewed_at = '2026-03-14T01:00:00.000Z';
        app.updated_at = '2026-03-14T01:00:00.000Z';
        applications.set(applicationId, app);
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalized.startsWith('UPDATE users SET creator_status = \'approved\'')) {
        user.penName = String(params?.[0] ?? '');
        user.email = String(params?.[1] ?? '');
        user.bio = (params?.[2] as string | null) ?? null;
        user.creatorStatus = 'approved';
        user.creatorAppliedAt ??= '2026-03-14T00:00:00.000Z';
        user.creatorApprovedAt = '2026-03-14T01:00:00.000Z';
        user.creatorRejectedAt = null;
        user.creatorRejectReason = null;
        return [{ affectedRows: 1 }, undefined];
      }

      if (normalized.startsWith('UPDATE users SET creator_status = \'rejected\'')) {
        user.penName = String(params?.[0] ?? '');
        user.email = String(params?.[1] ?? '');
        user.bio = (params?.[2] as string | null) ?? null;
        user.creatorStatus = 'rejected';
        user.creatorRejectedAt = '2026-03-14T01:00:00.000Z';
        user.creatorApprovedAt = null;
        user.creatorRejectReason = (params?.[3] as string | null) ?? null;
        return [{ affectedRows: 1 }, undefined];
      }

      throw new Error(`Unexpected connection SQL: ${normalized}`);
    }),
  };

  const db = {
    getConnection: vi.fn(async () => conn),
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
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
          pen_name: user.penName,
          avatar_url: null,
          bio: user.bio,
          email: user.email,
          created_at: '2026-03-14T00:00:00.000Z',
        }], undefined];
      }

      if (normalized.startsWith('SELECT ca.id, ca.user_id, u.username,')) {
        const applicationId = String(params?.[0] ?? '');
        const app = applications.get(applicationId);
        return [app ? [app] : [], undefined];
      }

      if (normalized.startsWith('SELECT COUNT(*) AS total FROM creator_applications ca')) {
        return [[{ total: applications.size }], undefined];
      }

      throw new Error(`Unexpected db SQL: ${normalized}`);
    }),
  };

  return { db: db as any, conn, user, applications };
}

describe('submitCreatorApplication', () => {
  it('creates a pending creator application and updates user status', async () => {
    const { db, conn, user, applications } = createMockDb();

    const profile = await submitCreatorApplication(db, user.id, {
      penName: '新笔名',
      email: 'writer@example.com',
      bio: '想写都市悬疑',
      reason: '已经是活跃读者，希望开始连载自己的故事。',
      sampleWork: '曾写过十万字长篇设定。',
    });

    expect(profile.creatorStatus).toBe('pending');
    expect(user.creatorStatus).toBe('pending');
    expect(user.penName).toBe('新笔名');
    expect(applications.size).toBe(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
  });

  it('rejects duplicate email usage', async () => {
    const { db, conn } = createMockDb();

    await expect(submitCreatorApplication(db, 'user-1', {
      penName: '新笔名',
      email: 'taken@example.com',
      reason: '已经准备好内容，希望开启创作。',
    })).rejects.toBeInstanceOf(CreatorApplicationError);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
  });
});

describe('reviewCreatorApplication', () => {
  it('approves a pending creator application and upgrades creator status', async () => {
    const { db, applications, user } = createMockDb({ creatorStatus: 'pending' });

    applications.set('app-1', {
      id: 'app-1',
      user_id: user.id,
      username: user.username,
      pen_name: '申请笔名',
      email: 'writer@example.com',
      bio: '简介',
      reason: '申请说明',
      sample_work: '样章',
      status: 'pending',
      admin_note: null,
      reviewed_by: null,
      reviewed_by_username: null,
      reviewed_at: null,
      created_at: '2026-03-14T00:00:00.000Z',
      updated_at: '2026-03-14T00:00:00.000Z',
    });

    const result = await reviewCreatorApplication(db, 'app-1', {
      status: 'approved',
      operatorId: 'admin-1',
    });

    expect(result.profile.creatorStatus).toBe('approved');
    expect(result.application.status).toBe('approved');
    expect(result.application.reviewedByUsername).toBe('admin');
  });
});
