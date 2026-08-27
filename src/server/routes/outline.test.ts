import type { Request, Response, NextFunction } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveUserModelAccess } = vi.hoisted(() => ({
  mockResolveUserModelAccess: vi.fn(),
}));

vi.mock('./helpers/user-api-model-resolver.js', () => ({
  resolveUserModelAccess: mockResolveUserModelAccess,
}));

import { createOutlineRouter } from './outline.js';

function getRouteHandler(router: any, method: 'get' | 'post' | 'put', path: string) {
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
    getOutline: vi.fn(),
    saveOutline: vi.fn().mockResolvedValue(undefined),
    listChapters: vi.fn(),
    findLatestChapterNumber: vi.fn(),
    getChapter: vi.fn(),
    getCharacters: vi.fn(),
    getWorldEntries: vi.fn(),
  };
}

function createOutlineFixture() {
  return {
    chapters: [
      {
        chapterNumber: 1,
        title: '',
        summary: '# 第1章：雨夜入城\n#### 场景 1：入城\n**紧张度：7**',
        beats: [],
        tensionTarget: 5,
        plotThreadsAdvanced: [],
        keyEvents: [],
        notes: '',
      },
    ],
    plotThreads: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: '主线谜案',
        description: 'A',
        status: 'planted',
        relatedCharacters: [],
        notes: '',
        prerequisites: [],
        parallelThreads: [],
      },
    ],
    foreshadowing: [
      {
        id: 'foreshadow-1',
        hint: '伏笔 A',
        plantedInChapter: 1,
        resolution: '',
        isResolved: false,
        relatedPlotThreads: [],
        priority: 'medium',
      },
    ],
  };
}

describe('outline routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserModelAccess.mockReset();
  });

  it('enforces novel access in middleware', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-2',
    });
    const router = createOutlineRouter(novelManager as any);
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

  it('backfills chapter metadata when reading outlines', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({ id: 'novel-1', ownerId: 'owner-1' });
    novelManager.getOutline.mockResolvedValue(createOutlineFixture());
    const router = createOutlineRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).chapters[0]).toMatchObject({
      title: '雨夜入城',
      tensionTarget: 7,
      keyEvents: ['入城'],
    });
    expect(novelManager.saveOutline).toHaveBeenCalled();
  });

  it('projects a task graph from outline, chapter and character data', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({ id: 'novel-1', ownerId: 'owner-1' });
    novelManager.getOutline.mockResolvedValue(createOutlineFixture());
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.listChapters.mockResolvedValue([
      { chapterNumber: 1, title: '雨夜入城', status: 'finalized', wordCount: 1800 },
    ]);
    const router = createOutlineRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/task-graph');
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
      summary: { totalTasks: 2, completedTasks: 1 },
    });
    expect((res.body as any).edges.some((edge: any) => edge.type === 'advances')).toBe(false);
  });

  it('deduplicates similar plot threads on outline updates', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({ id: 'novel-1', ownerId: 'owner-1' });
    novelManager.getOutline.mockResolvedValue(createOutlineFixture());
    const router = createOutlineRouter(novelManager as any);
    const handler = getRouteHandler(router, 'put', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {
          plotThreads: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              name: '主线谜案',
              description: 'A',
              status: 'planted',
              relatedCharacters: [],
              notes: '',
              prerequisites: [],
              parallelThreads: [],
            },
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: '主线 谜案',
              description: 'B',
              status: 'developing',
              relatedCharacters: [],
              notes: '',
              prerequisites: [],
              parallelThreads: [],
            },
          ],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).plotThreads).toHaveLength(1);
    expect(novelManager.saveOutline).toHaveBeenCalled();
  });

  it('updates a single foreshadowing item by id', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({ id: 'novel-1', ownerId: 'owner-1' });
    novelManager.getOutline.mockResolvedValue(createOutlineFixture());
    const router = createOutlineRouter(novelManager as any);
    const handler = getRouteHandler(router, 'put', '/foreshadowing/:id');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1', id: 'foreshadow-1' },
        body: {
          isResolved: true,
          resolution: '已回收',
          resolvedInChapter: 3,
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: 'foreshadow-1',
      isResolved: true,
      resolution: '已回收',
      resolvedInChapter: 3,
    });
  });

  it('batch resolves overdue foreshadowing entries', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({ id: 'novel-1', ownerId: 'owner-1' });
    novelManager.getOutline.mockResolvedValue({
      ...createOutlineFixture(),
      foreshadowing: [
        {
          id: 'foreshadow-1',
          hint: '伏笔 A',
          plantedInChapter: 1,
          resolution: '',
          isResolved: false,
          relatedPlotThreads: [],
          priority: 'medium',
        },
      ],
    });
    novelManager.findLatestChapterNumber.mockResolvedValue(12);
    const router = createOutlineRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/foreshadowing-batch-resolve');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ resolvedCount: 1, total: 1 });
    expect(novelManager.saveOutline).toHaveBeenCalled();
  });

  it('returns 500 when outline generation agent is missing', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
      synopsis: 'synopsis',
      description: 'desc',
      genre: 'fantasy',
    });
    const router = createOutlineRouter({ novelManager: novelManager as any, agents: new Map() });
    const handler = getRouteHandler(router, 'post', '/generate');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: { targetChapters: 12 },
      }),
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'outline-generator Agent 未注册' });
  });

  it('returns sync no-op when there are no written chapters to import', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.listChapters.mockResolvedValue([
      { chapterNumber: 1, wordCount: 0, status: 'outlined' },
    ]);
    novelManager.getOutline.mockResolvedValue({
      chapters: [],
      plotThreads: [],
      foreshadowing: [],
    });
    const router = createOutlineRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/sync');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      outline: { chapters: [], plotThreads: [], foreshadowing: [] },
      added: 0,
      updated: 0,
      message: '大纲已是最新，无需同步',
    });
  });

  it('returns 503 for analyze when no active model client is available', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.listChapters.mockResolvedValue([]);
    novelManager.getOutline.mockResolvedValue({
      chapters: [],
      plotThreads: [],
      foreshadowing: [],
    });
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
      genre: 'fantasy',
      modelConfig: { source: 'platform' },
    });
    mockResolveUserModelAccess.mockResolvedValue({
      error: undefined,
      client: undefined,
    });
    const router = createOutlineRouter({ novelManager: novelManager as any });
    const handler = getRouteHandler(router, 'post', '/analyze');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {},
        headers: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'AI 模型未就绪' });
  });
});
