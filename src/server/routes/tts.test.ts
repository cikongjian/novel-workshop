import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetNarrationEngine,
  mockGetNarrationEngineType,
  mockGetQwen3TTSUrl,
  mockGetTTSEngine,
  mockGetTTSEngineType,
} = vi.hoisted(() => ({
  mockGetNarrationEngine: vi.fn(),
  mockGetNarrationEngineType: vi.fn(),
  mockGetQwen3TTSUrl: vi.fn(),
  mockGetTTSEngine: vi.fn(),
  mockGetTTSEngineType: vi.fn(),
}));

const {
  mockClearChapterCache,
  mockClearChapterCacheFile,
  mockSynthesizeChapterStream,
} = vi.hoisted(() => ({
  mockClearChapterCache: vi.fn(),
  mockClearChapterCacheFile: vi.fn(),
  mockSynthesizeChapterStream: vi.fn(),
}));

vi.mock('../../tts/engine-factory.js', () => ({
  getNarrationEngine: mockGetNarrationEngine,
  getNarrationEngineType: mockGetNarrationEngineType,
  getQwen3TTSUrl: mockGetQwen3TTSUrl,
  getTTSEngine: mockGetTTSEngine,
  getTTSEngineType: mockGetTTSEngineType,
}));

vi.mock('../../tts/tts-service.js', () => ({
  clearChapterCache: mockClearChapterCache,
  clearChapterCacheFile: mockClearChapterCacheFile,
  synthesizeChapterStream: mockSynthesizeChapterStream,
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createTTSRouter } from './tts.js';

function getRouteHandlers(
  router: any,
  method: 'get' | 'put' | 'post' | 'delete',
  path: string,
) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((item: any) => item.handle);
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    headers: {},
    on: vi.fn(),
    ...overrides,
  } as Request;
}

function mockResponse(): Response & {
  statusCode: number;
  body?: unknown;
  headersSent: boolean;
} {
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
      return this;
    },
    setHeader: vi.fn(),
    flushHeaders: vi.fn(function (this: any) {
      this.headersSent = true;
    }),
    write: vi.fn(),
    end: vi.fn(),
  };
  return response as unknown as Response & { statusCode: number; body?: unknown; headersSent: boolean };
}

function createNovelManagerMock() {
  return {
    getNovel: vi.fn(),
    getChapter: vi.fn(),
    getCharacters: vi.fn(),
    listChapters: vi.fn(),
    updateNovel: vi.fn(),
    saveCharacter: vi.fn(),
  };
}

describe('tts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNarrationEngine.mockReset();
    mockGetNarrationEngineType.mockReset();
    mockGetQwen3TTSUrl.mockReset();
    mockGetTTSEngine.mockReset();
    mockGetTTSEngineType.mockReset();
    mockClearChapterCache.mockReset();
    mockClearChapterCacheFile.mockReset();
    mockSynthesizeChapterStream.mockReset();
  });

  it('blocks server synthesis for non-admin users', async () => {
    const novelManager = createNovelManagerMock();
    const router = createTTSRouter(novelManager as any);
    const [requireAdmin] = getRouteHandlers(router, 'get', '/:novelId/:chapterNumber');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireAdmin(
      mockRequest({
        auth: { id: 'user-1', role: 'user' } as any,
        params: { novelId: 'novel-1', chapterNumber: '1' },
      }),
      res,
      next,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: '服务端 TTS 仅限管理员使用',
      hint: '普通用户请使用客户端 TTS 功能',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed for anonymous server synthesis requests', async () => {
    const novelManager = createNovelManagerMock();
    const router = createTTSRouter(novelManager as any);
    const [requireAdmin] = getRouteHandlers(router, 'get', '/:novelId/:chapterNumber');
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    await requireAdmin(
      mockRequest({ params: { novelId: 'novel-1', chapterNumber: '1' } }),
      res,
      next,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: '服务端 TTS 仅限管理员使用',
      hint: '普通用户请使用客户端 TTS 功能',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('applies the server synthesis guard to all audio-generating routes', () => {
    const novelManager = createNovelManagerMock();
    const router = createTTSRouter(novelManager as any);
    const [synthesisGuard] = getRouteHandlers(router, 'get', '/:novelId/:chapterNumber');
    const protectedRoutes: Array<['post', string]> = [
      ['post', '/preview'],
      ['post', '/narrator-voice/:novelId/preview'],
      ['post', '/design-voice/:novelId/:characterId'],
      ['post', '/preview-designed/:novelId/:characterId'],
      ['post', '/design-voices/:novelId'],
    ];

    for (const [method, path] of protectedRoutes) {
      const [routeGuard] = getRouteHandlers(router, method, path);
      expect(routeGuard).toBe(synthesisGuard);
    }
  });

  it('rejects invalid narrator voice updates', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });
    mockGetNarrationEngine.mockReturnValue({
      getVoices: vi.fn().mockResolvedValue([{ name: 'voice-a' }]),
    });

    const router = createTTSRouter(novelManager as any);
    const [handler] = getRouteHandlers(router, 'put', '/narrator-voice/:novelId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: { voice: 'voice-b' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '无效的旁白音色: voice-b' });
    expect(novelManager.updateNovel).not.toHaveBeenCalled();
  });

  it('returns engine status for qwen3 tts', async () => {
    const novelManager = createNovelManagerMock();
    mockGetTTSEngineType.mockReturnValue('qwen3-tts');
    mockGetQwen3TTSUrl.mockReturnValue('http://127.0.0.1:8765');
    mockGetTTSEngine.mockReturnValue({
      isAvailable: vi.fn().mockResolvedValue(true),
    });

    const router = createTTSRouter(novelManager as any);
    const [handler] = getRouteHandlers(router, 'get', '/engine-status');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      engine: 'qwen3-tts',
      available: true,
      qwen3Url: 'http://127.0.0.1:8765',
    });
  });

  it('returns edge tts status without probing the remote service', async () => {
    const novelManager = createNovelManagerMock();
    mockGetTTSEngineType.mockReturnValue('edge-tts');

    const router = createTTSRouter(novelManager as any);
    const [handler] = getRouteHandlers(router, 'get', '/engine-status');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(mockGetTTSEngine).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    );
    expect(res.body).toEqual({
      engine: 'edge-tts',
      available: true,
      qwen3Url: undefined,
    });
  });
});
