import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetConfig,
  mockGetNovelsDir,
  mockExecuteReindexMemory,
  mockResolveCompatibleApiKey,
  mockInspectNovelMemory,
  mockListNovelIds,
  mockResolveNovelsContentRoot,
  mockCreateLogger,
} = vi.hoisted(() => {
  return {
    mockGetConfig: vi.fn(),
    mockGetNovelsDir: vi.fn(),
    mockExecuteReindexMemory: vi.fn(),
    mockResolveCompatibleApiKey: vi.fn(),
    mockInspectNovelMemory: vi.fn(),
    mockListNovelIds: vi.fn(),
    mockResolveNovelsContentRoot: vi.fn(),
    mockCreateLogger: vi.fn(),
  };
});

vi.mock('../../../config/index.js', () => ({
  getConfig: mockGetConfig,
  getNovelsDir: mockGetNovelsDir,
}));

vi.mock('../../../scripts/reindex-memory.js', () => ({
  executeReindexMemory: mockExecuteReindexMemory,
}));

vi.mock('./api-key.js', () => ({
  resolveCompatibleApiKey: mockResolveCompatibleApiKey,
}));

vi.mock('./memory-health.js', () => ({
  inspectNovelMemory: mockInspectNovelMemory,
  listNovelIds: mockListNovelIds,
  resolveNovelsContentRoot: mockResolveNovelsContentRoot,
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: mockCreateLogger,
}));

vi.mock('../../../ai/usage-context.js', () => ({
  getAiUsageContext: vi.fn(() => null),
  runWithAiUsageContextAsync: vi.fn(),
}));

import { registerMemoryRoutes } from './memory-routes.js';

function createRouter() {
  const middlewares: any[] = [];
  const routes: any[] = [];
  return {
    middlewares,
    stack: routes,
    use(handler: any) {
      middlewares.push(handler);
      return this;
    },
    get(path: string, handler: any) {
      routes.push({ route: { path, methods: { get: true }, stack: [{ handle: handler }] } });
      return this;
    },
    post(path: string, handler: any) {
      routes.push({ route: { path, methods: { post: true }, stack: [{ handle: handler }] } });
      return this;
    },
  } as any;
}

function getRouteHandler(router: any, method: 'get' | 'post', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

function getMiddleware(router: any, index = 0) {
  return router.middlewares[index];
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

describe('memory routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
      embedding: {
        provider: 'openai',
        apiKey: 'embedding-key',
        model: 'text-embedding-3-large',
        baseUrl: '',
      },
    });
    mockGetNovelsDir.mockReturnValue('data/novels');
    mockResolveCompatibleApiKey.mockReturnValue('embedding-key');
    mockResolveNovelsContentRoot.mockReturnValue('data/novels/content');
    mockListNovelIds.mockReturnValue(['novel-1', 'novel-2']);
    mockInspectNovelMemory.mockImplementation(async (novelId: string) => ({
      novelId,
      status: novelId === 'novel-1' ? 'vector_ready' : 'fts_only',
    }));
    mockCreateLogger.mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
    });
  });

  it('requires admin access', () => {
    const router = createRouter();
    registerMemoryRoutes(router);
    const middleware = getMiddleware(router);
    const res = mockResponse();
    const next = vi.fn();

    middleware(
      mockRequest({
        auth: { id: 'user-1', role: 'user' } as any,
      }),
      res,
      next,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Admin permission required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('runs reindex dry-run through the extracted reindex route', async () => {
    const router = createRouter();
    const summary = { ok: true, successNovels: 2, failedNovels: 0 };
    mockExecuteReindexMemory.mockResolvedValue(summary);
    registerMemoryRoutes(router);
    const handler = getRouteHandler(router, 'post', '/reindex-memory');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin' } as any,
        body: {
          scope: 'all',
          dryRun: true,
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(summary);
    expect(mockExecuteReindexMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        embeddingProvider: 'openai',
        embeddingApiKey: 'embedding-key',
        embeddingModel: 'text-embedding-3-large',
      }),
    );
  });

  it('rejects selected health checks without novelIds', async () => {
    const router = createRouter();
    registerMemoryRoutes(router);
    const handler = getRouteHandler(router, 'post', '/memory-health');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin' } as any,
        body: {
          scope: 'selected',
          novelIds: [],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'novelIds is required when scope is selected' });
  });

  it('returns health summary from the extracted health route', async () => {
    const router = createRouter();
    registerMemoryRoutes(router);
    const handler = getRouteHandler(router, 'post', '/memory-health');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin' } as any,
        body: {
          scope: 'all',
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      scope: 'all',
      totalNovels: 2,
      runtime: { enabled: true, engine: 'lancedb' },
      summary: {
        vectorReady: 1,
        vectorIncomplete: 0,
        ftsOnly: 1,
        empty: 0,
        missingDb: 0,
        error: 0,
      },
      items: [
        { novelId: 'novel-1', status: 'vector_ready' },
        { novelId: 'novel-2', status: 'fts_only' },
      ],
    });
  });
});
