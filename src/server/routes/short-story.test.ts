import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShortStoryRouter } from './short-story.js';

function getRouteHandler(
  router: any,
  method: 'get' | 'post',
  path: string,
) {
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
    createNovel: vi.fn(),
    updateNovel: vi.fn(),
    getNovel: vi.fn(),
    listChapters: vi.fn(),
  };
}

describe('short story routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects custom short story creation without customConfig', async () => {
    const novelManager = createNovelManagerMock();
    const router = createShortStoryRouter({ novelManager } as any);
    const handler = getRouteHandler(router, 'post', '/create');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        body: {
          title: '自定义短篇',
          template: 'custom',
          targetWordCount: 20000,
          targetChapters: 10,
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '自定义模板需要提供 customConfig' });
    expect(novelManager.createNovel).not.toHaveBeenCalled();
  });

  it('rejects progress requests for non-short-story novels', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });

    const router = createShortStoryRouter({ novelManager } as any);
    const handler = getRouteHandler(router, 'get', '/:novelId/progress');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '该小说不是短篇模式' });
    expect(novelManager.listChapters).not.toHaveBeenCalled();
  });

  it('returns 410 for deprecated template detail endpoint', async () => {
    const novelManager = createNovelManagerMock();
    const router = createShortStoryRouter({ novelManager } as any);
    const handler = getRouteHandler(router, 'get', '/templates/:template');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { template: 'urban-counterattack' },
      }),
      res,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({
      error: '单模板详情接口已下线，请改用当前模板列表接口。',
      code: 'SHORT_STORY_TEMPLATE_DETAIL_DEPRECATED',
    });
  });
});
