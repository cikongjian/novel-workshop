import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeAppDb, initAppDb } from '../db/app-db.js';
import {
  createReferralEvent,
  enqueueCommission,
  getDueCommissions,
  getPendingRegisterRewards,
  getReferralConfig,
  getReferralTiers,
  markReferralEventActive,
} from '../referral/referral-db.js';
import { createAuthDb, initAuthSchema } from './db.js';

describe('SQLite authentication integration', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'novel-workshop-auth-'));
    initAppDb(dataDir);
  });

  afterEach(() => {
    closeAppDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('initializes referral tables and executes their main queue workflow', async () => {
    const db = createAuthDb(dataDir);
    await initAuthSchema(db);

    expect((await getReferralConfig(db)).enabled).toBe(false);
    expect(await getReferralTiers(db)).not.toHaveLength(0);

    const event = await createReferralEvent(db, {
      referrerId: 'referrer-1',
      referredId: 'referred-1',
      referralCode: '0123456789abcdef',
      registerRewardPoints: 200,
      registerRewardDelayHours: -1,
      referredIp: '127.0.0.1',
      referredDeviceFp: null,
      isSuspectedFraud: false,
      flagReason: null,
    });
    await markReferralEventActive(db, event.id);
    expect((await getPendingRegisterRewards(db)).map(item => item.id)).toContain(event.id);

    const commission = await enqueueCommission(db, {
      referrerId: 'referrer-1',
      referralEventId: event.id,
      rechargedPoints: 1_000,
      commissionPct: 5,
      commissionPoints: 50,
      commissionDelayDays: -1,
    });
    expect((await getDueCommissions(db)).map(item => item.id)).toContain(commission.id);
  });

  it('normalizes legacy MySQL time and locking expressions', async () => {
    const db = createAuthDb(dataDir);
    await db.execute('CREATE TABLE sql_dialect_probe (id TEXT PRIMARY KEY, updated_at TEXT)');
    await db.execute("INSERT INTO sql_dialect_probe (id, updated_at) VALUES (?, datetime('now'))", ['one']);
    await db.execute('UPDATE sql_dialect_probe SET updated_at = NOW() WHERE id = ?', ['one']);

    const [rows] = await db.execute<Array<{ id: string }>>(
      'SELECT id FROM sql_dialect_probe WHERE updated_at >= (NOW() - INTERVAL ? MINUTE) FOR UPDATE',
      [1],
    );

    expect(rows).toEqual([{ id: 'one' }]);
  });
});
