/**
 * 注册专用速率限制中间件
 *
 * 使用纯 IP 键（防止换 UA 绕过），同时检查 小时/天 两个窗口。
 * 支持 Redis（生产）和内存 Map（降级）两种后端。
 */

import type { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';

/** 每小时最大注册次数 */
const DEFAULT_HOUR_MAX = 2;
/** 每天最大注册次数 */
const DEFAULT_DAY_MAX = 5;

const HOUR_WINDOW_SEC = 3600;
const DAY_WINDOW_SEC = 86400;

export interface RegistrationRateLimitOptions {
  redis?: Redis;
  hourMax?: number;
  dayMax?: number;
}

interface MemoryEntry {
  count: number;
  resetAt: number;
}

/**
 * 创建注册专用速率限制中间件
 * 同时检查小时和天两个窗口，任一超限则返回 429
 */
export function createRegistrationRateLimit(options: RegistrationRateLimitOptions = {}) {
  const hourMax = options.hourMax ?? DEFAULT_HOUR_MAX;
  const dayMax = options.dayMax ?? DEFAULT_DAY_MAX;

  if (options.redis) {
    return redisRegistrationRateLimit(options.redis, hourMax, dayMax);
  }
  return memoryRegistrationRateLimit(hourMax, dayMax);
}

/**
 * 安全地获取客户端 IP。
 * 始终使用 req.ip（受 Express trust proxy 配置控制），
 * 不自行解析 X-Forwarded-For，防止 IP 伪造绕过限流。
 */
function getClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** 内存实现 */
function memoryRegistrationRateLimit(hourMax: number, dayMax: number) {
  const hourStore = new Map<string, MemoryEntry>();
  const dayStore = new Map<string, MemoryEntry>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hourStore) {
      if (now >= entry.resetAt) hourStore.delete(key);
    }
    for (const [key, entry] of dayStore) {
      if (now >= entry.resetAt) dayStore.delete(key);
    }
  }, HOUR_WINDOW_SEC * 500); // 每半小时清理
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const now = Date.now();

    // 检查小时窗口
    let hourEntry = hourStore.get(ip);
    if (!hourEntry || now >= hourEntry.resetAt) {
      hourEntry = { count: 0, resetAt: now + HOUR_WINDOW_SEC * 1000 };
      hourStore.set(ip, hourEntry);
    }
    hourEntry.count++;

    // 检查天窗口
    let dayEntry = dayStore.get(ip);
    if (!dayEntry || now >= dayEntry.resetAt) {
      dayEntry = { count: 0, resetAt: now + DAY_WINDOW_SEC * 1000 };
      dayStore.set(ip, dayEntry);
    }
    dayEntry.count++;

    if (hourEntry.count > hourMax) {
      const retryAfter = Math.ceil((hourEntry.resetAt - now) / 1000);
      res.status(429).json({
        error: '注册请求过于频繁，请稍后再试',
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
      return;
    }

    if (dayEntry.count > dayMax) {
      const retryAfter = Math.ceil((dayEntry.resetAt - now) / 1000);
      res.status(429).json({
        error: '今日注册次数已达上限，请明天再试',
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
      return;
    }

    next();
  };
}

/** Redis 实现 */
function redisRegistrationRateLimit(redis: Redis, hourMax: number, dayMax: number) {
  // 降级用内存计数器，Redis 故障时接管
  const memoryFallback = memoryRegistrationRateLimit(hourMax, dayMax);

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const hourKey = `reg_rl:hour:${ip}`;
    const dayKey = `reg_rl:day:${ip}`;

    try {
      // 小时窗口
      const hourCount = await redis.incr(hourKey);
      if (hourCount === 1) {
        await redis.expire(hourKey, HOUR_WINDOW_SEC);
      }

      // 天窗口
      const dayCount = await redis.incr(dayKey);
      if (dayCount === 1) {
        await redis.expire(dayKey, DAY_WINDOW_SEC);
      }

      if (hourCount > hourMax) {
        const ttl = await redis.ttl(hourKey);
        res.status(429).json({
          error: '注册请求过于频繁，请稍后再试',
          code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.max(ttl, 1),
        });
        return;
      }

      if (dayCount > dayMax) {
        const ttl = await redis.ttl(dayKey);
        res.status(429).json({
          error: '今日注册次数已达上限，请明天再试',
          code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.max(ttl, 1),
        });
        return;
      }

      next();
    } catch (err) {
      // Redis 故障时降级为内存计数器，不放行
      console.warn('[registration-rate-limit] Redis 故障，降级为内存计数器', err instanceof Error ? err.message : String(err));
      memoryFallback(req, res, next);
    }
  };
}
