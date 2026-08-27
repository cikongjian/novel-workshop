import type { AuthDb } from './types.js';
import { createSqliteAuthDb } from './sqlite-adapter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AuthDB');

export function createAuthDb(dataDir: string): AuthDb {
  return createSqliteAuthDb(dataDir);
}

export async function initAuthSchema(db: AuthDb): Promise<void> {
  const conn = await db.getConnection();
  try {
    // 用户表（SQLite 兼容，一次性包含所有字段，无需迁移函数）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT NOT NULL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
        phone TEXT,
        pen_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        email TEXT,
        creator_status TEXT NOT NULL DEFAULT 'approved' CHECK(creator_status IN ('none','pending','approved','rejected','suspended')),
        creator_applied_at TEXT,
        creator_approved_at TEXT,
        creator_rejected_at TEXT,
        creator_reject_reason TEXT,
        real_name TEXT,
        real_name_masked TEXT,
        real_name_id_number_hash TEXT,
        real_name_id_number_masked TEXT,
        real_name_phone_hash TEXT,
        real_name_phone_masked TEXT,
        real_name_verified_at TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 已有库补 last_login_at 列（幂等：列已存在时 SQLite 报 duplicate column，忽略即可）
    try {
      await conn.execute('ALTER TABLE users ADD COLUMN last_login_at TEXT');
    } catch (err) {
      const msg = String((err as { message?: unknown })?.message ?? err);
      if (!msg.includes('duplicate column')) throw err;
    }

    // 邀请码表（SQLite 兼容）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT NOT NULL PRIMARY KEY,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 邀请申请表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS invite_applications (
        id TEXT NOT NULL PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        phone TEXT,
        identity_label TEXT,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        admin_note TEXT,
        invite_code TEXT,
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 创作者申请表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS creator_applications (
        id TEXT NOT NULL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pen_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        bio TEXT,
        reason TEXT NOT NULL DEFAULT '',
        sample_work TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        admin_note TEXT,
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 实名认证审计日志表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS real_name_audit_logs (
        id TEXT NOT NULL PRIMARY KEY,
        action TEXT NOT NULL CHECK(action IN ('verify_submission','policy_update')),
        status TEXT NOT NULL CHECK(status IN ('success','rejected')),
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        operator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        scene TEXT CHECK(scene IN ('comment','creatorApplication','bookPublishing','billing')),
        provider TEXT,
        detail TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 用户 API 密钥配置表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_api_profiles (
        id TEXT NOT NULL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL DEFAULT 'model' CHECK(scope IN ('model','image-generation')),
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        storage_mode TEXT NOT NULL CHECK(storage_mode IN ('server','local')),
        encrypted_api_key TEXT,
        masked_api_key TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    log.info('认证数据库表结构就绪 (SQLite)');
  } finally {
    conn.release();
  }

  // 拉新接口会随认证服务一起挂载，表结构失败时必须阻止认证系统继续启动。
  const { initReferralSchema } = await import('../referral/referral-db.js');
  await initReferralSchema(db);
}
