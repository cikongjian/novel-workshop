import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthDb, AuthUser, CreatorStatus, UserProfile } from './types.js';
import { createLogger } from '../utils/logger.js';
import type { ReferralService } from '../referral/referral-service.js';

const log = createLogger('UserService');

const BCRYPT_ROUNDS = 12;
const INVITE_CODE_BYTES = 8; // 生成 16 字符 hex 码

interface UserRow extends RowDataPacket {
  id: string;
  username: string;
  password_hash: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
}

interface UserProfileRow extends UserRow {
  creator_status: CreatorStatus;
  creator_applied_at: string | null;
  creator_approved_at: string | null;
  creator_rejected_at: string | null;
  creator_reject_reason: string | null;
  real_name_verified_at: string | null;
  real_name_masked: string | null;
  real_name_id_number_masked: string | null;
  real_name_phone_masked: string | null;
  phone: string | null;
  pen_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  email: string | null;
  created_at: string;
}

interface InviteCodeRow extends RowDataPacket {
  code: string;
  created_by: string;
  used_by: string | null;
  used_by_username: string | null;
  used_at: string | null;
  created_at: string;
}

/**
 * 注册新用户
 * 支持两种入口：inviteCode（管理员邀请码）或 referralCode（用户推荐码）
 * referralService 用于校验推荐码配额，注册成功后的拉新事件写入由路由层调用
 */
export class PhoneConflictError extends Error {
  constructor(phone: string) {
    super(`手机号 ${phone} 已被注册`);
    this.name = 'PhoneConflictError';
  }
  readonly statusCode = 409;
}

export async function createUser(
  db: AuthDb,
  username: string,
  password: string,
  phone: string,
  inviteCode?: string,
  referralCode?: string,
  referralService?: ReferralService,
): Promise<AuthUser> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const normalizedInviteCode = inviteCode?.trim() || undefined;
    const normalizedReferralCode = referralCode?.trim() || undefined;
    const creatorStatus: CreatorStatus = 'approved';

    if (normalizedReferralCode && referralService) {
      // 推荐码路径：验证推荐人有资格且配额未满
      try {
        await referralService.validateReferralCode(normalizedReferralCode);
      } catch (err) {
        throw new InvalidInviteCodeError();
      }
    } else if (normalizedInviteCode) {
      // 传统邀请码路径
      const [codes] = await conn.execute<InviteCodeRow[]>(
        'SELECT * FROM invite_codes WHERE code = ? AND used_by IS NULL',
        [normalizedInviteCode],
      );
      if (codes.length === 0) {
        throw new InvalidInviteCodeError();
      }
    }

    // 检查用户名唯一
    const [existing] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE username = ?',
      [username],
    );
    if (existing.length > 0) {
      throw new UsernameConflictError(username);
    }

    // 检查手机号唯一
    const [existingPhone] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE phone = ?',
      [phone],
    );
    if (existingPhone.length > 0) {
      throw new PhoneConflictError(phone);
    }

    // 创建用户
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await conn.execute(
      `INSERT INTO users (
        id,
        username,
        password_hash,
        role,
        creator_status,
        creator_approved_at,
        phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        username,
        passwordHash,
        'user',
        creatorStatus,
        creatorStatus === 'approved' ? new Date() : null,
        phone,
      ],
    );

    // 标记邀请码已使用（仅传统邀请码路径）
    if (normalizedInviteCode && !normalizedReferralCode) {
      await conn.execute(
        'UPDATE invite_codes SET used_by = ?, used_at = NOW() WHERE code = ?',
        [userId, normalizedInviteCode],
      );
    }

    await conn.commit();
    log.info(`新用户注册: ${username}`);

    return { id: userId, username, role: 'user' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 常量时间假哈希 —— 用户不存在时仍执行 bcrypt.compare 防止时序侧信道枚举
 */
const DUMMY_HASH = '$2a$12$K4a8sGq2Wv4Qwm0N0000OeYKXgJ0yBfUYqNZp8lFfWp5QKfqXlK2q';

/**
 * 验证用户凭据（登录）
 * 无论用户是否存在都执行 bcrypt.compare 防止时序枚举
 */
export async function verifyCredentials(
  db: AuthDb,
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const [rows] = await db.execute<UserRow[]>(
    'SELECT id, username, password_hash, role, status FROM users WHERE username = ?',
    [username],
  );

  const user = rows.length > 0 ? rows[0] : null;
  const hashToCompare = user?.password_hash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !valid) return null;

  if (user.status === 'disabled') {
    throw new UserDisabledError();
  }

  return { id: user.id, username: user.username, role: user.role };
}

/**
 * 记录用户最近登录时间（供管理员用户列表「最近登录」展示）。
 * 非关键路径：仅记日志、不抛出，绝不阻塞登录主流程。
 */
export async function recordLogin(db: AuthDb, userId: string): Promise<void> {
  try {
    await db.execute(
      'UPDATE users SET last_login_at = ? WHERE id = ?',
      [new Date().toISOString(), userId],
    );
  } catch (err) {
    log.warn('记录登录时间失败', {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 创建邀请码（仅管理员）
 */
export async function createInviteCode(db: AuthDb, createdBy: string): Promise<string> {
  const code = randomBytes(INVITE_CODE_BYTES).toString('hex');
  await db.execute(
    'INSERT INTO invite_codes (code, created_by) VALUES (?, ?)',
    [code, createdBy],
  );
  log.info(`邀请码已创建: ${code.slice(0, 4)}****`);
  return code;
}

/**
 * 删除邀请码（仅限未使用，且由该管理员创建）
 */
export async function deleteInviteCodes(
  db: AuthDb,
  codes: string[],
  createdBy: string,
): Promise<number> {
  if (codes.length === 0) return 0;
  const placeholders = codes.map(() => '?').join(', ');
  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM invite_codes WHERE code IN (${placeholders}) AND created_by = ? AND used_by IS NULL`,
    [...codes, createdBy],
  );
  log.info(`已删除 ${result.affectedRows} 个邀请码`);
  return result.affectedRows;
}

/**
 * 列出邀请码
 */
export async function listInviteCodes(
  db: AuthDb,
  createdBy: string,
): Promise<InviteCodeRow[]> {
  const [rows] = await db.execute<InviteCodeRow[]>(
    `SELECT ic.code, ic.created_by, ic.used_by, u.username AS used_by_username, ic.used_at, ic.created_at
     FROM invite_codes ic
     LEFT JOIN users u ON ic.used_by = u.id
     WHERE ic.created_by = ?
     ORDER BY ic.created_at DESC`,
    [createdBy],
  );
  return rows;
}

/**
 * 首次启动时创建管理员（幂等）
 */
export async function seedAdminUser(
  db: AuthDb,
  adminUsername: string,
  adminPassword: string,
): Promise<void> {
  if (!adminUsername || !adminPassword) {
    log.warn('未配置 AUTH_ADMIN_USERNAME/AUTH_ADMIN_PASSWORD，跳过管理员初始化');
    return;
  }

  const [existing] = await db.execute<RowDataPacket[]>(
    'SELECT id FROM users WHERE role = ? LIMIT 1',
    ['admin'],
  );
  if (existing.length > 0) return; // 已有管理员

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
  await db.execute(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
    [userId, adminUsername, passwordHash, 'admin'],
  );

  // 为管理员生成初始邀请码
  const initialCodes = 5;
  for (let i = 0; i < initialCodes; i++) {
    const code = randomBytes(INVITE_CODE_BYTES).toString('hex');
    await db.execute(
      'INSERT INTO invite_codes (code, created_by) VALUES (?, ?)',
      [code, userId],
    );
  }

  log.info(`管理员 "${adminUsername}" 已创建，并生成 ${initialCodes} 个初始邀请码`);
}

/** 账号已被禁用 */
export class UserDisabledError extends Error {
  constructor() {
    super('账号已被禁用，请联系管理员');
    this.name = 'UserDisabledError';
  }
}

/** 邀请码无效或已使用 */
export class InvalidInviteCodeError extends Error {
  constructor() {
    super('邀请码无效或已被使用');
    this.name = 'InvalidInviteCodeError';
  }
}

/** 用户名已存在 */
export class UsernameConflictError extends Error {
  constructor(username: string) {
    super(`用户名 "${username}" 已被注册`);
    this.name = 'UsernameConflictError';
  }
}

/** 邮箱已被其他账号使用 */
export class EmailConflictError extends Error {
  constructor() {
    super('该邮箱已被其他账号使用');
    this.name = 'EmailConflictError';
  }
}

/** 旧密码验证失败 */
export class WrongPasswordError extends Error {
  constructor() {
    super('原密码错误');
    this.name = 'WrongPasswordError';
  }
}

/** 用户名与手机号不匹配 */
export class UsernamePhoneMismatchError extends Error {
  constructor() {
    super('用户名与手机号不匹配');
    this.name = 'UsernamePhoneMismatchError';
  }
}

/**
 * 忘记密码 — 通过用户名+手机号验证后直接重置密码
 */
export async function resetPasswordByPhone(
  db: AuthDb,
  username: string,
  phone: string,
  newPassword: string,
): Promise<void> {
  const [rows] = await db.execute<UserRow[]>(
    'SELECT id, username FROM users WHERE username = ?',
    [username],
  );
  if (rows.length === 0) throw new UsernamePhoneMismatchError();

  const [phoneRows] = await db.execute<RowDataPacket[]>(
    'SELECT id FROM users WHERE id = ? AND phone = ?',
    [rows[0].id, phone],
  );
  if (phoneRows.length === 0) throw new UsernamePhoneMismatchError();

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, rows[0].id]);
  log.info(`用户 ${username} 通过手机验证重置了密码`);
}

/**
 * 获取用户完整资料
 */
export async function getProfile(db: AuthDb, userId: string): Promise<UserProfile | null> {
  const [rows] = await db.execute<UserProfileRow[]>(
    `SELECT
      id,
      username,
      role,
      creator_status,
      creator_applied_at,
      creator_approved_at,
      creator_rejected_at,
      creator_reject_reason,
      real_name_verified_at,
      real_name_masked,
      real_name_id_number_masked,
      real_name_phone_masked,
      phone,
      pen_name,
      avatar_url,
      bio,
      email,
      created_at
     FROM users
     WHERE id = ?`,
    [userId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    creatorStatus: r.creator_status,
    creatorAppliedAt: r.creator_applied_at,
    creatorApprovedAt: r.creator_approved_at,
    creatorRejectedAt: r.creator_rejected_at,
    creatorRejectReason: r.creator_reject_reason,
    realNameVerified: Boolean(r.real_name_verified_at),
    realNameVerifiedAt: r.real_name_verified_at,
    realNameMasked: r.real_name_masked,
    realNameIdNumberMasked: r.real_name_id_number_masked,
    realNamePhoneMasked: r.real_name_phone_masked,
    phone: r.phone,
    penName: r.pen_name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    email: r.email,
    createdAt: r.created_at,
  };
}

export interface UpdateProfilePayload {
  penName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  email?: string | null;
}

/**
 * 更新用户资料（仅更新传入的字段）
 */
export async function updateProfile(
  db: AuthDb,
  userId: string,
  payload: UpdateProfilePayload,
): Promise<UserProfile> {
  // 检查邮箱唯一性（如果有传 email）
  if (payload.email !== undefined && payload.email !== null && payload.email !== '') {
    const [existing] = await db.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [payload.email, userId],
    );
    if (existing.length > 0) {
      throw new EmailConflictError();
    }
  }

  const setClauses: string[] = [];
  const values: (string | null)[] = [];

  if ('penName' in payload) {
    setClauses.push('pen_name = ?');
    values.push(payload.penName ?? null);
  }
  if ('avatarUrl' in payload) {
    setClauses.push('avatar_url = ?');
    values.push(payload.avatarUrl ?? null);
  }
  if ('bio' in payload) {
    setClauses.push('bio = ?');
    values.push(payload.bio ?? null);
  }
  if ('email' in payload) {
    setClauses.push('email = ?');
    values.push(payload.email === '' ? null : (payload.email ?? null));
  }

  if (setClauses.length > 0) {
    values.push(userId);
    await db.execute(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
  }

  const profile = await getProfile(db, userId);
  if (!profile) throw new Error('用户不存在');
  log.info(`用户资料已更新: ${profile.username}`);
  return profile;
}

/**
 * 修改密码
 */
export async function changePassword(
  db: AuthDb,
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const [rows] = await db.execute<UserRow[]>(
    'SELECT id, username, password_hash, role FROM users WHERE id = ?',
    [userId],
  );
  if (rows.length === 0) throw new Error('用户不存在');

  const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
  if (!valid) throw new WrongPasswordError();

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
  log.info(`用户 ${rows[0].username} 密码已修改`);
}

/**
 * 管理员修改用户名（需验证当前密码）
 */
export async function changeUsername(
  db: AuthDb,
  userId: string,
  currentPassword: string,
  newUsername: string,
): Promise<void> {
  const [rows] = await db.execute<UserRow[]>(
    'SELECT id, username, password_hash, role FROM users WHERE id = ?',
    [userId],
  );
  if (rows.length === 0) throw new Error('用户不存在');

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw new WrongPasswordError();

  if (newUsername === rows[0].username) {
    throw new Error('新用户名不能与当前用户名相同');
  }

  const [existing] = await db.execute<UserRow[]>(
    'SELECT id FROM users WHERE username = ?',
    [newUsername],
  );
  if (existing.length > 0) throw new UsernameConflictError(newUsername);

  await db.execute('UPDATE users SET username = ? WHERE id = ?', [newUsername, userId]);
  log.info(`管理员 ${rows[0].username} 用户名已变更为 ${newUsername}`);
}
