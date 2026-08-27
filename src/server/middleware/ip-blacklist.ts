/**
 * IP 黑名单 + 异常检测服务
 *
 * 追踪注册失败次数，达到阈值后自动封禁 IP。
 * 支持 Redis（生产）和内存 Map（降级）两种后端。
 */

import type { Redis } from 'ioredis';
import { createLogger } from '../../utils/logger.js';

const ipBlacklistLog = createLogger('ip-blacklist');
const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_FAILURE_WINDOW_MS = 10 * 60 * 1000;   // 10 分钟
const DEFAULT_BLOCK_DURATION_MS = 60 * 60 * 1000;   // 1 小时
const MEMORY_CLEANUP_INTERVAL_MS = 60 * 1000;        // 1 分钟清理一次

// Redis 键前缀
const BLOCK_KEY_PREFIX = 'ip_bl:block:';
const FAIL_KEY_PREFIX = 'ip_bl:fail:';

export interface IpBlacklistOptions {
  redis?: Redis;
  failureThreshold?: number;
  failureWindowMs?: number;
  blockDurationMs?: number;
}

export interface BlockedIpInfo {
  ip: string;
  unblocksAt: number;
}

export interface RecordFailureResult {
  blocked: boolean;
  failureCount: number;
}

export class IpBlacklistService {
  private readonly redis?: Redis;
  private readonly failureThreshold: number;
  private readonly failureWindowMs: number;
  private readonly blockDurationMs: number;

  // 内存降级存储
  private readonly blockMap = new Map<string, number>();       // ip -> unblockAt timestamp
  private readonly failureMap = new Map<string, number[]>();   // ip -> failure timestamps
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: IpBlacklistOptions = {}) {
    this.redis = options.redis;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.failureWindowMs = options.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS;
    this.blockDurationMs = options.blockDurationMs ?? DEFAULT_BLOCK_DURATION_MS;

    this.cleanupTimer = setInterval(() => this.cleanupMemory(), MEMORY_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  /** 检查 IP 是否被封禁 */
  async isBlocked(ip: string): Promise<boolean> {
    // 优先检查内存存储（兜底，确保 Redis 故障时仍有基本防护）
    const memoryBlocked = this.isBlockedInMemory(ip);

    if (this.redis) {
      try {
        const exists = await this.redis.exists(`${BLOCK_KEY_PREFIX}${ip}`);
        return exists === 1 || memoryBlocked;
      } catch (err) {
        ipBlacklistLog.warn('Redis 查询 IP 封禁状态失败，降级使用内存存储', {
          ip,
          reason: err instanceof Error ? err.message : String(err),
        });
        return memoryBlocked;
      }
    }

    return memoryBlocked;
  }

  /** 内存存储中检查 IP 是否被封禁 */
  private isBlockedInMemory(ip: string): boolean {
    const unblocksAt = this.blockMap.get(ip);
    if (!unblocksAt) return false;
    if (Date.now() >= unblocksAt) {
      this.blockMap.delete(ip);
      return false;
    }
    return true;
  }

  /** 记录一次失败，返回是否触发封禁 */
  async recordFailure(ip: string): Promise<RecordFailureResult> {
    // 始终同步写入内存存储，确保 Redis 故障时也有兜底防护
    const memoryResult = this.recordFailureMemory(ip);
    if (this.redis) {
      try {
        return await this.recordFailureRedis(ip);
      } catch (err) {
        ipBlacklistLog.warn('Redis 记录失败出错，降级使用内存存储', {
          ip,
          reason: err instanceof Error ? err.message : String(err),
        });
        return memoryResult;
      }
    }
    return memoryResult;
  }

  /** 注册成功后清除失败记录 */
  async resetFailures(ip: string): Promise<void> {
    // 始终清理内存存储
    this.failureMap.delete(ip);
    if (this.redis) {
      try {
        await this.redis.del(`${FAIL_KEY_PREFIX}${ip}`);
      } catch (err) {
        ipBlacklistLog.warn('Redis 清除失败记录出错', {
          ip,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /** 管理员手动封禁 */
  async manualBlock(ip: string, durationMs?: number): Promise<void> {
    const duration = durationMs ?? this.blockDurationMs;
    if (this.redis) {
      try {
        await this.redis.setex(
          `${BLOCK_KEY_PREFIX}${ip}`,
          Math.ceil(duration / 1000),
          '1',
        );
      } catch (err) {
        console.error('[ip-blacklist] 手动封禁失败:', err);
      }
      return;
    }
    this.blockMap.set(ip, Date.now() + duration);
  }

  /** 管理员手动解封 */
  async manualUnblock(ip: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(`${BLOCK_KEY_PREFIX}${ip}`);
      } catch (err) {
        console.error('[ip-blacklist] 手动解封失败:', err);
      }
      return;
    }
    this.blockMap.delete(ip);
  }

  /** 列出当前封禁的 IP */
  async listBlocked(): Promise<BlockedIpInfo[]> {
    if (this.redis) {
      return this.listBlockedRedis();
    }
    return this.listBlockedMemory();
  }

  // ---- Redis 实现 ----

  private async recordFailureRedis(ip: string): Promise<RecordFailureResult> {
    const failKey = `${FAIL_KEY_PREFIX}${ip}`;
    const now = Date.now();
    const windowStart = now - this.failureWindowMs;

    // 移除窗口外的旧记录
    await this.redis!.zremrangebyscore(failKey, 0, windowStart);
    // 添加新记录
    await this.redis!.zadd(failKey, now.toString(), `${now}`);
    // 设置键过期（比窗口略长，防止泄漏）
    await this.redis!.expire(failKey, Math.ceil(this.failureWindowMs / 1000) + 60);
    // 获取窗口内总失败数
    const failureCount = await this.redis!.zcard(failKey);

    if (failureCount >= this.failureThreshold) {
      // 触发自动封禁（同时写入内存，确保 Redis 故障时仍有效）
      await this.redis!.setex(
        `${BLOCK_KEY_PREFIX}${ip}`,
        Math.ceil(this.blockDurationMs / 1000),
        '1',
      );
      this.blockMap.set(ip, now + this.blockDurationMs);
      await this.redis!.del(failKey);
      ipBlacklistLog.warn(`IP ${ip} 因连续 ${failureCount} 次注册失败被自动封禁`);
      return { blocked: true, failureCount };
    }

    return { blocked: false, failureCount };
  }

  private async listBlockedRedis(): Promise<BlockedIpInfo[]> {
    try {
      const result: BlockedIpInfo[] = [];
      const now = Date.now();
      let cursor = '0';
      do {
        // SCAN 增量遍历，避免 KEYS 阻塞 Redis 主线程；COUNT 仅是建议值
        const [nextCursor, keys] = await this.redis!.scan(
          cursor,
          'MATCH',
          `${BLOCK_KEY_PREFIX}*`,
          'COUNT',
          200,
        );
        cursor = nextCursor;
        if (keys.length === 0) continue;
        // pipeline 批量查询 ttl，减少逐 key RTT
        const ttls = await this.redis!.pipeline(keys.map((k) => ['ttl', k])).exec();
        if (!ttls) continue;
        keys.forEach((key, idx) => {
          const ttl = ttls[idx]?.[1];
          if (typeof ttl === 'number' && ttl > 0) {
            result.push({
              ip: key.slice(BLOCK_KEY_PREFIX.length),
              unblocksAt: now + ttl * 1000,
            });
          }
        });
      } while (cursor !== '0');
      return result;
    } catch (err) {
      console.error('[ip-blacklist] 列出封禁IP失败:', err);
      return [];
    }
  }

  // ---- 内存实现 ----

  private recordFailureMemory(ip: string): RecordFailureResult {
    const now = Date.now();
    const windowStart = now - this.failureWindowMs;

    let failures = this.failureMap.get(ip) ?? [];
    // 移除窗口外的旧记录
    failures = failures.filter((t) => t > windowStart);
    failures.push(now);
    this.failureMap.set(ip, failures);

    if (failures.length >= this.failureThreshold) {
      this.blockMap.set(ip, now + this.blockDurationMs);
      this.failureMap.delete(ip);
      console.warn(`[ip-blacklist] IP ${ip} 因连续 ${failures.length} 次注册失败被自动封禁`);
      return { blocked: true, failureCount: failures.length };
    }

    return { blocked: false, failureCount: failures.length };
  }

  private listBlockedMemory(): BlockedIpInfo[] {
    const now = Date.now();
    const result: BlockedIpInfo[] = [];
    for (const [ip, unblocksAt] of this.blockMap) {
      if (unblocksAt > now) {
        result.push({ ip, unblocksAt });
      }
    }
    return result;
  }

  private cleanupMemory(): void {
    const now = Date.now();
    // 清理过期封禁
    for (const [ip, unblocksAt] of this.blockMap) {
      if (now >= unblocksAt) this.blockMap.delete(ip);
    }
    // 清理过期失败记录
    const windowStart = now - this.failureWindowMs;
    for (const [ip, failures] of this.failureMap) {
      const valid = failures.filter((t) => t > windowStart);
      if (valid.length === 0) {
        this.failureMap.delete(ip);
      } else {
        this.failureMap.set(ip, valid);
      }
    }
  }
}

export function createIpBlacklistService(options: IpBlacklistOptions = {}): IpBlacklistService {
  return new IpBlacklistService(options);
}
