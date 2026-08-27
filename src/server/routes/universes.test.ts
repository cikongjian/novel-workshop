import type { Request, Response, NextFunction } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUniverseRouter } from './universes.js';

function getRouteHandler(router: any, method: 'get' | 'post' | 'put' | 'delete', path: string) {
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
  return response as Response & { statusCode: number; body?: unknown };
}

function mockUniverseManager() {
  return {
    getUniverse: vi.fn(),
    listUniverses: vi.fn(),
    findUniverseByNovel: vi.fn(),
    createUniverse: vi.fn(),
    updateUniverse: vi.fn(),
    deleteUniverse: vi.fn(),
    addNovel: vi.fn(),
    removeNovel: vi.fn(),
    addRelation: vi.fn(),
    updateRelation: vi.fn(),
    removeRelation: vi.fn(),
  };
}

function mockNovelManager() {
  return {
    getNovel: vi.fn(),
    createNovel: vi.fn(),
  };
}

function mockSeriesManager() {
  return {
    getSeries: vi.fn(),
  };
}

describe('universe routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 for series sync when series support is unavailable', async () => {
    const universeManager = mockUniverseManager();
    const novelManager = mockNovelManager();
    const router = createUniverseRouter({
      universeManager: universeManager as any,
      novelManager: novelManager as any,
    });
    const handler = getRouteHandler(router, 'post', '/from-series/:seriesId');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { seriesId: 'series-1' },
      }),
      res,
      vi.fn() as NextFunction,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: '当前环境未启用系列能力' });
  });

  it('rejects syncing a series when novels already belong to multiple universes', async () => {
    const universeManager = mockUniverseManager();
    const novelManager = mockNovelManager();
    const seriesManager = mockSeriesManager();
    const novelA = '11111111-1111-1111-1111-111111111111';
    const novelB = '22222222-2222-2222-2222-222222222222';

    seriesManager.getSeries.mockResolvedValue({
      id: 'series-1',
      title: '系列 A',
      description: 'desc',
      blueprint: {
        overarchingTheme: 'theme',
        sharedWorldRules: 'rules',
        timelineOverview: 'timeline',
      },
      novels: [
        { novelId: novelA, order: 1, timelineSpan: 'T1' },
        { novelId: novelB, order: 2, timelineSpan: 'T2' },
      ],
    });
    novelManager.getNovel.mockImplementation(async (id: string) => ({
      id,
      ownerId: 'owner-1',
      title: `Novel ${id}`,
      genre: 'fantasy',
      status: 'draft',
    }));
    universeManager.findUniverseByNovel
      .mockResolvedValueOnce({ id: 'universe-1' })
      .mockResolvedValueOnce({ id: 'universe-2' });

    const router = createUniverseRouter({
      universeManager: universeManager as any,
      novelManager: novelManager as any,
      seriesManager: seriesManager as any,
    });
    const handler = getRouteHandler(router, 'post', '/from-series/:seriesId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { seriesId: 'series-1' },
      }),
      res,
      vi.fn() as NextFunction,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: '该系列内的作品已分属多个宇宙，无法自动同步，请先人工整理' });
  });

  it('filters universe list for non-admin users based on novel access', async () => {
    const universeManager = mockUniverseManager();
    const novelManager = mockNovelManager();
    const ownNovelId = '11111111-1111-1111-1111-111111111111';
    const foreignNovelId = '22222222-2222-2222-2222-222222222222';

    universeManager.listUniverses.mockResolvedValue([
      { id: 'u1', ownerId: 'owner-1', novels: [] },
      { id: 'u2', ownerId: 'owner-2', novels: [{ novelId: ownNovelId }] },
      { id: 'u3', ownerId: 'owner-2', novels: [{ novelId: foreignNovelId }] },
    ]);
    novelManager.getNovel.mockImplementation(async (id: string) => {
      if (id === ownNovelId) {
        return { id, ownerId: 'owner-1' };
      }
      if (id === foreignNovelId) {
        return { id, ownerId: 'owner-2' };
      }
      return null;
    });

    const router = createUniverseRouter({
      universeManager: universeManager as any,
      novelManager: novelManager as any,
    });
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
      }),
      res,
      vi.fn() as NextFunction,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      { id: 'u1', ownerId: 'owner-1', novels: [] },
      { id: 'u2', ownerId: 'owner-2', novels: [{ novelId: ownNovelId }] },
    ]);
  });

  it('rejects adding a novel that already belongs to another universe', async () => {
    const universeManager = mockUniverseManager();
    const novelManager = mockNovelManager();
    const universeId = 'universe-1';
    const novelId = '11111111-1111-1111-1111-111111111111';

    universeManager.getUniverse.mockResolvedValue({
      id: universeId,
      ownerId: 'owner-1',
      novels: [],
    });
    universeManager.findUniverseByNovel.mockResolvedValue({
      id: 'universe-2',
      title: '冲突宇宙',
    });
    novelManager.getNovel.mockResolvedValue({
      id: novelId,
      ownerId: 'owner-1',
      title: 'Novel A',
      genre: 'fantasy',
      status: 'draft',
    });

    const router = createUniverseRouter({
      universeManager: universeManager as any,
      novelManager: novelManager as any,
    });
    const handler = getRouteHandler(router, 'post', '/:universeId/novels');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { universeId },
        body: { novelId },
      }),
      res,
      vi.fn() as NextFunction,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: '该小说已加入宇宙《冲突宇宙》' });
  });

  it('returns 400 when adding a relation outside the current universe fails', async () => {
    const universeManager = mockUniverseManager();
    const novelManager = mockNovelManager();

    universeManager.getUniverse.mockResolvedValue({
      id: 'universe-1',
      ownerId: 'owner-1',
      novels: [],
    });
    universeManager.addRelation.mockResolvedValue(null);

    const router = createUniverseRouter({
      universeManager: universeManager as any,
      novelManager: novelManager as any,
    });
    const handler = getRouteHandler(router, 'post', '/:universeId/relations');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { universeId: 'universe-1' },
        body: {
          fromNovelId: '11111111-1111-1111-1111-111111111111',
          toNovelId: '22222222-2222-2222-2222-222222222222',
          type: 'side-story',
        },
      }),
      res,
      vi.fn() as NextFunction,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '作品关系创建失败，请确认两部作品都属于当前宇宙' });
  });

  it('rejects creating related works when the source novel is not in the universe', async () => {
    const universeManager = mockUniverseManager();
    const novelManager = mockNovelManager();
    const sourceNovelId = '11111111-1111-1111-1111-111111111111';

    universeManager.getUniverse.mockResolvedValue({
      id: 'universe-1',
      ownerId: 'owner-1',
      novels: [{ novelId: '33333333-3333-3333-3333-333333333333' }],
      relations: [],
    });
    novelManager.getNovel.mockResolvedValue({
      id: sourceNovelId,
      ownerId: 'owner-1',
      title: 'Source Novel',
      genre: 'fantasy',
      status: 'draft',
    });

    const router = createUniverseRouter({
      universeManager: universeManager as any,
      novelManager: novelManager as any,
    });
    const handler = getRouteHandler(router, 'post', '/:universeId/works');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { universeId: 'universe-1' },
        body: {
          title: '新作品',
          genre: 'fantasy',
          sourceNovelId,
          relationType: 'side-story',
        },
      }),
      res,
      vi.fn() as NextFunction,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '来源作品不在当前宇宙中' });
  });
});
