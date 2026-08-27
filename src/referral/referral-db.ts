import type { RowDataPacket } from 'mysql2/promise';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AuthDb } from '../auth/types.js';
import type {
  ReferralSystemConfig,
  ReferralTier,
  ReferralCode,
  ReferralEvent,
  CommissionQueueItem,
} from './types.js';
import { DEFAULT_REFERRAL_CONFIG, DEFAULT_REFERRAL_TIERS } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ReferralDB');

const REFERRAL_CODE_BYTES = 8; // 16字符 hex

// ─── Row 类型 ──────────────────────────────────────────────

interface ConfigRow extends RowDataPacket {
  enabled: number;
  register_reward_points: number;
  register_reward_delay_hours: number;
  required_activity_count: number;
  commission_delay_days: number;
  commission_min_recharge_points: number;
  flag_same_ip_count: number;
  max_monthly_register_rewards: number;
  max_monthly_commission_points: number;
  updated_at: string;
}

interface TierRow extends RowDataPacket {
  tier_level: number;
  tier_name: string;
  min_recharge_cny: number;
  referral_quota: number;
  commission_pct: number;
  description: string | null;
}

interface CodeRow extends RowDataPacket {
  code: string;
  user_id: string;
  created_at: string;
}

interface EventRow extends RowDataPacket {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: string;
  register_reward_points: number;
  register_reward_scheduled_at: string | null;
  register_reward_granted_at: string | null;
  register_reward_ledger_id: string | null;
  activity_count: number;
  recharged_points_total: number;
  commission_points_total: number;
  referred_ip: string | null;
  referred_device_fp: string | null;
  flag_reason: string | null;
  created_at: string;
  activated_at: string | null;
}

interface CommissionRow extends RowDataPacket {
  id: string;
  referrer_id: string;
  referral_event_id: string;
  recharged_points: number;
  commission_pct: number;
  commission_points: number;
  status: string;
  settle_at: string;
  settled_at: string | null;
  ledger_id: string | null;
  cancel_reason: string | null;
  created_at: string;
}

interface CountRow extends RowDataPacket {
  cnt: number;
}

interface SumRow extends RowDataPacket {
  total: number | null;
}

// ─── Schema 初始化 ──────────────────────────────────────────

/** 初始化拉新系统 5 张表（幂等） */
export async function initReferralSchema(db: AuthDb): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS referral_system_config (
        id INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        register_reward_points INTEGER NOT NULL DEFAULT 200,
        register_reward_delay_hours INTEGER NOT NULL DEFAULT 24,
        required_activity_count INTEGER NOT NULL DEFAULT 1,
        commission_delay_days INTEGER NOT NULL DEFAULT 7,
        commission_min_recharge_points INTEGER NOT NULL DEFAULT 100,
        flag_same_ip_count INTEGER NOT NULL DEFAULT 3,
        max_monthly_register_rewards INTEGER NOT NULL DEFAULT 50,
        max_monthly_commission_points INTEGER NOT NULL DEFAULT 50000,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS referral_tiers (
        tier_level INTEGER NOT NULL PRIMARY KEY,
        tier_name TEXT NOT NULL,
        min_recharge_cny REAL NOT NULL,
        referral_quota INTEGER NOT NULL,
        commission_pct REAL NOT NULL DEFAULT 0,
        description TEXT
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        code TEXT NOT NULL PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS referral_events (
        id TEXT NOT NULL PRIMARY KEY,
        referrer_id TEXT NOT NULL,
        referred_id TEXT NOT NULL UNIQUE,
        referral_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','active','rewarded','flagged','invalid')),
        register_reward_points INTEGER NOT NULL DEFAULT 0,
        register_reward_scheduled_at TEXT,
        register_reward_granted_at TEXT,
        register_reward_ledger_id TEXT,
        activity_count INTEGER NOT NULL DEFAULT 0,
        recharged_points_total INTEGER NOT NULL DEFAULT 0,
        commission_points_total INTEGER NOT NULL DEFAULT 0,
        referred_ip TEXT,
        referred_device_fp TEXT,
        flag_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        activated_at TEXT
      )
    `);
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_id)');
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_referral_events_status_scheduled ON referral_events(status, register_reward_scheduled_at)');

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS referral_commission_queue (
        id TEXT NOT NULL PRIMARY KEY,
        referrer_id TEXT NOT NULL,
        referral_event_id TEXT NOT NULL,
        recharged_points INTEGER NOT NULL,
        commission_pct REAL NOT NULL,
        commission_points INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','settled','cancelled')),
        settle_at TEXT NOT NULL,
        settled_at TEXT,
        ledger_id TEXT,
        cancel_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_referral_commission_settle ON referral_commission_queue(settle_at, status)');
    await conn.execute('CREATE INDEX IF NOT EXISTS idx_referral_commission_referrer ON referral_commission_queue(referrer_id)');

    // 插入默认配置（幂等）
    await conn.execute(`
      INSERT OR IGNORE INTO referral_system_config (id) VALUES (1)
    `);

    // 插入默认席位等级（幂等）
    for (const tier of DEFAULT_REFERRAL_TIERS) {
      await conn.execute(
        `INSERT OR IGNORE INTO referral_tiers (tier_level, tier_name, min_recharge_cny, referral_quota, commission_pct, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tier.tierLevel, tier.tierName, tier.minRechargeCny, tier.referralQuota, tier.commissionPct, tier.description],
      );
    }

    log.info('拉新系统数据库表结构就绪');
  } finally {
    conn.release();
  }
}

// ─── 配置 CRUD ──────────────────────────────────────────────

function rowToConfig(row: ConfigRow): ReferralSystemConfig {
  return {
    enabled: row.enabled === 1,
    registerRewardPoints: row.register_reward_points,
    registerRewardDelayHours: row.register_reward_delay_hours,
    requiredActivityCount: row.required_activity_count,
    commissionDelayDays: row.commission_delay_days,
    commissionMinRechargePoints: row.commission_min_recharge_points,
    flagSameIpCount: row.flag_same_ip_count,
    maxMonthlyRegisterRewards: row.max_monthly_register_rewards,
    maxMonthlyCommissionPoints: row.max_monthly_commission_points,
    updatedAt: row.updated_at,
  };
}

export async function getReferralConfig(db: AuthDb): Promise<ReferralSystemConfig> {
  const [rows] = await db.execute<ConfigRow[]>('SELECT * FROM referral_system_config WHERE id = 1');
  if (rows.length === 0) {
    return { ...DEFAULT_REFERRAL_CONFIG, updatedAt: new Date().toISOString() };
  }
  return rowToConfig(rows[0]);
}

export async function updateReferralConfig(
  db: AuthDb,
  patch: Partial<Omit<ReferralSystemConfig, 'updatedAt'>>,
): Promise<ReferralSystemConfig> {
  const fields: string[] = [];
  const values: (string | number | boolean)[] = [];

  if (patch.enabled !== undefined) { fields.push('enabled = ?'); values.push(patch.enabled ? 1 : 0); }
  if (patch.registerRewardPoints !== undefined) { fields.push('register_reward_points = ?'); values.push(patch.registerRewardPoints); }
  if (patch.registerRewardDelayHours !== undefined) { fields.push('register_reward_delay_hours = ?'); values.push(patch.registerRewardDelayHours); }
  if (patch.requiredActivityCount !== undefined) { fields.push('required_activity_count = ?'); values.push(patch.requiredActivityCount); }
  if (patch.commissionDelayDays !== undefined) { fields.push('commission_delay_days = ?'); values.push(patch.commissionDelayDays); }
  if (patch.commissionMinRechargePoints !== undefined) { fields.push('commission_min_recharge_points = ?'); values.push(patch.commissionMinRechargePoints); }
  if (patch.flagSameIpCount !== undefined) { fields.push('flag_same_ip_count = ?'); values.push(patch.flagSameIpCount); }
  if (patch.maxMonthlyRegisterRewards !== undefined) { fields.push('max_monthly_register_rewards = ?'); values.push(patch.maxMonthlyRegisterRewards); }
  if (patch.maxMonthlyCommissionPoints !== undefined) { fields.push('max_monthly_commission_points = ?'); values.push(patch.maxMonthlyCommissionPoints); }

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    await db.execute(`UPDATE referral_system_config SET ${fields.join(', ')} WHERE id = 1`, values);
  }
  return getReferralConfig(db);
}

// ─── 席位等级 ────────────────────────────────────────────────

function rowToTier(row: TierRow): ReferralTier {
  return {
    tierLevel: row.tier_level,
    tierName: row.tier_name,
    minRechargeCny: Number(row.min_recharge_cny),
    referralQuota: row.referral_quota,
    commissionPct: Number(row.commission_pct),
    description: row.description,
  };
}

export async function getReferralTiers(db: AuthDb): Promise<ReferralTier[]> {
  const [rows] = await db.execute<TierRow[]>('SELECT * FROM referral_tiers ORDER BY tier_level ASC');
  return rows.map(rowToTier);
}

export async function updateReferralTier(db: AuthDb, tierLevel: number, patch: Partial<Omit<ReferralTier, 'tierLevel'>>): Promise<void> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.tierName !== undefined) { fields.push('tier_name = ?'); values.push(patch.tierName); }
  if (patch.minRechargeCny !== undefined) { fields.push('min_recharge_cny = ?'); values.push(patch.minRechargeCny); }
  if (patch.referralQuota !== undefined) { fields.push('referral_quota = ?'); values.push(patch.referralQuota); }
  if (patch.commissionPct !== undefined) { fields.push('commission_pct = ?'); values.push(patch.commissionPct); }
  if ('description' in patch) { fields.push('description = ?'); values.push(patch.description ?? null); }

  if (fields.length > 0) {
    values.push(tierLevel);
    await db.execute(`UPDATE referral_tiers SET ${fields.join(', ')} WHERE tier_level = ?`, values);
  }
}

// ─── 推荐码 ──────────────────────────────────────────────────

function rowToCode(row: CodeRow): ReferralCode {
  return { code: row.code, userId: row.user_id, createdAt: row.created_at };
}

export async function getOrCreateReferralCode(db: AuthDb, userId: string): Promise<ReferralCode> {
  const [existing] = await db.execute<CodeRow[]>(
    'SELECT * FROM referral_codes WHERE user_id = ?',
    [userId],
  );
  if (existing.length > 0) return rowToCode(existing[0]);

  const code = randomBytes(REFERRAL_CODE_BYTES).toString('hex');
  await db.execute(
    'INSERT INTO referral_codes (code, user_id) VALUES (?, ?)',
    [code, userId],
  );
  const createdAt = new Date().toISOString();
  return { code, userId, createdAt };
}

export async function getReferralCodeByCode(db: AuthDb, code: string): Promise<ReferralCode | null> {
  const [rows] = await db.execute<CodeRow[]>(
    'SELECT * FROM referral_codes WHERE code = ?',
    [code],
  );
  return rows.length > 0 ? rowToCode(rows[0]) : null;
}

// ─── 拉新事件 ────────────────────────────────────────────────

function rowToEvent(row: EventRow): ReferralEvent {
  return {
    id: row.id,
    referrerId: row.referrer_id,
    referredId: row.referred_id,
    referralCode: row.referral_code,
    status: row.status as ReferralEvent['status'],
    registerRewardPoints: row.register_reward_points,
    registerRewardScheduledAt: row.register_reward_scheduled_at,
    registerRewardGrantedAt: row.register_reward_granted_at,
    registerRewardLedgerId: row.register_reward_ledger_id,
    activityCount: row.activity_count,
    rechargedPointsTotal: row.recharged_points_total,
    commissionPointsTotal: row.commission_points_total,
    referredIp: row.referred_ip,
    referredDeviceFp: row.referred_device_fp,
    flagReason: row.flag_reason,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
  };
}

export async function createReferralEvent(
  db: AuthDb,
  data: {
    referrerId: string;
    referredId: string;
    referralCode: string;
    registerRewardPoints: number;
    registerRewardDelayHours: number;
    referredIp: string | null;
    referredDeviceFp: string | null;
    isSuspectedFraud: boolean;
    flagReason: string | null;
  },
): Promise<ReferralEvent> {
  const id = randomUUID();
  const now = new Date();
  const scheduledAt = new Date(now.getTime() + data.registerRewardDelayHours * 3600 * 1000);
  const status = data.isSuspectedFraud ? 'flagged' : 'pending';

  await db.execute(
    `INSERT INTO referral_events
     (id, referrer_id, referred_id, referral_code, status, register_reward_points,
      register_reward_scheduled_at, referred_ip, referred_device_fp, flag_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, data.referrerId, data.referredId, data.referralCode, status,
      data.registerRewardPoints, scheduledAt.toISOString().slice(0, 19).replace('T', ' '),
      data.referredIp, data.referredDeviceFp, data.flagReason,
    ],
  );

  const event = await getReferralEventById(db, id);
  if (!event) throw new Error('Failed to create referral event');
  return event;
}

export async function getReferralEventById(db: AuthDb, id: string): Promise<ReferralEvent | null> {
  const [rows] = await db.execute<EventRow[]>('SELECT * FROM referral_events WHERE id = ?', [id]);
  return rows.length > 0 ? rowToEvent(rows[0]) : null;
}

export async function getReferralEventByReferred(db: AuthDb, referredId: string): Promise<ReferralEvent | null> {
  const [rows] = await db.execute<EventRow[]>(
    'SELECT * FROM referral_events WHERE referred_id = ?',
    [referredId],
  );
  return rows.length > 0 ? rowToEvent(rows[0]) : null;
}

export async function markReferralEventActive(db: AuthDb, id: string): Promise<void> {
  await db.execute(
    `UPDATE referral_events SET status = 'active', activated_at = CURRENT_TIMESTAMP,
     activity_count = activity_count + 1 WHERE id = ? AND status = 'pending'`,
    [id],
  );
}

export async function markReferralRewardGranted(
  db: AuthDb,
  id: string,
  ledgerId: string,
): Promise<void> {
  await db.execute(
    `UPDATE referral_events
     SET status = 'rewarded', register_reward_granted_at = CURRENT_TIMESTAMP, register_reward_ledger_id = ?
     WHERE id = ?`,
    [ledgerId, id],
  );
}

export async function incrementReferralActivity(db: AuthDb, eventId: string): Promise<void> {
  await db.execute(
    'UPDATE referral_events SET activity_count = activity_count + 1 WHERE id = ?',
    [eventId],
  );
}

export async function addReferralRechargedPoints(db: AuthDb, eventId: string, points: number): Promise<void> {
  await db.execute(
    'UPDATE referral_events SET recharged_points_total = recharged_points_total + ? WHERE id = ?',
    [points, eventId],
  );
}

/** 获取推荐人已用配额（被推荐人非 invalid 的数量） */
export async function getReferrerQuotaUsed(db: AuthDb, referrerId: string): Promise<number> {
  const [rows] = await db.execute<CountRow[]>(
    `SELECT COUNT(*) AS cnt FROM referral_events
     WHERE referrer_id = ? AND status != 'invalid'`,
    [referrerId],
  );
  return rows[0]?.cnt ?? 0;
}

/** 获取可发放注册奖励的事件列表（active + scheduled_at <= now） */
export async function getPendingRegisterRewards(db: AuthDb): Promise<ReferralEvent[]> {
  const [rows] = await db.execute<EventRow[]>(
    `SELECT * FROM referral_events
     WHERE status = 'active'
       AND register_reward_scheduled_at IS NOT NULL
       AND register_reward_scheduled_at <= CURRENT_TIMESTAMP
       AND register_reward_granted_at IS NULL`,
  );
  return rows.map(rowToEvent);
}

/** 列出某推荐人的拉新事件（分页） */
export async function listReferralEventsByReferrer(
  db: AuthDb,
  referrerId: string,
  limit = 20,
  offset = 0,
): Promise<ReferralEvent[]> {
  // LIMIT/OFFSET 不能用 ? 占位（MySQL2 prepared statement 对整数类型有约束），内联安全整数
  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeOffset = Math.max(0, Math.trunc(offset));
  const [rows] = await db.execute<EventRow[]>(
    `SELECT * FROM referral_events WHERE referrer_id = ? ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    [referrerId],
  );
  return rows.map(rowToEvent);
}

/** 同 IP 注册的被推荐人数量（用于反欺诈） */
export async function countReferralsByIp(db: AuthDb, ip: string): Promise<number> {
  const [rows] = await db.execute<CountRow[]>(
    "SELECT COUNT(*) AS cnt FROM referral_events WHERE referred_ip = ? AND status != 'invalid'",
    [ip],
  );
  return rows[0]?.cnt ?? 0;
}

// ─── 佣金队列 ────────────────────────────────────────────────

function rowToCommission(row: CommissionRow): CommissionQueueItem {
  return {
    id: row.id,
    referrerId: row.referrer_id,
    referralEventId: row.referral_event_id,
    rechargedPoints: row.recharged_points,
    commissionPct: Number(row.commission_pct),
    commissionPoints: row.commission_points,
    status: row.status as CommissionQueueItem['status'],
    settleAt: row.settle_at,
    settledAt: row.settled_at,
    ledgerId: row.ledger_id,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
  };
}

export async function enqueueCommission(
  db: AuthDb,
  data: {
    referrerId: string;
    referralEventId: string;
    rechargedPoints: number;
    commissionPct: number;
    commissionPoints: number;
    commissionDelayDays: number;
  },
): Promise<CommissionQueueItem> {
  const id = randomUUID();
  const settleAt = new Date(Date.now() + data.commissionDelayDays * 86400 * 1000);

  await db.execute(
    `INSERT INTO referral_commission_queue
     (id, referrer_id, referral_event_id, recharged_points, commission_pct, commission_points, settle_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id, data.referrerId, data.referralEventId, data.rechargedPoints,
      data.commissionPct, data.commissionPoints,
      settleAt.toISOString().slice(0, 19).replace('T', ' '),
    ],
  );

  const item = await getCommissionById(db, id);
  if (!item) throw new Error('Failed to create commission queue item');
  return item;
}

export async function getCommissionById(db: AuthDb, id: string): Promise<CommissionQueueItem | null> {
  const [rows] = await db.execute<CommissionRow[]>(
    'SELECT * FROM referral_commission_queue WHERE id = ?',
    [id],
  );
  return rows.length > 0 ? rowToCommission(rows[0]) : null;
}

/** 获取到期待结算的佣金（调度器用，settle_at <= now） */
export async function getDueCommissions(db: AuthDb): Promise<CommissionQueueItem[]> {
  const [rows] = await db.execute<CommissionRow[]>(
    "SELECT * FROM referral_commission_queue WHERE status = 'pending' AND settle_at <= CURRENT_TIMESTAMP ORDER BY created_at ASC LIMIT 100",
  );
  return rows.map(rowToCommission);
}

/** 获取某推荐人的全部佣金记录（用户面板用） */
export async function getCommissionsByReferrer(db: AuthDb, referrerId: string): Promise<CommissionQueueItem[]> {
  const [rows] = await db.execute<CommissionRow[]>(
    'SELECT * FROM referral_commission_queue WHERE referrer_id = ? ORDER BY created_at DESC LIMIT 200',
    [referrerId],
  );
  return rows.map(rowToCommission);
}

export async function markCommissionSettled(db: AuthDb, id: string, ledgerId: string): Promise<void> {
  await db.execute(
    "UPDATE referral_commission_queue SET status = 'settled', settled_at = CURRENT_TIMESTAMP, ledger_id = ? WHERE id = ?",
    [ledgerId, id],
  );
}

/** 统计推荐人本月已获佣金积分（防月度上限） */
export async function getMonthlyCommissionPoints(db: AuthDb, referrerId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [rows] = await db.execute<SumRow[]>(
    `SELECT SUM(commission_points) AS total FROM referral_commission_queue
     WHERE referrer_id = ? AND status = 'settled' AND settled_at >= ?`,
    [referrerId, startOfMonth.toISOString().slice(0, 19).replace('T', ' ')],
  );
  return rows[0]?.total ?? 0;
}

/** 统计推荐人本月已发注册奖励次数 */
export async function getMonthlyRegisterRewardCount(db: AuthDb, referrerId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [rows] = await db.execute<CountRow[]>(
    `SELECT COUNT(*) AS cnt FROM referral_events
     WHERE referrer_id = ? AND register_reward_granted_at >= ?`,
    [referrerId, startOfMonth.toISOString().slice(0, 19).replace('T', ' ')],
  );
  return rows[0]?.cnt ?? 0;
}

export { randomUUID };
