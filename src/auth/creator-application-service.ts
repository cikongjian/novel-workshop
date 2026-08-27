import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthDb, CreatorStatus, UserProfile } from './types.js';
import { getProfile } from './user-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CreatorApplicationService');

export type CreatorApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface CreatorApplicationInput {
  penName: string;
  email: string;
  bio?: string | null;
  reason: string;
  sampleWork?: string | null;
}

export interface CreatorApplicationListFilter {
  status?: CreatorApplicationStatus;
  userId?: string;
  page?: number;
  pageSize?: number;
}

export interface ReviewCreatorApplicationInput {
  status: Exclude<CreatorApplicationStatus, 'pending'>;
  adminNote?: string | null;
  operatorId: string;
}

export interface CreatorApplicationRecord {
  id: string;
  userId: string;
  username: string;
  penName: string;
  email: string;
  bio: string | null;
  reason: string;
  sampleWork: string | null;
  status: CreatorApplicationStatus;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedByUsername: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreatorStateRow extends RowDataPacket {
  id: string;
  username: string;
  role: 'user' | 'admin';
  creator_status: CreatorStatus;
}

interface CreatorApplicationRow extends RowDataPacket {
  id: string;
  user_id: string;
  username: string;
  pen_name: string;
  email: string;
  bio: string | null;
  reason: string;
  sample_work: string | null;
  status: CreatorApplicationStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_by_username: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized : null;
}

function rowToCreatorApplication(row: CreatorApplicationRow): CreatorApplicationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    penName: row.pen_name,
    email: row.email,
    bio: row.bio,
    reason: row.reason,
    sampleWork: row.sample_work,
    status: row.status,
    adminNote: row.admin_note,
    reviewedBy: row.reviewed_by,
    reviewedByUsername: row.reviewed_by_username,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireProfile(db: AuthDb, userId: string): Promise<UserProfile> {
  const profile = await getProfile(db, userId);
  if (!profile) {
    throw new Error('用户不存在');
  }
  return profile;
}

export async function submitCreatorApplication(
  db: AuthDb,
  userId: string,
  input: CreatorApplicationInput,
): Promise<UserProfile> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.execute<CreatorStateRow[]>(
      'SELECT id, username, role, creator_status FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );
    const user = userRows[0];
    if (!user) {
      throw new Error('用户不存在');
    }
    if (user.role === 'admin') {
      throw new CreatorApplicationError('管理员账号无需申请作家资格', 400);
    }
    if (user.creator_status === 'approved') {
      throw new CreatorApplicationError('当前账号已拥有作家资格', 400);
    }
    if (user.creator_status === 'pending') {
      throw new CreatorApplicationError('作家申请正在审核中', 409);
    }
    if (user.creator_status === 'suspended') {
      throw new CreatorApplicationError('当前作家资格已被停用，请联系管理员', 400);
    }

    const [pendingRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM creator_applications WHERE user_id = ? AND status = ? LIMIT 1 FOR UPDATE',
      [userId, 'pending'],
    );
    if (pendingRows.length > 0) {
      throw new CreatorApplicationError('已有待审核的作家申请，请等待处理', 409);
    }

    const [emailConflictRows] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
      [input.email, userId],
    );
    if (emailConflictRows.length > 0) {
      throw new CreatorApplicationError('该邮箱已被其他账号使用', 409);
    }

    const applicationId = randomUUID();
    const bio = normalizeText(input.bio);
    const sampleWork = normalizeText(input.sampleWork);

    await conn.execute<ResultSetHeader>(
      `INSERT INTO creator_applications (
        id,
        user_id,
        pen_name,
        email,
        bio,
        reason,
        sample_work
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        applicationId,
        userId,
        input.penName,
        input.email,
        bio,
        input.reason,
        sampleWork,
      ],
    );

    await conn.execute<ResultSetHeader>(
      `UPDATE users
       SET pen_name = ?,
           email = ?,
           bio = ?,
           creator_status = 'pending',
           creator_applied_at = NOW(),
           creator_approved_at = NULL,
           creator_rejected_at = NULL,
           creator_reject_reason = NULL
       WHERE id = ?`,
      [input.penName, input.email, bio, userId],
    );

    await conn.commit();
    log.info(`user ${user.username} submitted creator application ${applicationId}`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return requireProfile(db, userId);
}

export async function listCreatorApplications(
  db: AuthDb,
  filter: CreatorApplicationListFilter = {},
): Promise<{ items: CreatorApplicationRecord[]; total: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const whereParts: string[] = [];
  const params: Array<string | number> = [];

  if (filter.status) {
    whereParts.push('ca.status = ?');
    params.push(filter.status);
  }

  if (filter.userId) {
    whereParts.push('ca.user_id = ?');
    params.push(filter.userId);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [countRows] = await db.execute<CountRow[]>(
    `SELECT COUNT(*) AS total
     FROM creator_applications ca
     ${whereClause}`,
    params,
  );

  const [rows] = await db.execute<CreatorApplicationRow[]>(
    `SELECT
       ca.id,
       ca.user_id,
       u.username,
       ca.pen_name,
       ca.email,
       ca.bio,
       ca.reason,
       ca.sample_work,
       ca.status,
       ca.admin_note,
       ca.reviewed_by,
       reviewer.username AS reviewed_by_username,
       ca.reviewed_at,
       ca.created_at,
       ca.updated_at
     FROM creator_applications ca
     INNER JOIN users u ON u.id = ca.user_id
     LEFT JOIN users reviewer ON reviewer.id = ca.reviewed_by
     ${whereClause}
     ORDER BY
       CASE WHEN ca.status = 'pending' THEN 0 ELSE 1 END,
       ca.created_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  return {
    items: rows.map(rowToCreatorApplication),
    total: Number(countRows[0]?.total ?? 0),
  };
}

export async function reviewCreatorApplication(
  db: AuthDb,
  applicationId: string,
  input: ReviewCreatorApplicationInput,
): Promise<{ application: CreatorApplicationRecord; profile: UserProfile }> {
  const conn = await db.getConnection();
  let userId = '';
  try {
    await conn.beginTransaction();

    const [applicationRows] = await conn.execute<CreatorApplicationRow[]>(
      `SELECT
         ca.id,
         ca.user_id,
         u.username,
         ca.pen_name,
         ca.email,
         ca.bio,
         ca.reason,
         ca.sample_work,
         ca.status,
         ca.admin_note,
         ca.reviewed_by,
         reviewer.username AS reviewed_by_username,
         ca.reviewed_at,
         ca.created_at,
         ca.updated_at
       FROM creator_applications ca
       INNER JOIN users u ON u.id = ca.user_id
       LEFT JOIN users reviewer ON reviewer.id = ca.reviewed_by
       WHERE ca.id = ?
       FOR UPDATE`,
      [applicationId],
    );
    const application = applicationRows[0];
    if (!application) {
      throw new CreatorApplicationError('作家申请不存在', 404);
    }
    if (application.status !== 'pending') {
      throw new CreatorApplicationError('该申请已处理，不能重复操作', 400);
    }

    userId = application.user_id;
    const adminNote = normalizeText(input.adminNote);

    await conn.execute<ResultSetHeader>(
      `UPDATE creator_applications
       SET status = ?,
           admin_note = ?,
           reviewed_by = ?,
           reviewed_at = NOW()
       WHERE id = ?`,
      [input.status, adminNote, input.operatorId, applicationId],
    );

    if (input.status === 'approved') {
      await conn.execute<ResultSetHeader>(
        `UPDATE users
         SET creator_status = 'approved',
             pen_name = ?,
             email = ?,
             bio = ?,
             creator_applied_at = COALESCE(creator_applied_at, NOW()),
             creator_approved_at = NOW(),
             creator_rejected_at = NULL,
             creator_reject_reason = NULL
         WHERE id = ?`,
        [application.pen_name, application.email, application.bio, userId],
      );
    } else {
      await conn.execute<ResultSetHeader>(
        `UPDATE users
         SET creator_status = 'rejected',
             pen_name = ?,
             email = ?,
             bio = ?,
             creator_rejected_at = NOW(),
             creator_approved_at = NULL,
             creator_reject_reason = ?
         WHERE id = ?`,
        [application.pen_name, application.email, application.bio, adminNote, userId],
      );
    }

    await conn.commit();
    log.info(`operator ${input.operatorId} reviewed creator application ${applicationId} as ${input.status}`);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const [updatedRows] = await db.execute<CreatorApplicationRow[]>(
    `SELECT
       ca.id,
       ca.user_id,
       u.username,
       ca.pen_name,
       ca.email,
       ca.bio,
       ca.reason,
       ca.sample_work,
       ca.status,
       ca.admin_note,
       ca.reviewed_by,
       reviewer.username AS reviewed_by_username,
       ca.reviewed_at,
       ca.created_at,
       ca.updated_at
     FROM creator_applications ca
     INNER JOIN users u ON u.id = ca.user_id
     LEFT JOIN users reviewer ON reviewer.id = ca.reviewed_by
     WHERE ca.id = ?`,
    [applicationId],
  );

  const profile = await requireProfile(db, userId);
  const application = updatedRows[0];
  if (!application) {
    throw new Error('作家申请不存在');
  }

  return {
    application: rowToCreatorApplication(application),
    profile,
  };
}

export class CreatorApplicationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'CreatorApplicationError';
  }
}
