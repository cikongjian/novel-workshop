import { createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';

const SESSION_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type GuestVisitRecord = {
  fingerprint: string; userAgent: string;
  firstSeenAt: Date; lastSeenAt: Date;
  hitCount: number; sessionCount: number;
  lastPath: string; referrer?: string;
};

export type GuestVisitSummary = {
  hasOtherVisitors: boolean;
  totalUniqueVisitors: number;
  uniqueVisitorsLast24Hours: number;
  uniqueVisitorsLast7Days: number;
  activeVisitorsLast30Minutes: number;
  latestVisitAt?: Date;
  recentVisitors: GuestVisitRecord[];
};

type GuestVisitRow = {
  fingerprint: string; user_agent: string;
  first_seen_at: number; last_seen_at: number;
  hit_count: number; session_count: number;
  last_path: string; referrer: string | null;
};

function rowToRecord(r: GuestVisitRow): GuestVisitRecord {
  return {
    fingerprint: r.fingerprint, userAgent: r.user_agent,
    firstSeenAt: new Date(r.first_seen_at), lastSeenAt: new Date(r.last_seen_at),
    hitCount: r.hit_count, sessionCount: r.session_count,
    lastPath: r.last_path, referrer: r.referrer ?? undefined,
  };
}

export class GuestVisitManager {
  private readonly db: Database;

  constructor(_dataDir: string, db?: Database) {
    if (!db) throw new Error('GuestVisitManager requires AppDb');
    this.db = db;
  }

  static buildFingerprint(ip: string, userAgent: string): string {
    return createHash('sha256').update(`${ip}::${userAgent}`).digest('hex').slice(0, 16);
  }

  async recordVisit(input: { ip: string; userAgent?: string; path: string; referrer?: string; occurredAt?: Date }): Promise<void> {
    const userAgent = (input.userAgent ?? '未知设备').trim().slice(0, 160) || '未知设备';
    const occurredAt = input.occurredAt ?? new Date();
    const fingerprint = GuestVisitManager.buildFingerprint(input.ip, userAgent);
    const ts = occurredAt.getTime();
    const referrer = input.referrer?.trim() ? input.referrer.trim().slice(0, 200) : null;

    const existing = this.db.prepare('SELECT * FROM guest_visits WHERE fingerprint=?').get(fingerprint) as GuestVisitRow | undefined;

    if (!existing) {
      this.db.prepare('INSERT INTO guest_visits (fingerprint,user_agent,first_seen_at,last_seen_at,hit_count,session_count,last_path,referrer) VALUES (?,?,?,?,1,1,?,?)').run(fingerprint, userAgent, ts, ts, input.path, referrer);
      return;
    }

    const isNewSession = ts - existing.last_seen_at > SESSION_WINDOW_MS;
    this.db.prepare('UPDATE guest_visits SET user_agent=?,last_seen_at=?,hit_count=hit_count+1,last_path=?,referrer=COALESCE(?,referrer),session_count=session_count+? WHERE fingerprint=?').run(userAgent, ts, input.path, referrer, isNewSession ? 1 : 0, fingerprint);
  }

  async getSummary(now = new Date()): Promise<GuestVisitSummary> {
    const nowMs = now.getTime();
    const last24h = nowMs - DAY_MS;
    const last7d = nowMs - DAY_MS * 7;
    const active = nowMs - SESSION_WINDOW_MS;

    const total = (this.db.prepare('SELECT COUNT(*) as cnt FROM guest_visits').get() as { cnt: number }).cnt;
    const last24hCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM guest_visits WHERE last_seen_at>=?').get(last24h) as { cnt: number }).cnt;
    const last7dCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM guest_visits WHERE last_seen_at>=?').get(last7d) as { cnt: number }).cnt;
    const activeCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM guest_visits WHERE last_seen_at>=?').get(active) as { cnt: number }).cnt;
    const latestRow = this.db.prepare('SELECT last_seen_at FROM guest_visits ORDER BY last_seen_at DESC LIMIT 1').get() as { last_seen_at: number } | undefined;
    const recentRows = this.db.prepare('SELECT * FROM guest_visits ORDER BY last_seen_at DESC LIMIT 20').all() as GuestVisitRow[];

    return {
      hasOtherVisitors: total > 0,
      totalUniqueVisitors: total,
      uniqueVisitorsLast24Hours: last24hCount,
      uniqueVisitorsLast7Days: last7dCount,
      activeVisitorsLast30Minutes: activeCount,
      latestVisitAt: latestRow ? new Date(latestRow.last_seen_at) : undefined,
      recentVisitors: recentRows.map(rowToRecord),
    };
  }
}
