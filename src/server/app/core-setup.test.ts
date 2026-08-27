import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthConfig } from '../../auth/types.js';
import { setupCoreApp } from './core-setup.js';

const AUTH_DISABLED: AuthConfig = {
  enabled: false,
  jwtSecret: '',
  jwtExpiresIn: '15m',
  refreshExpiresInDays: 7,
  adminUsername: '',
  adminPassword: '',
  redisHost: '',
  redisPort: 0,
  redisPassword: '',
  redisDb: 0,
};

describe('setupCoreApp', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRateLimitMax = process.env.RATE_LIMIT_MAX;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_MAX = '1';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalRateLimitMax === undefined) delete process.env.RATE_LIMIT_MAX;
    else process.env.RATE_LIMIT_MAX = originalRateLimitMax;
  });

  it('rate limits public API routes registered during core setup', async () => {
    const app = express();
    await setupCoreApp(app, { novelManager: {} as never }, AUTH_DISABLED);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));

    try {
      const { port } = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${port}/api/captcha/generate`;
      const first = await fetch(url);
      const second = await fetch(url);

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      await expect(second.json()).resolves.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
