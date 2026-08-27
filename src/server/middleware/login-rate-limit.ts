/**
 * 登录速率限制中间件
 *
 * 按用户名限制登录失败次数，防止暴力破解：
 * - 每个用户名在窗口期内最多允许 MAX_LOGIN_ATTEMPTS 次失败
 * - 超限后返回 429，需等待窗口期重置
 * - 支持 Redis（生产）和内存（开发/无 Redis 回退）
 */

import type { Redis } from 'ioredis';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('LoginRateLimit');

const MAX_LOGIN_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000; // 15 分钟
const WINDOW_SEC = Math.ceil(WINDOW_MS / 1000);
const REDIS_KEY_PREFIX = 'login_fail:';

interface LoginAttemptEntry {
  count: number;
  resetAt: number;
}

/**
 * 内存存储（开发环境 / 无 Redis 回退）
 */
const memoryStore = new Map<string, LoginAttemptEntry>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (now >= entry.resetAt) memoryStore.delete(key);
  }
}, WINDOW_MS);
cleanupTimer.unref();

/**
 * 检查用户名是否超过登录失败限制
 * @returns 剩余等待秒数（0 表示未超限）
 */
export async function checkLoginRateLimit(
  username: string,
  redis?: Redis,
): Promise<number> {
  const key = username.toLowerCase();
  if (redis) {
    return checkRedis(redis, key);
  }
  return checkMemory(key);
}

/**
 * 记录一次登录失败
 */
export async function recordLoginFailure(
  username: string,
  redis?: Redis,
): Promise<void> {
  const key = username.toLowerCase();
  if (redis) {
    await recordRedis(redis, key);
  } else {
    recordMemory(key);
  }
  log.warn(`登录失败计数增加: ${key}`);
}

/**
 * 登录成功后清除失败计数
 */
export async function clearLoginFailures(
  username: string,
  redis?: Redis,
): Promise<void> {
  const key = username.toLowerCase();
  if (redis) {
    await redis.del(`${REDIS_KEY_PREFIX}${key}`);
  } else {
    memoryStore.delete(key);
  }
}

// ---- Redis 实现 ----

async function checkRedis(redis: Redis, key: string): Promise<number> {
  try {
    const redisKey = `${REDIS_KEY_PREFIX}${key}`;
    const countStr = await redis.get(redisKey);
    if (!countStr) return 0;
    const count = Number.parseInt(countStr, 10);
    if (count < MAX_LOGIN_ATTEMPTS) return 0;
    const ttl = await redis.ttl(redisKey);
    return Math.max(ttl, 1);
  } catch {
    log.error('Redis 查询失败，安全降级：视为已超限');
    return Math.ceil(WINDOW_MS / 1000); // Redis 故障时安全降级，视为已超限
  }
}

async function recordRedis(redis: Redis, key: string): Promise<void> {
  try {
    const redisKey = `${REDIS_KEY_PREFIX}${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, WINDOW_SEC);
    }
  } catch (err) {
    log.warn('Redis 写入失败，降级到内存限流', { error: err instanceof Error ? err.message : String(err) });
    // Redis 故障时降级到内存
    recordMemory(key);
  }
}

// ---- 内存实现 ----

function checkMemory(key: string): number {
  const entry = memoryStore.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (now >= entry.resetAt) {
    memoryStore.delete(key);
    return 0;
  }
  if (entry.count < MAX_LOGIN_ATTEMPTS) return 0;
  return Math.ceil((entry.resetAt - now) / 1000);
}

function recordMemory(key: string): void {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now >= entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}
