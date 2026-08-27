import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminUserInsights } from './admin-user-insights-service.js';

const { mockListUserApiProfiles } = vi.hoisted(() => ({
  mockListUserApiProfiles: vi.fn(),
}));

vi.mock('./user-api-service.js', () => ({
  listUserApiProfiles: mockListUserApiProfiles,
}));

describe('admin-user-insights-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to legacy user columns when extended profile columns are missing', async () => {
    const db = {
      execute: vi.fn(async (sql: string) => {
        if (sql.includes('creator_status')) {
          throw Object.assign(new Error('Unknown column creator_status'), { code: 'ER_BAD_FIELD_ERROR' });
        }

        if (sql.includes('SELECT id, username, role, created_at')) {
          return [[{
            id: 'user-1',
            username: 'reader-one',
            role: 'user',
            created_at: '2026-04-16T00:00:00.000Z',
          }], undefined];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    mockListUserApiProfiles.mockResolvedValue([]);

    const insights = await getAdminUserInsights('user-1', {
      db: db as any,
    });

    expect(insights?.profile.username).toBe('reader-one');
    expect(insights?.profile.creatorStatus).toBe('none');
    expect(insights?.billing.balancePoints).toBe(0);
  });

  it('returns profile data when optional api and referral sections are unavailable', async () => {
    const db = {
      execute: vi.fn(async (sql: string) => {
        if (sql.includes('creator_status')) {
          return [[{
            id: 'user-1',
            username: 'reader-one',
            role: 'user',
            status: 'active',
            creator_status: 'approved',
            creator_applied_at: null,
            creator_approved_at: null,
            creator_rejected_at: null,
            creator_reject_reason: null,
            real_name_verified_at: null,
            real_name_masked: null,
            real_name_id_number_masked: null,
            real_name_phone_masked: null,
            pen_name: 'Reader',
            avatar_url: null,
            bio: null,
            email: 'reader@example.com',
            created_at: '2026-04-16T00:00:00.000Z',
            updated_at: '2026-04-16T00:00:00.000Z',
          }], undefined];
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    mockListUserApiProfiles.mockRejectedValue(Object.assign(new Error('missing table'), { code: 'ER_NO_SUCH_TABLE' }));

    const referralService = {
      getUserReferralStats: vi.fn(async () => {
        throw Object.assign(new Error('missing referral table'), { code: 'ER_NO_SUCH_TABLE' });
      }),
      getMyReferralEvents: vi.fn(async () => {
        throw Object.assign(new Error('missing referral table'), { code: 'ER_NO_SUCH_TABLE' });
      }),
    };

    const insights = await getAdminUserInsights('user-1', {
      db: db as any,
      referralService: referralService as any,
    });

    expect(insights).not.toBeNull();
    expect(insights?.profile.email).toBe('reader@example.com');
    expect(insights?.apiProfiles.total).toBe(0);
    expect(insights?.referral).toBeNull();
  });
});
