import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GuestVisitManager } from './guest-visit-manager.js';

describe('GuestVisitManager', () => {
  let tempDir: string;
  let manager: GuestVisitManager;
  let db: Database.Database;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-guest-visits-'));
    db = new Database(path.join(tempDir, 'guest-visits.db'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS guest_visits (
        fingerprint TEXT PRIMARY KEY,
        user_agent TEXT NOT NULL DEFAULT '',
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 1,
        session_count INTEGER NOT NULL DEFAULT 1,
        last_path TEXT NOT NULL DEFAULT '',
        referrer TEXT
      );
    `);
    manager = new GuestVisitManager(tempDir, db);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('tracks unique guest visitors and session windows', async () => {
    await manager.recordVisit({
      ip: '1.1.1.1',
      userAgent: 'UA-A',
      path: '/bookstore/list',
      occurredAt: new Date('2026-03-23T00:00:00.000Z'),
    });
    await manager.recordVisit({
      ip: '1.1.1.1',
      userAgent: 'UA-A',
      path: '/bookstore/book-1',
      occurredAt: new Date('2026-03-23T00:10:00.000Z'),
    });
    await manager.recordVisit({
      ip: '1.1.1.1',
      userAgent: 'UA-A',
      path: '/bookstore/book-1/reader/chapters/1',
      occurredAt: new Date('2026-03-23T01:00:00.000Z'),
    });
    await manager.recordVisit({
      ip: '2.2.2.2',
      userAgent: 'UA-B',
      path: '/homepage/public',
      occurredAt: new Date('2026-03-23T02:00:00.000Z'),
    });

    const summary = await manager.getSummary(new Date('2026-03-23T02:10:00.000Z'));
    expect(summary.hasOtherVisitors).toBe(true);
    expect(summary.totalUniqueVisitors).toBe(2);
    expect(summary.uniqueVisitorsLast24Hours).toBe(2);
    expect(summary.uniqueVisitorsLast7Days).toBe(2);
    expect(summary.activeVisitorsLast30Minutes).toBe(1);
    expect(summary.recentVisitors[0]).toMatchObject({
      hitCount: 1,
      sessionCount: 1,
      lastPath: '/homepage/public',
    });
    expect(summary.recentVisitors[1]).toMatchObject({
      hitCount: 3,
      sessionCount: 2,
      lastPath: '/bookstore/book-1/reader/chapters/1',
    });
  });
});
