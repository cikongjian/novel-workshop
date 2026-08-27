import type { SqliteAuthDb } from './sqlite-adapter.js';

/** 认证用户信息（挂载到 req.auth） */
export interface AuthUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
}

export type CreatorStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'suspended';

export interface PasswordPolicy {
  minLength: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

/** 用户完整资料（含可选 profile 字段） */
export interface UserProfile extends AuthUser {
  creatorStatus: CreatorStatus;
  creatorAppliedAt: string | null;
  creatorApprovedAt: string | null;
  creatorRejectedAt: string | null;
  creatorRejectReason: string | null;
  realNameVerified: boolean;
  realNameVerifiedAt: string | null;
  realNameMasked: string | null;
  realNameIdNumberMasked: string | null;
  realNamePhoneMasked: string | null;
  phone: string | null;
  penName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  email: string | null;
  createdAt: string;
}

/** JWT 载荷 */
export interface TokenPayload {
  userId: string;
  username: string;
  role: 'user' | 'admin';
}

/** 认证配置 */
export interface AuthConfig {
  enabled: boolean;
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshExpiresInDays: number;
  adminUsername: string;
  adminPassword: string;
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  redisDb: number;
}

/** 认证数据库连接（SQLite 适配器） */
export type AuthDb = SqliteAuthDb;

/** 开发模式虚拟用户（AUTH_ENABLED=false 时注入） */
export const DEV_USER: AuthUser = {
  id: 'dev',
  username: 'dev',
  role: 'admin',
};

/** 免认证路径前缀 */
export const AUTH_PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/password-policy',
  '/auth/refresh',
  '/auth/logout',
  '/auth/real-name/policy',
  '/captcha',
  '/slider-captcha',
  '/health',
  '/homepage',
  '/billing/payments/callback',
  '/sync/session',
  '/applications/apply',
  '/settings/public',
] as const;

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}
