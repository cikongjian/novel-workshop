/**
 * 统一应用数据库
 *
 * 使用 better-sqlite3 同步 API，单文件 data/app.db。
 * 所有业务表（书城、计费、举报、访客、公告）共享同一个 DB 连接。
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { createLogger } from '../utils/logger.js';

const log = createLogger('app-db');

export type AppDb = Database.Database;

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ===================== 书城 =====================

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  novel_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  publish_status TEXT NOT NULL DEFAULT 'pending',
  audit_status TEXT NOT NULL DEFAULT 'pending',
  audit_result TEXT,
  audit_time INTEGER,
  cover_audit_status TEXT NOT NULL DEFAULT 'pending_review',
  cover_locked INTEGER NOT NULL DEFAULT 0,
  cover_audit_reject_reason TEXT,
  offline_reason TEXT,
  offline_time INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  published_chapters TEXT NOT NULL DEFAULT '[]',
  auto_update TEXT,
  publish_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_publish_status ON books(publish_status);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_update_time ON books(update_time DESC);
CREATE INDEX IF NOT EXISTS idx_books_public_updated ON books(publish_status, category, update_time DESC);
CREATE INDEX IF NOT EXISTS idx_books_public_new ON books(publish_status, category, publish_time DESC);
CREATE INDEX IF NOT EXISTS idx_books_public_hot ON books(publish_status, category, view_count DESC, like_count DESC, favorite_count DESC, comment_count DESC);
CREATE INDEX IF NOT EXISTS idx_books_cover_audit_pending ON books(cover_audit_status, update_time DESC);
CREATE INDEX IF NOT EXISTS idx_books_novel_id ON books(novel_id);

CREATE TABLE IF NOT EXISTS book_likes (
  book_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (book_id, user_id)
);

CREATE TABLE IF NOT EXISTS book_favorites (
  book_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_book_favorites_user_id ON book_favorites(user_id);

CREATE TABLE IF NOT EXISTS book_comments (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  avatar_url TEXT,
  username TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_book_comments_book_id ON book_comments(book_id);

-- ===================== 举报 =====================

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  chapter_id TEXT,
  reporter_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT,
  violation_position TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  create_time INTEGER NOT NULL,
  handler_id TEXT,
  handle_result TEXT,
  handle_time INTEGER,
  reporter_phone TEXT,
  reporter_email TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_novel_id ON reports(novel_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_create_time ON reports(create_time DESC);

-- ===================== 访客统计 =====================

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
CREATE INDEX IF NOT EXISTS idx_guest_visits_last_seen ON guest_visits(last_seen_at DESC);

-- ===================== 公告 =====================

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'active',
  show_in_banner INTEGER NOT NULL DEFAULT 0,
  show_in_modal INTEGER NOT NULL DEFAULT 0,
  show_in_dashboard INTEGER NOT NULL DEFAULT 1,
  target_roles TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER,
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);

-- ===================== 计费：账户 =====================

CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id TEXT PRIMARY KEY,
  balance_points INTEGER NOT NULL DEFAULT 0,
  frozen_points INTEGER NOT NULL DEFAULT 0,
  lifetime_recharge_points INTEGER NOT NULL DEFAULT 0,
  lifetime_recharge_cny REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- ===================== 计费：流水 =====================

CREATE TABLE IF NOT EXISTS billing_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  biz_type TEXT NOT NULL,
  biz_id TEXT,
  delta_points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  frozen_after INTEGER NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_user ON billing_ledger(user_id, created_at DESC);

-- ===================== 计费：兑换码 =====================

CREATE TABLE IF NOT EXISTS redemption_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  points INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  owner_user_id TEXT,
  package_id TEXT,
  status TEXT NOT NULL DEFAULT 'issued',
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT,
  redeemed_at TEXT,
  redeemed_by_user_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_status ON redemption_codes(status);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_owner ON redemption_codes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_redeemed_by ON redemption_codes(redeemed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_created_at ON redemption_codes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_source ON redemption_codes(source_type, source_id, created_at DESC);

-- ===================== 计费：充值订单 =====================

CREATE TABLE IF NOT EXISTS topup_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Account topup',
  package_id TEXT,
  amount_cny REAL NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  bonus_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'demo',
  status TEXT NOT NULL DEFAULT 'created',
  payment_scene TEXT NOT NULL DEFAULT 'demo',
  remark TEXT NOT NULL DEFAULT '',
  channel_trade_no TEXT,
  payment_url TEXT,
  code_url TEXT,
  failure_reason TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  paid_at TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_topup_orders_user ON topup_orders(user_id, created_at DESC);

-- ===================== 作家分 =====================

CREATE TABLE IF NOT EXISTS writer_scores (
  user_id TEXT PRIMARY KEY,
  score REAL NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  combo_days INTEGER NOT NULL DEFAULT 0,
  combo_multiplier REAL NOT NULL DEFAULT 1.0,
  burst_score INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writer_score_bursts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  burst_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  triggered_at TEXT NOT NULL,
  UNIQUE(user_id, burst_type)
);
CREATE INDEX IF NOT EXISTS idx_writer_score_bursts_user ON writer_score_bursts(user_id);

CREATE TABLE IF NOT EXISTS writer_level_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  score_at_change REAL NOT NULL,
  changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_writer_level_changes_user ON writer_level_changes(user_id, changed_at DESC);
`;

let _db: AppDb | null = null;

export function initAppDb(dataDir: string): AppDb {
  if (_db) return _db;

  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'app.db');
  const db = new Database(dbPath);

  // 逐条执行 schema（better-sqlite3 exec 支持多语句）
  db.exec(SCHEMA_SQL);

  // 迁移：为已有表添加新列（IF NOT EXISTS 不支持 ALTER，用 try/catch 兼容）
  const migrations = [
    'ALTER TABLE topup_orders ADD COLUMN title TEXT NOT NULL DEFAULT \'Account topup\'',
    'ALTER TABLE topup_orders ADD COLUMN bonus_points INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE topup_orders ADD COLUMN total_points INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE topup_orders ADD COLUMN channel TEXT NOT NULL DEFAULT \'demo\'',
    'ALTER TABLE topup_orders ADD COLUMN payment_scene TEXT NOT NULL DEFAULT \'demo\'',
    'ALTER TABLE topup_orders ADD COLUMN remark TEXT NOT NULL DEFAULT \'\'',
    'ALTER TABLE topup_orders ADD COLUMN channel_trade_no TEXT',
    'ALTER TABLE topup_orders ADD COLUMN payment_url TEXT',
    'ALTER TABLE topup_orders ADD COLUMN code_url TEXT',
    'ALTER TABLE topup_orders ADD COLUMN failure_reason TEXT',
    'ALTER TABLE topup_orders ADD COLUMN metadata TEXT',
    'ALTER TABLE topup_orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT \'\' ',
    'ALTER TABLE topup_orders ADD COLUMN expires_at TEXT',
    'ALTER TABLE topup_orders ADD COLUMN closed_at TEXT',
    'CREATE INDEX IF NOT EXISTS idx_topup_orders_channel_trade ON topup_orders(channel_trade_no)',
    'ALTER TABLE book_comments ADD COLUMN author_name TEXT NOT NULL DEFAULT \'\'',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* 列已存在，忽略 */ }
  }

  log.info(`AppDb 已初始化: ${dbPath}`);
  _db = db;
  return db;
}

export function getAppDb(): AppDb {
  if (!_db) throw new Error('AppDb 未初始化，请先调用 initAppDb()');
  return _db;
}

export function closeAppDb(): void {
  _db?.close();
  _db = null;
}
