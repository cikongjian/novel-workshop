import { describe, expect, it, vi } from 'vitest';
import { ApplicationError, listApplications, submitApplication } from './application-service.js';

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('application-service', () => {
  it('lists invite applications with pagination metadata', async () => {
    const db = {
      execute: vi.fn(async (sql: string) => {
        const normalized = normalizeSql(sql);

        if (normalized.startsWith('SELECT COUNT(*) AS cnt FROM invite_applications')) {
          return [[{ cnt: 1 }], undefined];
        }

        if (normalized.startsWith('SELECT * FROM invite_applications')) {
          return [[{
            id: 'app-1',
            email: 'reader@example.com',
            name: 'Reader One',
            phone: '13800000000',
            identity_label: 'editor',
            reason: 'Interested in the platform',
            status: 'pending',
            admin_note: null,
            invite_code: null,
            reviewed_by: null,
            reviewed_at: null,
            created_at: '2026-04-16T00:00:00.000Z',
          }], undefined];
        }

        throw new Error(`Unexpected SQL: ${normalized}`);
      }),
    };

    const result = await listApplications(db as any, { status: 'pending', page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.items).toEqual([{
      id: 'app-1',
      email: 'reader@example.com',
      name: 'Reader One',
      phone: '13800000000',
      identityLabel: 'editor',
      reason: 'Interested in the platform',
      status: 'pending',
      adminNote: null,
      inviteCode: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: '2026-04-16T00:00:00.000Z',
    }]);
  });

  it('returns an empty list when invite application schema is missing', async () => {
    const missingTableError = Object.assign(new Error('missing table'), { code: 'ER_NO_SUCH_TABLE' });
    const db = {
      execute: vi.fn(async () => {
        throw missingTableError;
      }),
    };

    const result = await listApplications(db as any, { status: 'pending', page: 1, pageSize: 10 });

    expect(result).toEqual({ items: [], total: 0 });
  });

  it('maps schema failures during submission to a 503 application error', async () => {
    const missingTableError = Object.assign(new Error('missing table'), { code: 'ER_NO_SUCH_TABLE' });
    const db = {
      execute: vi.fn(async () => {
        throw missingTableError;
      }),
    };

    try {
      await submitApplication(db as any, {
        email: 'reader@example.com',
        name: 'Reader One',
      });
      throw new Error('Expected submitApplication to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect((error as ApplicationError).statusCode).toBe(503);
    }
  });
});
