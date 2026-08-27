import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthDb } from './types.js';
import type { RealNameScene } from './real-name-policy.js';
import type { RealNameVerificationProviderId } from './real-name-provider.js';

export type RealNameAuditAction = 'verify_submission' | 'policy_update';
export type RealNameAuditStatus = 'success' | 'rejected';

export type RealNameAuditLogInput = {
  action: RealNameAuditAction;
  status: RealNameAuditStatus;
  userId?: string | null;
  operatorUserId?: string | null;
  scene?: RealNameScene | null;
  provider?: RealNameVerificationProviderId | null;
  detail?: string | null;
};

export interface RealNameAuditLogRow extends RowDataPacket {
  id: string;
  action: RealNameAuditAction;
  status: RealNameAuditStatus;
  user_id: string | null;
  operator_user_id: string | null;
  scene: RealNameScene | null;
  provider: RealNameVerificationProviderId | null;
  detail: string | null;
  created_at: string;
  username: string | null;
  operator_username: string | null;
}

interface RealNameRejectedSummaryRow extends RowDataPacket {
  failed_count: number;
  latest_created_at: string | null;
}

export async function appendRealNameAuditLog(
  db: AuthDb,
  input: RealNameAuditLogInput,
): Promise<void> {
  await db.execute<ResultSetHeader>(
    `INSERT INTO real_name_audit_logs (
      id,
      action,
      status,
      user_id,
      operator_user_id,
      scene,
      provider,
      detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.action,
      input.status,
      input.userId ?? null,
      input.operatorUserId ?? null,
      input.scene ?? null,
      input.provider ?? null,
      input.detail ?? null,
    ],
  );
}

export async function listRealNameAuditLogs(
  db: AuthDb,
  limit = 20,
): Promise<RealNameAuditLogRow[]> {
  const [rows] = await db.query<RealNameAuditLogRow[]>(
    `SELECT
      logs.id,
      logs.action,
      logs.status,
      logs.user_id,
      logs.operator_user_id,
      logs.scene,
      logs.provider,
      logs.detail,
      logs.created_at,
      users.username,
      operators.username AS operator_username
     FROM real_name_audit_logs logs
     LEFT JOIN users ON users.id = logs.user_id
     LEFT JOIN users operators ON operators.id = logs.operator_user_id
     ORDER BY logs.created_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows;
}

export async function getRecentRejectedRealNameSummary(
  db: AuthDb,
  userId: string,
  cooldownMinutes: number,
): Promise<{ failedCount: number; latestCreatedAt: string | null }> {
  const [rows] = await db.query<RealNameRejectedSummaryRow[]>(
    `SELECT
      COUNT(*) AS failed_count,
      MAX(created_at) AS latest_created_at
     FROM real_name_audit_logs
     WHERE user_id = ?
       AND action = 'verify_submission'
       AND status = 'rejected'
       AND created_at >= (NOW() - INTERVAL ? MINUTE)`,
    [userId, cooldownMinutes],
  );

  return {
    failedCount: Number(rows[0]?.failed_count ?? 0),
    latestCreatedAt: rows[0]?.latest_created_at ?? null,
  };
}
