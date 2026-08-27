import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

const { mockResolveUserModelAccess } = vi.hoisted(() => ({
  mockResolveUserModelAccess: vi.fn(),
}));

vi.mock('./helpers/user-api-model-resolver.js', () => ({
  resolveUserModelAccess: mockResolveUserModelAccess,
}));

import { createAnchorRouter } from './universe-anchor.js';

function getRouteHandler(router: any, method: 'get' | 'post' | 'delete', path: string) {
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
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
  };
  return response as unknown as Response & { statusCode: number; body?: unknown };
}

function createDeps() {
  return {
    anchorManager: {
      listAnchors: vi.fn(),
      getAnchor: vi.fn(),
      deleteAnchor: vi.fn(),
      findAnchorByNovel: vi.fn(),
      confirmCharacters: vi.fn(),
      removeCharacterFromPool: vi.fn(),
      getAnchorLinks: vi.fn(),
      linkAnchor: vi.fn(),
      unlinkAnchor: vi.fn(),
      updateAnchorLink: vi.fn(),
      createAnchor: vi.fn(),
    },
    novelManager: {
      getNovel: vi.fn(),
      getWorldEntries: vi.fn(),
      getCharacters: vi.fn(),
      getOutline: vi.fn(),
      listChapters: vi.fn(),
    },
    broadcastJson: vi.fn(),
    agents: new Map(),
  };
}

describe('universe anchor routes', () => {
  it('filters inaccessible anchors from the list response', async () => {
    const deps = createDeps();
    deps.anchorManager.listAnchors.mockResolvedValue([
      { id: 'anchor-1', sourceNovelId: 'novel-1' },
      { id: 'anchor-2', sourceNovelId: 'novel-2' },
    ]);
    deps.novelManager.getNovel.mockImplementation(async (novelId: string) => {
      if (novelId === 'novel-1') return { id: 'novel-1', ownerId: 'owner-1' };
      return { id: 'novel-2', ownerId: 'owner-2' };
    });
    const router = createAnchorRouter(deps as any);
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: 'anchor-1', sourceNovelId: 'novel-1' }]);
  });

  it('returns deprecated response for single anchor reads', async () => {
    const deps = createDeps();
    const router = createAnchorRouter(deps as any);
    const handler = getRouteHandler(router, 'get', '/:anchorId');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { anchorId: 'anchor-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({
      error: '该宇宙锚点接口已下线，请改用锚点列表和关联接口。',
      code: 'ANCHOR_GET_ONE_DEPRECATED',
    });
  });

  it('returns 503 for generation when anchor curator agent is unavailable', async () => {
    const deps = createDeps();
    const router = createAnchorRouter(deps as any);
    const handler = getRouteHandler(router, 'post', '/generate/:novelId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'AI 模型未就绪' });
  });
});
