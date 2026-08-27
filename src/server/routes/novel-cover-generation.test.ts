import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNovelCoverGenerationRouter } from './novel-cover-generation.js';

function getRouteHandler(
  router: any,
  method: 'post',
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
    getNovel: vi.fn(),
    getCharacters: vi.fn(),
    getOutline: vi.fn(),
    updateNovel: vi.fn(),
  };
}

describe('novel cover generation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks prompt generation when the novel is not accessible', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-2',
    });

    const router = createNovelCoverGenerationRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/prompt');
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

  it('returns template cover prompt when AI model client is unavailable', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
      genre: 'fantasy',
      synopsis: 'synopsis',
      description: 'description',
      tags: ['成长'],
      modelConfig: { source: 'platform' },
    });
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.getOutline.mockRejectedValue(new Error('no outline'));

    const router = createNovelCoverGenerationRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/prompt');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).promptSource).toBe('template');
    expect((res.body as any).positivePrompt).toBeTruthy();
  });

  it('returns model fallback diagnostics only to administrators', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
      genre: 'fantasy',
      synopsis: 'synopsis',
      description: 'description',
      tags: [],
    });
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.getOutline.mockResolvedValue(undefined);
    const modelClient = {
      provider: 'custom-openai',
      model: 'test-model',
      chat: vi.fn().mockRejectedValue(Object.assign(new Error('upstream timed out for sk-secret123'), {
        code: 'ETIMEDOUT',
        status: 504,
      })),
    };
    const router = createNovelCoverGenerationRouter(novelManager as any, modelClient as any);
    const handler = getRouteHandler(router, 'post', '/prompt');

    const adminRes = mockResponse();
    await handler(mockRequest({
      auth: { id: 'owner-1', role: 'admin' } as any,
      params: { novelId: 'novel-1' },
      query: { diagnostics: '1' },
    }), adminRes);
    expect((adminRes.body as any).diagnostics).toMatchObject({
      modelAccess: { source: 'platform-global', provider: 'custom-openai', model: 'test-model' },
      aiAttempt: {
        outcome: 'template-fallback',
        error: { category: 'timeout', code: 'ETIMEDOUT', status: 504 },
      },
    });
    expect((adminRes.body as any).diagnostics.aiAttempt.error.message).not.toContain('sk-secret123');

    const userRes = mockResponse();
    await handler(mockRequest({
      auth: { id: 'owner-1', role: 'user' } as any,
      params: { novelId: 'novel-1' },
      query: { diagnostics: '1' },
    }), userRes);
    expect((userRes.body as any).diagnostics).toBeUndefined();
  });

  it('returns 503 for cover generation when image service is unavailable', async () => {
    const novelManager = createNovelManagerMock();
    const router = createNovelCoverGenerationRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/generate');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: '图像生成服务未配置，请先在设置页面配置 IMAGE_API_KEY / IMAGE_MODEL / IMAGE_BASE_URL，或在"我的 → 文生图API"中配置个人图像模型',
    });
  });

  it('preserves upstream image service status codes for cover generation failures', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
    });
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.getOutline.mockResolvedValue(undefined);
    const imageClient = {
      provider: 'test-image',
      model: 'gpt-image-2',
      generate: vi.fn().mockRejectedValue(
        Object.assign(new Error('invalid api key'), {
          status: 401,
          code: 'invalid_api_key',
        }),
      ),
    };

    const router = createNovelCoverGenerationRouter(novelManager as any, undefined, imageClient as any);
    const handler = getRouteHandler(router, 'post', '/generate');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {
          positivePrompt: 'cinematic fantasy cover',
          saveResult: false,
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect((res.body as any).code).toBe('invalid_api_key');
    expect(imageClient.generate).toHaveBeenCalledTimes(1);
  });
});
