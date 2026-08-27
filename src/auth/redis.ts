import { Redis } from 'ioredis';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Redis');

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
}

/**
 * 创建 Redis 客户端（AUTH_ENABLED=false 时不调用）
 */
export function createRedisClient(config: RedisConfig): Redis {
  let hasConnected = false;
  const client = new Redis({
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    db: config.db,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 5) return null; // 超过 5 次停止重试
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  client.on('connect', () => {
    hasConnected = true;
    log.info('Redis 已连接');
  });
  client.on('error', (err: Error) => {
    if (hasConnected) log.error('Redis 连接中断', { error: err.message });
  });

  return client;
}

/**
 * 创建内存 Redis 回退实例 — 当真实 Redis 不可用时使用
 * 数据在进程重启后丢失，但保证了认证系统基本可用
 */
export function createInMemoryRedisFallback(): Redis {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  function getLiveEntry(key: string) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  }

  function patternToRegExp(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
      .replace(/\*/gu, '.*')
      .replace(/\?/gu, '.');
    return new RegExp(`^${escaped}$`, 'u');
  }

  const fakeRedis = {
    status: 'ready' as const,

    async connect() { /* noop */ },

    async ping() { return 'PONG'; },

    disconnect() {
      store.clear();
    },

    async set(key: string, value: string, ...options: Array<string | number>) {
      let expiresAt: number | null = null;
      let onlyIfAbsent = false;
      for (let index = 0; index < options.length; index += 1) {
        const option = String(options[index]).toUpperCase();
        if (option === 'EX') {
          expiresAt = Date.now() + Number(options[index + 1]) * 1000;
          index += 1;
        } else if (option === 'PX') {
          expiresAt = Date.now() + Number(options[index + 1]);
          index += 1;
        } else if (option === 'NX') {
          onlyIfAbsent = true;
        }
      }
      const normalizedKey = String(key);
      if (onlyIfAbsent && getLiveEntry(normalizedKey)) return null;
      store.set(normalizedKey, { value: String(value), expiresAt });
      return 'OK';
    },

    async setex(key: string, ttl: number, value: string) {
      store.set(String(key), { value: String(value), expiresAt: Date.now() + ttl * 1000 });
      return 'OK';
    },

    async get(key: string) {
      const entry = getLiveEntry(String(key));
      if (!entry) return null;
      return entry.value;
    },

    async del(...keys: string[]) {
      let deleted = 0;
      for (const key of keys) deleted += store.delete(String(key)) ? 1 : 0;
      return deleted;
    },

    async exists(key: string) {
      return getLiveEntry(String(key)) ? 1 : 0;
    },

    async incr(key: string) {
      const normalizedKey = String(key);
      const entry = getLiveEntry(normalizedKey);
      const current = entry ? Number.parseInt(entry.value, 10) || 0 : 0;
      const next = current + 1;
      store.set(normalizedKey, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },

    async expire(key: string, ttl: number) {
      const entry = store.get(String(key));
      if (entry) {
        entry.expiresAt = Date.now() + ttl * 1000;
        return 1;
      }
      return 0;
    },

    async ttl(key: string) {
      const entry = getLiveEntry(String(key));
      if (!entry) return -2;
      if (entry.expiresAt === null) return -1;
      return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    },

    async eval(_script: string, numberOfKeys: number, ...args: Array<string | number>) {
      if (numberOfKeys !== 1) throw new Error('内存 Redis 仅支持单键限流脚本');
      const key = String(args[0]);
      const ttl = Number(args[numberOfKeys]);
      const count = await fakeRedis.incr(key);
      if (count === 1) await fakeRedis.expire(key, ttl);
      return count;
    },

    async scan(_cursor: string, ...args: Array<string | number>) {
      const matchIndex = args.findIndex(value => String(value).toUpperCase() === 'MATCH');
      const pattern = matchIndex >= 0 ? String(args[matchIndex + 1]) : '*';
      const matcher = patternToRegExp(pattern);
      const keys = [...store.keys()].filter(key => getLiveEntry(key) && matcher.test(key));
      return ['0', keys] as [string, string[]];
    },

    on(_event: string, _handler: Function) { return fakeRedis as any; },

    async keys(pattern = '*') {
      const matcher = patternToRegExp(pattern);
      return [...store.keys()].filter(key => getLiveEntry(key) && matcher.test(key));
    },
    async quit() { return 'OK'; },
  };

  return fakeRedis as unknown as Redis;
}

/**
 * 测试 Redis 连接
 */
export async function testRedisConnection(client: Redis): Promise<boolean> {
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (err) {
    return false;
  }
}
