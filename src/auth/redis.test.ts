import { describe, expect, it } from 'vitest';
import { createInMemoryRedisFallback } from './redis.js';

describe('createInMemoryRedisFallback', () => {
  it('supports token storage and key scanning', async () => {
    const redis = createInMemoryRedisFallback();

    await redis.set('rt:one', 'user-1', 'EX', 60);
    await redis.setex('captcha:one', 60, 'answer');

    expect(await redis.get('rt:one')).toBe('user-1');
    expect(await redis.ttl('rt:one')).toBeGreaterThan(0);
    expect(await redis.scan('0', 'MATCH', 'rt:*', 'COUNT', 100)).toEqual(['0', ['rt:one']]);
    expect(await redis.keys('captcha:*')).toEqual(['captcha:one']);
  });

  it('supports the atomic rate-limit script contract', async () => {
    const redis = createInMemoryRedisFallback();
    const script = "return redis.call('INCR', KEYS[1])";

    expect(await redis.eval(script, 1, 'rl:client', '60')).toBe(1);
    expect(await redis.eval(script, 1, 'rl:client', '60')).toBe(2);
    expect(await redis.ttl('rl:client')).toBeGreaterThan(0);
  });
});
