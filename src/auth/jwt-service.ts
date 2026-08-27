import { randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Redis } from 'ioredis';
import type { TokenPayload } from './types.js';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_KEY_PREFIX = 'rt:';
const REFRESH_USED_PREFIX = 'rt_used:';
const SECONDS_PER_DAY = 86_400;
const REUSE_DETECTION_TTL = 7 * SECONDS_PER_DAY;

/**
 * 签发 access token (JWT)
 */
export function signAccessToken(
  payload: TokenPayload,
  secret: string,
  expiresIn: string,
): string {
  return jwt.sign(
    { userId: payload.userId, username: payload.username, role: payload.role },
    secret,
    { expiresIn: expiresIn as SignOptions['expiresIn'], algorithm: 'HS256' },
  );
}

/**
 * 验证 access token
 */
export function verifyAccessToken(token: string, secret: string): TokenPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload;
  return {
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role,
  };
}

/**
 * 创建 refresh token（存入 Redis，返回原始 token）
 *
 * Redis key: rt:{rawToken} → userId
 * TTL: expiresInDays * 86400 秒
 */
export async function createRefreshToken(
  redis: Redis,
  userId: string,
  expiresInDays: number,
): Promise<string> {
  const rawToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const ttl = expiresInDays * SECONDS_PER_DAY;
  await redis.set(`${REFRESH_KEY_PREFIX}${rawToken}`, userId, 'EX', ttl);
  return rawToken;
}

/**
 * 轮转 refresh token：验证旧 token → 删除 → 创建新 token
 *
 * 包含重用检测：如果已轮转过的 token 被再次使用，说明可能被盗，
 * 此时吊销该用户所有 refresh token 并返回 null
 */
export async function rotateRefreshToken(
  redis: Redis,
  rawToken: string,
  expiresInDays: number,
): Promise<{ userId: string; newToken: string } | null> {
  const key = `${REFRESH_KEY_PREFIX}${rawToken}`;
  const usedKey = `${REFRESH_USED_PREFIX}${rawToken}`;

  const userId = await redis.get(key);
  if (!userId) {
    // token 不在活跃池中 — 检查是否曾被使用过（重用检测）
    const previousUserId = await redis.get(usedKey);
    if (previousUserId) {
      // 检测到 token 重用！可能被盗，吊销该用户所有会话
      await revokeAllUserTokens(redis, previousUserId);
    }
    return null;
  }

  // 删除旧 token，但标记为已使用（用于重用检测）
  await redis.del(key);
  await redis.set(usedKey, userId, 'EX', REUSE_DETECTION_TTL);

  // 创建新 token
  const newToken = await createRefreshToken(redis, userId, expiresInDays);

  return { userId, newToken };
}

/**
 * 吊销某用户所有 refresh token（token 重用时触发，扫描 Redis 键）
 */
async function revokeAllUserTokens(redis: Redis, userId: string): Promise<void> {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${REFRESH_KEY_PREFIX}*`, 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const storedUserId = await redis.get(key);
      if (storedUserId === userId) {
        await redis.del(key);
      }
    }
  } while (cursor !== '0');
}

/**
 * 吊销 refresh token（登出时调用）
 */
export async function revokeRefreshToken(redis: Redis, rawToken: string): Promise<boolean> {
  const deleted = await redis.del(`${REFRESH_KEY_PREFIX}${rawToken}`);
  return deleted > 0;
}
