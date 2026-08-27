import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMockState = vi.hoisted(() => ({
  novelsDir: 'data/novels',
}));

vi.mock('../../config/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../config/index.js')>();
  return {
    ...actual,
    getNovelsDir: () => configMockState.novelsDir,
  };
});

import { createImageGenerationRouter } from './image-generation.js';

function getRouteHandler(
  router: any,
  method: 'get' | 'post' | 'delete',
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

function mockResponse(): Response & { statusCode: number; body?: unknown; endedWith?: unknown } {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    endedWith: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader: vi.fn(),
    end(payload?: unknown) {
      this.endedWith = payload;
      return this;
    },
  };
  return response as unknown as Response & { statusCode: number; body?: unknown; endedWith?: unknown };
}

function createNovelManagerMock() {
  return {
    getNovel: vi.fn(),
    getCharacters: vi.fn(),
    saveCharacter: vi.fn(),
  };
}

describe('image generation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks portrait prompt requests when the novel is not accessible', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-2',
    });

    const router = createImageGenerationRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:charId/portrait-prompt');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1', charId: 'char-1' },
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '无权访问此小说' });
  });

  it('returns 503 for portrait generation when image service is unavailable', async () => {
    const novelManager = createNovelManagerMock();
    const router = createImageGenerationRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:charId/portrait');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1', charId: 'char-1' },
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: '图像生成服务未配置，请在设置页面配置 IMAGE_API_KEY 和 IMAGE_BASE_URL' });
  });

  it('preserves upstream image service status codes for portrait generation failures', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
    });
    novelManager.getCharacters.mockResolvedValue([{
      id: 'char-1',
      name: '阿星',
      aliases: [],
      role: 'supporting',
      position: '剑修',
      age: '19',
      gender: '男',
      appearance: '黑发，清瘦，眼神锋利',
      personality: '沉静',
      personalityTraits: [],
      speechStyle: '',
      speechExamples: [],
      backstory: '',
      motivation: '',
      abilities: [],
      relationships: [],
      arc: '',
      currentState: '',
      tags: [],
    }]);
    const imageClient = {
      provider: 'test-image',
      model: 'gpt-image-2',
      generate: vi.fn().mockRejectedValue(
        Object.assign(new Error('rate limit exceeded'), {
          status: 429,
          code: 'rate_limit_exceeded',
        }),
      ),
    };

    const router = createImageGenerationRouter(novelManager as any, undefined, imageClient as any);
    const handler = getRouteHandler(router, 'post', '/:charId/portrait');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1', charId: 'char-1' },
        body: {
          prompt: 'single character portrait',
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(429);
    expect((res.body as any).code).toBe('rate_limit_exceeded');
  });

  it('returns 404 when deleting a portrait for a missing character', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });
    novelManager.getCharacters.mockResolvedValue([]);

    const router = createImageGenerationRouter(novelManager as any);
    const handler = getRouteHandler(router, 'delete', '/:charId/portrait');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1', charId: 'char-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: '角色不存在' });
    expect(novelManager.saveCharacter).not.toHaveBeenCalled();
  });

  it('returns 404 when portrait metadata points to a missing file', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });
    novelManager.getCharacters.mockResolvedValue([{
      id: 'char-1',
      name: '阿星',
      aliases: [],
      role: 'supporting',
      appearance: '',
      personality: '',
      personalityTraits: [],
      speechStyle: '',
      speechExamples: [],
      backstory: '',
      motivation: '',
      abilities: [],
      relationships: [],
      arc: '',
      currentState: '',
      tags: [],
      portraitImagePath: 'portraits/missing-file.png',
      updatedAt: '2026-06-08T00:00:00.000Z',
    }]);

    const router = createImageGenerationRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/:charId/portrait');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1', charId: 'char-1' },
        query: { w: '400' },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: '立绘文件不存在，请重新生成立绘',
      code: 'PORTRAIT_FILE_MISSING',
    });
  });

  it('returns portrait bytes for thumbnail requests before ending the response', async () => {
    const previousNovelsDir = configMockState.novelsDir;
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-portrait-route-'));
    configMockState.novelsDir = path.join(tempRoot, 'novels');

    try {
      const novelId = 'novel-1';
      const novelDir = path.join(configMockState.novelsDir, novelId);
      const portraitsDir = path.join(novelDir, 'portraits');
      await fs.mkdir(portraitsDir, { recursive: true });
      await fs.writeFile(
        path.join(novelDir, 'novel.json'),
        JSON.stringify({ id: novelId, ownerId: 'owner-1' }),
      );
      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
        'base64',
      );
      await fs.writeFile(path.join(portraitsDir, 'char-1.png'), pngBytes);

      const novelManager = createNovelManagerMock();
      novelManager.getNovel.mockResolvedValue({
        id: novelId,
        ownerId: 'owner-1',
      });
      novelManager.getCharacters.mockResolvedValue([{
        id: 'char-1',
        name: '阿星',
        aliases: [],
        role: 'supporting',
        appearance: '',
        personality: '',
        personalityTraits: [],
        speechStyle: '',
        speechExamples: [],
        backstory: '',
        motivation: '',
        abilities: [],
        relationships: [],
        arc: '',
        currentState: '',
        tags: [],
        portraitImagePath: 'portraits/char-1.png',
        updatedAt: '2026-06-08T00:00:00.000Z',
      }]);

      const router = createImageGenerationRouter(novelManager as any);
      const handler = getRouteHandler(router, 'get', '/:charId/portrait');
      const res = mockResponse();

      await handler(
        mockRequest({
          auth: { id: 'owner-1', role: 'user' } as any,
          params: { novelId, charId: 'char-1' },
          query: { w: '400' },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', expect.any(Number));
      expect(Buffer.isBuffer(res.endedWith)).toBe(true);
      expect((res.endedWith as Buffer).length).toBeGreaterThan(0);
    } finally {
      configMockState.novelsDir = previousNovelsDir;
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
