import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveUserModelAccess } = vi.hoisted(() => ({
  mockResolveUserModelAccess: vi.fn(),
}));

vi.mock('./helpers/user-api-model-resolver.js', () => ({
  resolveUserModelAccess: mockResolveUserModelAccess,
}));

import { createPlotBranchRouter } from './plot-branches.js';

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

function createNovelManagerMock() {
  return {
    getNovel: vi.fn(),
    getPlotBranchTree: vi.fn(),
    savePlotBranchTree: vi.fn(),
    forkNovel: vi.fn(),
    getOutline: vi.fn(),
    saveOutline: vi.fn(),
    getCharacters: vi.fn(),
    getWorldEntries: vi.fn(),
    getChapter: vi.fn(),
  };
}

describe('plot branch routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserModelAccess.mockReset();
  });

  it('blocks graph access for another user novel', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({ id: 'novel-1', ownerId: 'owner-2' });
    const router = createPlotBranchRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/graph');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '无权访问此小说' });
  });

  it('rejects invalid branch add payloads', async () => {
    const novelManager = createNovelManagerMock();
    const router = createPlotBranchRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/add');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: { chapterNumber: 1, branches: [] },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBeTruthy();
  });

  it('returns 503 for preview generation when no active model client is available', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
      genre: 'fantasy',
      modelConfig: { source: 'platform' },
    });
    novelManager.getPlotBranchTree.mockResolvedValue({
      nodes: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: '分支 A',
          chapterNumber: 3,
          selected: false,
          status: 'candidate',
        },
      ],
      edges: [],
      activeNodeId: null,
      updatedAt: '2026-03-21T00:00:00.000Z',
    });
    novelManager.getOutline.mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] });
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.getWorldEntries.mockResolvedValue([]);
    novelManager.getChapter.mockResolvedValue({ chapterNumber: 3, summary: 'summary', content: 'content' });
    mockResolveUserModelAccess.mockResolvedValue({
      error: undefined,
      client: undefined,
    });

    const router = createPlotBranchRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/generate-preview');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: { nodeId: '11111111-1111-1111-1111-111111111111' },
        headers: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'AI 模型未就绪，无法生成分支预览' });
  });
});
