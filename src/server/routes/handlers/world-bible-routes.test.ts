import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockApplyWorldBibleProposals,
  mockResolveUserModelAccess,
  mockRunWorldBiblePreview,
} = vi.hoisted(() => ({
  mockApplyWorldBibleProposals: vi.fn(),
  mockResolveUserModelAccess: vi.fn(),
  mockRunWorldBiblePreview: vi.fn(),
}));

vi.mock('../helpers/user-api-model-resolver.js', () => ({
  resolveUserModelAccess: mockResolveUserModelAccess,
}));

vi.mock('./world-bible-support.js', () => ({
  applyWorldBibleProposals: mockApplyWorldBibleProposals,
  runWorldBiblePreview: mockRunWorldBiblePreview,
}));

import { registerWorldBibleRoutes } from './world-bible-routes.js';

type RouteHandler = (req: Request, res: Response) => Promise<void>;

function createRouterHarness() {
  const handlers = new Map<string, RouteHandler>();
  const router = {
    post: vi.fn((path: string, handler: RouteHandler) => {
      handlers.set(path, handler);
      return router;
    }),
  };
  return { handlers, router };
}

function mockRequest(body: unknown): Request {
  return {
    auth: { id: 'owner-1', role: 'user' },
    body,
    headers: {},
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
    novelManager: { getNovel: vi.fn() },
    modelClient: { complete: vi.fn() },
  } as any;
}

describe('world bible routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserModelAccess.mockResolvedValue({ client: undefined, error: undefined });
  });

  it('registers preview and apply endpoints', () => {
    const { handlers, router } = createRouterHarness();

    registerWorldBibleRoutes(router as any, createDeps());

    expect([...handlers.keys()]).toEqual([
      '/world-bible/preview',
      '/world-bible/apply',
    ]);
  });

  it('rejects an invalid preview body before reading the novel', async () => {
    const deps = createDeps();
    const { handlers, router } = createRouterHarness();
    registerWorldBibleRoutes(router as any, deps);
    const res = mockResponse();

    await handlers.get('/world-bible/preview')!(mockRequest({ novelId: 'invalid' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(deps.novelManager.getNovel).not.toHaveBeenCalled();
  });

  it('returns 404 when preview targets a missing novel', async () => {
    const deps = createDeps();
    deps.novelManager.getNovel.mockResolvedValue(undefined);
    const { handlers, router } = createRouterHarness();
    registerWorldBibleRoutes(router as any, deps);
    const res = mockResponse();

    await handlers.get('/world-bible/preview')!(mockRequest({
      novelId: '00000000-0000-4000-8000-000000000001',
    }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: '小说不存在' });
    expect(mockResolveUserModelAccess).not.toHaveBeenCalled();
  });

  it('returns 503 when preview has no active model client', async () => {
    const deps = createDeps();
    deps.modelClient = undefined;
    deps.novelManager.getNovel.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      modelConfig: { source: 'platform' },
    });
    const { handlers, router } = createRouterHarness();
    registerWorldBibleRoutes(router as any, deps);
    const res = mockResponse();

    await handlers.get('/world-bible/preview')!(mockRequest({
      novelId: '00000000-0000-4000-8000-000000000001',
    }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'AI 模型未配置，暂时无法构建世界圣经' });
    expect(mockRunWorldBiblePreview).not.toHaveBeenCalled();
  });

  it('maps a missing novel during apply to 404', async () => {
    mockApplyWorldBibleProposals.mockRejectedValue(new Error('小说不存在'));
    const { handlers, router } = createRouterHarness();
    registerWorldBibleRoutes(router as any, createDeps());
    const res = mockResponse();

    await handlers.get('/world-bible/apply')!(mockRequest({
      novelId: '00000000-0000-4000-8000-000000000001',
      entries: [{
        name: '王城',
        category: 'geography',
        description: '王国中心城市，控制南北商路与粮仓。',
      }],
      summary: '',
    }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: '小说不存在' });
  });
});
