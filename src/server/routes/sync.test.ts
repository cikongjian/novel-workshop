import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { createSyncRouter } from './sync.js';

function getRouteHandler(
  router: any,
  method: 'get' | 'post',
  path: string,
) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    headers: {},
    ...overrides,
  } as Request;
}

function mockResponse(): Response & { statusCode: number; body?: unknown } {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader() {
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response as unknown as Response & { statusCode: number; body?: unknown };
}

function createDeps() {
  return {
    backupManager: {
      exportNovel: async () => ({ buffer: Buffer.from('ok'), title: 'demo' }),
    },
    novelManager: {
      listNovels: async () => [],
      getNovel: async () => null,
    },
    authConfig: {
      enabled: true,
      jwtSecret: 'secret',
      jwtExpiresIn: '1h',
    },
    authDb: {},
  };
}

describe('sync routes', () => {
  it('rejects invalid session payloads', async () => {
    const router = createSyncRouter(createDeps() as any);
    const handler = getRouteHandler(router, 'post', '/session');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: { username: '', password: '' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '账号不能为空' });
  });

  it('rejects invalid novel ids for export', async () => {
    const router = createSyncRouter(createDeps() as any);
    const handler = getRouteHandler(router, 'get', '/export/:novelId');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { novelId: 'bad/id' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '无效的小说 ID' });
  });

  it('requires remote url for compare', async () => {
    const router = createSyncRouter(createDeps() as any);
    const handler = getRouteHandler(router, 'post', '/compare');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '请提供远端地址' });
  });
});
