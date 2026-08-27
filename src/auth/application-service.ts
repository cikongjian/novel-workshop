import { randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { AuthDb } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ApplicationService');
const INVITE_CODE_BYTES = 8;

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface ApplicationInput {
  email: string;
  name: string;
  phone?: string;
  identityLabel?: string;
  reason?: string;
}

export interface Application {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  identityLabel: string | null;
  reason: string | null;
  status: ApplicationStatus;
  adminNote: string | null;
  inviteCode: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface ApplicationRow extends RowDataPacket {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  identity_label: string | null;
  reason: string | null;
  status: ApplicationStatus;
  admin_note: string | null;
  invite_code: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface CountRow extends RowDataPacket {
  cnt: number;
}

function rowToApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    identityLabel: row.identity_label,
    reason: row.reason,
    status: row.status,
    adminNote: row.admin_note,
    inviteCode: row.invite_code,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

function getDbErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

function isApplicationSchemaUnavailable(error: unknown): boolean {
  const code = getDbErrorCode(error);
  return code === 'ER_NO_SUCH_TABLE'
    || code === 'ER_BAD_DB_ERROR'
    || code === 'ER_BAD_FIELD_ERROR';
}

function isApplicationStoreUnavailable(error: unknown): boolean {
  return isApplicationSchemaUnavailable(error)
    || getDbErrorCode(error) === 'ECONNREFUSED'
    || getDbErrorCode(error) === 'PROTOCOL_CONNECTION_LOST'
    || getDbErrorCode(error) === 'PROTOCOL_SEQUENCE_TIMEOUT';
}

function wrapUnavailableError(error: unknown, fallbackMessage: string): never {
  if (isApplicationStoreUnavailable(error)) {
    throw new ApplicationError(fallbackMessage, 503);
  }
  throw error;
}

export async function submitApplication(db: AuthDb, data: ApplicationInput): Promise<string> {
  try {
    const [existing] = await db.execute<ApplicationRow[]>(
      'SELECT id FROM invite_applications WHERE email = ? AND status = ?',
      [data.email, 'pending'],
    );

    if (existing.length > 0) {
      throw new ApplicationError('A pending application already exists for this email.', 409);
    }

    const id = randomUUID();
    await db.execute(
      `INSERT INTO invite_applications (id, email, name, phone, identity_label, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.email, data.name, data.phone ?? null, data.identityLabel ?? null, data.reason ?? null],
    );

    log.info(`invite application submitted: ${id} (${data.email})`);
    return id;
  } catch (error) {
    wrapUnavailableError(error, 'Application service is temporarily unavailable.');
  }
}

export async function listApplications(
  db: AuthDb,
  filter: { status?: ApplicationStatus; page?: number; pageSize?: number },
): Promise<{ items: Application[]; total: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [countRows] = await db.execute<CountRow[]>(
      `SELECT COUNT(*) AS cnt FROM invite_applications ${where}`,
      params,
    );
    const [rows] = await db.execute<ApplicationRow[]>(
      `SELECT * FROM invite_applications ${where} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

    return {
      items: rows.map(rowToApplication),
      total: Number(countRows[0]?.cnt ?? 0),
    };
  } catch (error) {
    log.warn('invite applications query failed, returning empty list', {
      code: getDbErrorCode(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return { items: [], total: 0 };
  }
}

export async function approveApplication(
  db: AuthDb,
  appId: string,
  adminId: string,
  adminNote?: string,
): Promise<{ application: Application; inviteCode: string }> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<ApplicationRow[]>(
      'SELECT * FROM invite_applications WHERE id = ? FOR UPDATE',
      [appId],
    );
    if (rows.length === 0) {
      throw new ApplicationError('Application not found.', 404);
    }
    if (rows[0].status !== 'pending') {
      throw new ApplicationError('Application has already been reviewed.', 400);
    }

    const inviteCode = randomBytes(INVITE_CODE_BYTES).toString('hex');
    await conn.execute(
      'INSERT INTO invite_codes (code, created_by) VALUES (?, ?)',
      [inviteCode, adminId],
    );
    await conn.execute(
      `UPDATE invite_applications
       SET status = 'approved', invite_code = ?, reviewed_by = ?, reviewed_at = NOW(), admin_note = ?
       WHERE id = ?`,
      [inviteCode, adminId, adminNote ?? null, appId],
    );

    await conn.commit();

    const [updatedRows] = await db.execute<ApplicationRow[]>(
      'SELECT * FROM invite_applications WHERE id = ?',
      [appId],
    );

    log.info(`invite application approved: ${appId}`);
    return {
      application: rowToApplication(updatedRows[0]),
      inviteCode,
    };
  } catch (error) {
    await conn.rollback();
    if (error instanceof ApplicationError) {
      throw error;
    }
    wrapUnavailableError(error, 'Application service is temporarily unavailable.');
  } finally {
    conn.release();
  }
}

export async function rejectApplication(
  db: AuthDb,
  appId: string,
  adminId: string,
  adminNote?: string,
): Promise<Application> {
  try {
    const [rows] = await db.execute<ApplicationRow[]>(
      'SELECT * FROM invite_applications WHERE id = ?',
      [appId],
    );
    if (rows.length === 0) {
      throw new ApplicationError('Application not found.', 404);
    }
    if (rows[0].status !== 'pending') {
      throw new ApplicationError('Application has already been reviewed.', 400);
    }

    await db.execute(
      `UPDATE invite_applications
       SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), admin_note = ?
       WHERE id = ?`,
      [adminId, adminNote ?? null, appId],
    );

    const [updatedRows] = await db.execute<ApplicationRow[]>(
      'SELECT * FROM invite_applications WHERE id = ?',
      [appId],
    );

    log.info(`invite application rejected: ${appId}`);
    return rowToApplication(updatedRows[0]);
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    wrapUnavailableError(error, 'Application service is temporarily unavailable.');
  }
}

export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
