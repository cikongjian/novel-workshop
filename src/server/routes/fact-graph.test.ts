import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createFactGraphRouter } from './fact-graph.js';

function getRouteHandler(router: any, method: 'get' | 'post', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

function getMiddleware(router: any, index = 0) {
  const layers = router.stack.filter((entry: any) => !entry.route);
  const layer = layers[index];
  if (!layer) {
    throw new Error(`middleware not found at index ${index}`);
  }
  return layer.handle;
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
  };
  return response as unknown as Response & { statusCode: number; body?: unknown };
}

function createNovelManagerMock() {
  return {
    getNovel: vi.fn(),
    getFactGraph: vi.fn(),
    listChapters: vi.fn(),
    getCharacters: vi.fn(),
    getChapter: vi.fn(),
    saveFactGraph: vi.fn(),
  };
}

describe('fact graph routes', () => {
  it('enforces novel access in middleware', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-2',
    });
    const router = createFactGraphRouter(novelManager as any);
    const middleware = getMiddleware(router);
    const req = mockRequest({
      auth: { id: 'owner-1', role: 'user' } as any,
      params: { novelId: 'novel-1' },
    });
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '无权访问此小说' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns deprecated payloads for timeline endpoint', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });
    const router = createFactGraphRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/timeline');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({
      error: '事实图谱时间线公开接口已弃用',
      code: 'FACT_GRAPH_TIMELINE_DEPRECATED',
    });
  });

  it('rebuilds an empty graph when there are no chapters', async () => {
    const novelManager = createNovelManagerMock();
    const novelMemory = {
      indexFactGraph: vi.fn().mockResolvedValue(undefined),
    };
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });
    novelManager.listChapters.mockResolvedValue([]);
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.saveFactGraph.mockResolvedValue(undefined);

    const router = createFactGraphRouter(novelManager as any, novelMemory as any);
    const handler = getRouteHandler(router, 'post', '/rebuild');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      novelId: 'novel-1',
      lastUpdatedChapter: 0,
      characterAppearances: [],
      factEvents: [],
    });
    expect(novelManager.saveFactGraph).toHaveBeenCalledTimes(1);
    expect(novelMemory.indexFactGraph).toHaveBeenCalledTimes(1);
  });
});
