/**
 * 速率限制中间件
 *
 * 支持两种后端：
 * - 内存 Map（默认，适用于单实例 / 开发模式）
 * - Redis（传入 redis 选项，适用于生产环境，跨重启保持计数）
 */

import type { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 60_000（1 分钟） */
  windowMs?: number;
  /** 窗口内最大请求数，默认 120 */
  max?: number;
  /** 自定义提取 key 的函数，默认用 IP */
  keyFn?: (req: Request) => string;
  /** Redis 客户端（传入则使用 Redis 计数器，否则用内存） */
  redis?: Redis;
  /** 跳过限流的路径判断函数，返回 true 则不计入限制 */
  skip?: (req: Request) => boolean;
}

/**
 * 创建复合标识符（IP + userId + User-Agent hash）
 * 防止通过代理/VPN 绕过速率限制
 */
function createCompositeKey(req: Request): string {
  const ip = req.ip ?? 'unknown';
  const userId = (req as any).auth?.id ?? 'anonymous';
  const userAgent = req.headers?.['user-agent']?.slice(0, 100) ?? '';
  const uaHash = crypto.createHash('md5').update(userAgent).digest('hex').slice(0, 8);

  return `${ip}:${userId}:${uaHash}`;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 120;
  const keyFn = options.keyFn ?? createCompositeKey;
  const skip = options.skip;

  if (options.redis) {
    return redisRateLimit(options.redis, max, Math.ceil(windowMs / 1000), keyFn, skip);
  }
  return memoryRateLimit(max, windowMs, keyFn, skip);
}

/** 内存实现（开发模式 / 无 Redis 回退） */
function memoryRateLimit(max: number, windowMs: number, keyFn: (req: Request) => string, skip?: (req: Request) => boolean) {
  const store = new Map<string, RateLimitEntry>();
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, windowMs * 2);
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) { next(); return; }
    const key = keyFn(req);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count++;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }
    next();
  };
}

/** Redis 实现（INCR + EXPIRE，Redis 3.x 兼容）；Redis 故障时降级为内存计数器 */
function redisRateLimit(redis: Redis, max: number, windowSec: number, keyFn: (req: Request) => string, skip?: (req: Request) => boolean) {
  // 降级用内存计数器，Redis 故障时接管
  const fallbackStore = new Map<string, RateLimitEntry>();
  const windowMs = windowSec * 1000;
  const fallbackCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of fallbackStore) {
      if (now >= entry.resetAt) fallbackStore.delete(key);
    }
  }, windowMs * 2);
  fallbackCleanup.unref();

  function applyFallback(req: Request, res: Response, next: NextFunction): void {
    const key = keyFn(req);
    const now = Date.now();
    let entry = fallbackStore.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    fallbackStore.set(key, entry);
    if (entry.count > max) {
      res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }
    next();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip?.(req)) { next(); return; }
    const redisKey = `rl:${keyFn(req)}`;
    try {
      // 使用 Lua 脚本保证 INCR+EXPIRE 原子性，防止进程崩溃导致 key 永不过期
      const count = await redis.eval(
        `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return c`,
        1, redisKey, String(windowSec),
      ) as number;
      const ttl = await redis.ttl(redisKey);
      const resetAt = Math.ceil(Date.now() / 1000) + Math.max(ttl, 0);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Reset', resetAt);

      if (count > max) {
        res.status(429).json({
          error: '请求过于频繁，请稍后再试',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.max(ttl, 1),
        });
        return;
      }
      next();
    } catch (err) {
      // Redis 故障时降级为内存计数器，不放行
      console.warn('[rate-limit] Redis 故障，降级为内存计数器', err instanceof Error ? err.message : String(err));
      applyFallback(req, res, next);
    }
  };
}
