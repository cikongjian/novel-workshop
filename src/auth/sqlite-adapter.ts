/**
 * SQLite 认证数据库适配器
 *
 * 实现 mysql2/promise Pool 的最小兼容接口，使现有 auth 服务代码无需修改
 * 即可在 SQLite（better-sqlite3）上运行。适用于 DMP 演示部署场景。
 */

import type Database from 'better-sqlite3';
import { getAppDb } from '../db/app-db.js';

export interface SqliteAuthDb {
  execute<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  query<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  getConnection(): Promise<SqliteAuthConnection>;
}

export interface SqliteAuthConnection {
  execute<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  query<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

/** 模拟 mysql2 的 ResultSetHeader */
interface FakeResultSetHeader {
  affectedRows: number;
  insertId: number;
}

/** 模拟 mysql2 的 RowDataPacket（字段名保持原始大小写，同时提供驼峰访问） */
type FakeRowDataPacket = Record<string, any>;

/**
 * 判断 SQL 是否为查询语句（SELECT / WITH / PRAGMA）
 * 用于决定使用 .all()（查询）还是 .run()（写入）
 */
function isSelect(sql: string): boolean {
  const trimmed = sql.trim();
  // 移除前导注释和空白
  const cleaned = trimmed.replace(/^\/\*[\s\S]*?\*\/\s*/g, '').replace(/^--[^\n]*\n/g, '');
  const upper = cleaned.substring(0, 15).toUpperCase();
  return upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('PRAGMA');
}

/**
 * 将 MySQL 风格的 ? 占位符转换为 SQLite 兼容格式
 * - `?` → `?N` (SQLite 默认也支持 ?)
 * - 保持参数数组不变
 * better-sqlite3 的 .run() 和 .all() 接受参数数组
 */
function normalizeParams(params: any[] | undefined): any[] {
  if (!params || params.length === 0) return [];
  return params.map((p) => {
    // MySQL 有时传 Date 对象，SQLite 接受 ISO 字符串或时间戳
    if (p instanceof Date) return p.toISOString();
    // MySQL 有时传 Buffer，SQLite 接受 Buffer
    return p;
  });
}

/** 将认证服务中残留的 MySQL 查询片段转换为 SQLite 等价语法。 */
function normalizeSql(sql: string): string {
  return sql
    .replace(
      /NOW\(\)\s*-\s*INTERVAL\s+\?\s+MINUTE/giu,
      "datetime('now', '-' || ? || ' minutes')",
    )
    .replace(/NOW\(\)/giu, 'CURRENT_TIMESTAMP')
    .replace(/\s+FOR\s+UPDATE\s*;?\s*$/iu, '');
}

function createSqliteAuthConnection(sqliteDb: Database.Database): SqliteAuthConnection {
  const db = sqliteDb;
  let inTransaction = false;

  return {
    async execute<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
      const normalizedParams = normalizeParams(params);
      const normalizedSql = normalizeSql(sql);

      if (isSelect(normalizedSql)) {
        try {
          const stmt = db.prepare(normalizedSql);
          const rows = stmt.all(...normalizedParams) as unknown as T;
          return [rows, []];
        } catch (err: any) {
          // 如果 prepare 失败（如不支持的 SQL 语法），尝试直接用 exec
          throw err;
        }
      } else {
        try {
          const stmt = db.prepare(normalizedSql);
          const result = stmt.run(...normalizedParams);
          const header: FakeResultSetHeader = {
            affectedRows: result.changes,
            insertId: Number(result.lastInsertRowid),
          };
          // better-sqlite3 .run() 返回的 insertId: 0 表示没有自增（UUID 主键等情况）
          return [header as unknown as T, []];
        } catch (err: any) {
          throw err;
        }
      }
    },

    // mysql2 兼容：connection.query()
    async query<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
      return this.execute<T>(sql, params);
    },

    async beginTransaction(): Promise<void> {
      db.exec('BEGIN');
      inTransaction = true;
    },

    async commit(): Promise<void> {
      if (inTransaction) {
        db.exec('COMMIT');
        inTransaction = false;
      }
    },

    async rollback(): Promise<void> {
      if (inTransaction) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        inTransaction = false;
      }
    },

    release(): void {
      // SQLite 同步模式，无需释放连接
      if (inTransaction) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        inTransaction = false;
      }
    },
  };
}

/**
 * 创建 SQLite 认证数据库适配器
 * 复用 app-db 的 SQLite 连接（app.db），在同一个文件中创建 auth 相关表
 */
export function createSqliteAuthDb(dataDir: string): SqliteAuthDb {
  const sqliteDb = getAppDb(); // 复用已有 SQLite 连接

  const conn = createSqliteAuthConnection(sqliteDb);

  return {
    async execute<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
      return conn.execute<T>(sql, params);
    },

    // mysql2 Pool.query() 兼容（与 execute 行为一致）
    async query<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
      return conn.execute<T>(sql, params);
    },

    async getConnection(): Promise<SqliteAuthConnection> {
      // SQLite 单连接模型，每次返回新的连接包装器（共享同一底层 DB）
      return createSqliteAuthConnection(sqliteDb);
    },
  };
}
