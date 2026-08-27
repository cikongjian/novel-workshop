import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeriesRouter } from './series.js';

function getRouteHandler(router: any, method: 'get' | 'post', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
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

function createDeps() {
  return {
    seriesManager: {
      listSeries: vi.fn(),
      createSeries: vi.fn(),
      getSeries: vi.fn(),
      updateSeries: vi.fn(),
      deleteSeries: vi.fn(),
      addNovel: vi.fn(),
      updateNovelRef: vi.fn(),
      removeNovel: vi.fn(),
      findSeriesByNovel: vi.fn(),
    },
    storyStateManager: {
      getState: vi.fn(),
      buildTrackerInput: vi.fn(),
      saveSnapshot: vi.fn(),
      compressIfNeeded: vi.fn(),
    },
    novelManager: {
      getNovel: vi.fn(),
      getCharacters: vi.fn(),
      listChapters: vi.fn(),
      getChapter: vi.fn(),
    },
  };
}

describe('series routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks reading a series when the user has no access', async () => {
    const deps = createDeps();
    deps.seriesManager.getSeries.mockResolvedValue({
      id: 'series-1',
      ownerId: 'owner-2',
      novels: [],
    });

    const router = createSeriesRouter(deps as any);
    const handler = getRouteHandler(router, 'get', '/:seriesId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { seriesId: 'series-1' },
      }),
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '无权访问该系列' });
  });

  it('returns story state when the novel is accessible', async () => {
    const deps = createDeps();
    deps.novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });
    deps.storyStateManager.getState.mockResolvedValue({
      latestChapter: 3,
      snapshots: [],
    });

    const router = createSeriesRouter(deps as any);
    const handler = getRouteHandler(router, 'get', '/story-state/:novelId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      latestChapter: 3,
      snapshots: [],
    });
  });

  it('returns 503 for backfill when AI dependencies are unavailable', async () => {
    const deps = createDeps();
    const router = createSeriesRouter(deps as any);
    const handler = getRouteHandler(router, 'post', '/story-state/:novelId/backfill');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {},
      }),
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'AI 模型或 Agent 未就绪' });
  });
});
