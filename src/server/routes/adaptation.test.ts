import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdaptationRouter } from './adaptation.js';

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
    type() {
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
    novelManager: {
      getNovel: vi.fn(),
      getCharacters: vi.fn(),
      getChapter: vi.fn(),
      getOutline: vi.fn(),
    },
    adaptationManager: {
      listPackages: vi.fn(),
      getPackage: vi.fn(),
      getSceneCards: vi.fn(),
      saveSceneCards: vi.fn(),
      createPackage: vi.fn(),
      deletePackage: vi.fn(),
      saveQAReport: vi.fn(),
      updatePackageStatus: vi.fn(),
    },
  };
}

describe('adaptation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid generate requests', async () => {
    const deps = createDeps();
    const router = createAdaptationRouter(deps as any);
    const handler = getRouteHandler(router, 'post', '/generate');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBeTruthy();
  });

  it('blocks smoke run for non-admin users', async () => {
    const deps = createDeps();
    const router = createAdaptationRouter(deps as any);
    const handler = getRouteHandler(router, 'post', '/smoke/run');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '需要管理员权限' });
  });

  it('blocks package listing when the novel is not accessible', async () => {
    const deps = createDeps();
    deps.novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-2',
    });

    const router = createAdaptationRouter(deps as any);
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        query: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '无权访问此小说' });
    expect(deps.adaptationManager.listPackages).not.toHaveBeenCalled();
  });
});
