import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetConstitution,
  mockGetConstitutionVersions,
  mockUpdateConstitution,
  mockRollbackConstitution,
  mockGetTask,
  mockStartTask,
  mockResolveUserModelAccess,
  mockDeleteNovelCoverFile,
  mockResolveNovelCoverPath,
  mockSaveNovelCoverFile,
  mockServeOptimizedImage,
  mockAcceptsWebp,
  mockNormalizeWidth,
  mockExportNovel,
} = vi.hoisted(() => ({
  mockGetConstitution: vi.fn(),
  mockGetConstitutionVersions: vi.fn(),
  mockUpdateConstitution: vi.fn(),
  mockRollbackConstitution: vi.fn(),
  mockGetTask: vi.fn(),
  mockStartTask: vi.fn(),
  mockResolveUserModelAccess: vi.fn(),
  mockDeleteNovelCoverFile: vi.fn(),
  mockResolveNovelCoverPath: vi.fn(),
  mockSaveNovelCoverFile: vi.fn(),
  mockServeOptimizedImage: vi.fn(),
  mockAcceptsWebp: vi.fn(() => false),
  mockNormalizeWidth: vi.fn(() => undefined),
  mockExportNovel: vi.fn(),
}));

vi.mock('./handlers/shared/constitution-handler.js', () => ({
  getConstitution: mockGetConstitution,
  getConstitutionVersions: mockGetConstitutionVersions,
  updateConstitution: mockUpdateConstitution,
  rollbackConstitution: mockRollbackConstitution,
}));

vi.mock('./helpers/user-api-model-resolver.js', () => ({
  resolveUserModelAccess: mockResolveUserModelAccess,
}));

vi.mock('./helpers/novel-cover-storage.js', () => ({
  deleteNovelCoverFile: mockDeleteNovelCoverFile,
  resolveNovelCoverPath: mockResolveNovelCoverPath,
  saveNovelCoverFile: mockSaveNovelCoverFile,
}));

vi.mock('../../utils/image-optimizer.js', () => ({
  serveOptimizedImage: mockServeOptimizedImage,
  acceptsWebp: mockAcceptsWebp,
  normalizeWidth: mockNormalizeWidth,
}));

vi.mock('../../novel/exporter.js', () => ({
  exportNovel: mockExportNovel,
}));

vi.mock('./handlers/shared/constitution-generation-service.js', () => ({
  constitutionGenerationService: {
    getTask: mockGetTask,
    startTask: mockStartTask,
  },
}));

// 封面 magic 校验测试需绕过 disableCoverUpload 开关（产品默认 true，引导用 AI 生成封面）
vi.mock('../../config/index.js', async (importActual) => {
  const actual = await importActual() as typeof import('../../config/index.js');
  return {
    ...actual,
    getConfig: () => ({ ...actual.getConfig(), disableCoverUpload: false }),
  };
});

import { createNovelsRouter } from './novels.js';

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

function mockResponse(): Response & { statusCode: number; body?: unknown; sent?: unknown } {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    sent: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload?: unknown) {
      this.sent = payload;
      return this;
    },
    setHeader: vi.fn(),
  };
  return response as unknown as Response & { statusCode: number; body?: unknown; sent?: unknown };
}

function mockNovelManager() {
  return {
    listNovels: vi.fn(),
    listNovelSummaries: vi.fn(),
    listTrash: vi.fn(),
    restoreNovel: vi.fn(),
    permanentDeleteNovel: vi.fn(),
    getNovel: vi.fn(),
    getCharacterEvents: vi.fn(),
    updateNovel: vi.fn(),
    deleteNovel: vi.fn(),
    forkNovel: vi.fn(),
  };
}

describe('novel routes', () => {
  beforeEach(() => {
    mockGetConstitution.mockReset();
    mockGetConstitutionVersions.mockReset();
    mockUpdateConstitution.mockReset();
    mockRollbackConstitution.mockReset();
    mockGetTask.mockReset();
    mockStartTask.mockReset();
    mockResolveUserModelAccess.mockReset();
    mockDeleteNovelCoverFile.mockReset();
    mockResolveNovelCoverPath.mockReset();
    mockSaveNovelCoverFile.mockReset();
    mockServeOptimizedImage.mockReset();
    mockAcceptsWebp.mockReset();
    mockAcceptsWebp.mockReturnValue(false);
    mockNormalizeWidth.mockReset();
    mockNormalizeWidth.mockReturnValue(undefined);
    mockExportNovel.mockReset();
  });

  it('filters trash list to the current user for non-admin requests', async () => {
    const novelManager = mockNovelManager();
    novelManager.listTrash.mockResolvedValue([
      { id: 'n1', ownerId: 'owner-1' },
      { id: 'n2', ownerId: 'owner-2' },
      { id: 'n3' },
    ]);
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/trash/list');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: 'n1', ownerId: 'owner-1' }]);
  });

  it('filters novel list to the current user for non-admin requests', async () => {
    const novelManager = mockNovelManager();
    novelManager.listNovels = vi.fn().mockResolvedValue([
      { id: 'n1', ownerId: 'owner-1' },
      { id: 'n2', ownerId: 'owner-2' },
      { id: 'n3' },
    ]);
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      { id: 'n1', ownerId: 'owner-1', ownerName: 'owner-1' },
    ]);
  });

  it('uses the lightweight summary listing when the novels query requests summary view', async () => {
    const novelManager = mockNovelManager();
    novelManager.listNovelSummaries.mockResolvedValue([
      { id: 'n1', ownerId: 'owner-1', title: 'Summary Novel' },
      { id: 'n2', ownerId: 'owner-2', title: 'Other Novel' },
    ]);
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        query: { view: 'summary' },
        auth: { id: 'owner-1', role: 'user' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(novelManager.listNovelSummaries).toHaveBeenCalledOnce();
    expect(novelManager.listNovels).not.toHaveBeenCalled();
    expect(res.body).toEqual([
      { id: 'n1', ownerId: 'owner-1', title: 'Summary Novel', ownerName: 'owner-1' },
    ]);
  });

  it('serves public character events without applying an owner-only loader', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({ id: 'n1', ownerId: 'owner-1' });
    novelManager.getCharacterEvents.mockResolvedValue([{ id: 'event-1', chapterNumber: 1 }]);
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/:id/character-events');
    const res = mockResponse();

    await handler(
      mockRequest({ params: { id: 'n1' } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: 'event-1', chapterNumber: 1 }]);
    expect(novelManager.getCharacterEvents).toHaveBeenCalledWith('n1', undefined);
  });

  it('blocks restoring trash novels owned by another user', async () => {
    const novelManager = mockNovelManager();
    novelManager.listTrash.mockResolvedValue([
      { id: 'n2', ownerId: 'owner-2' },
    ]);
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/trash/:id/restore');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n2' },
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '无权操作此小说' });
    expect(novelManager.restoreNovel).not.toHaveBeenCalled();
  });

  it('returns the current constitution generation task for owned novels', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
    });
    mockGetTask.mockReturnValue({ id: 'task-1', status: 'running' });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/:id/constitution/generation-status');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ task: { id: 'task-1', status: 'running' } });
  });

  it('returns constitution version history for accessible novels', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/:id/constitution/versions');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
      }),
      res,
    );

    expect(mockGetConstitutionVersions).toHaveBeenCalledOnce();
  });

  it('returns marketing package history for accessible novels', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
      marketingPackages: [{ id: 'pkg-1' }],
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/:id/marketing-packages');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: 'pkg-1' }]);
  });

  it('reuses active constitution generation tasks without starting a new one', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
      modelConfig: { source: 'platform' },
    });
    mockGetTask.mockReturnValue({ id: 'task-1', status: 'queued' });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:id/constitution/generate');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ task: { id: 'task-1', status: 'queued' } });
    expect(mockResolveUserModelAccess).not.toHaveBeenCalled();
    expect(mockStartTask).not.toHaveBeenCalled();
  });

  it('returns 503 when constitution generation has no usable model client', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
      modelConfig: { source: 'platform' },
    });
    mockGetTask.mockReturnValue(undefined);
    mockResolveUserModelAccess.mockResolvedValue({
      error: undefined,
      client: undefined,
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:id/constitution/generate');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
        headers: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'AI 功能尚未就绪：缺少可用模型配置' });
    expect(mockStartTask).not.toHaveBeenCalled();
  });

  it('rejects user-profile constitution generation when user api access is unavailable', async () => {
    const novelManager = mockNovelManager();
    const novel = {
      id: 'n1',
      ownerId: 'owner-1',
      modelConfig: { source: 'user-profile' },
    };
    novelManager.getNovel.mockResolvedValue(novel);
    mockGetTask.mockReturnValue(undefined);
    mockResolveUserModelAccess.mockResolvedValue({
      error: 'missing-user-api',
      client: undefined,
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:id/constitution/generate');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
        headers: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'missing-user-api',
      code: 'USER_API_UNAVAILABLE',
    });
  });

  it('routes constitution rollback through the protected write path', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:id/constitution/rollback/:version');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1', version: '2' },
      }),
      res,
    );

    expect(mockRollbackConstitution).toHaveBeenCalledOnce();
  });

  it('returns deprecated status for subplot board reads', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/:id/subplot-board');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({
      error: '支线进度板公开接口已弃用',
      code: 'SUBPLOT_BOARD_DEPRECATED',
    });
  });

  it('returns 404 for cover reads when the novel has no cover image', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
      coverImage: undefined,
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'get', '/cover/:id');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { id: 'n1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: '无封面' });
  });

  it('rejects cover uploads that fail image magic validation', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
      coverImage: undefined,
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/cover/:id');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
        body: {
          data: Buffer.from('not-an-image').toString('base64'),
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '上传的文件不是有效图片（仅支持 JPEG/PNG/WebP）' });
    expect(mockSaveNovelCoverFile).not.toHaveBeenCalled();
  });

  it('deletes covers and notifies the bookstore manager', async () => {
    const novelManager = mockNovelManager();
    const bookStoreManager = {
      onNovelCoverChanged: vi.fn(),
    };
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
      coverImage: 'cover.png',
    });
    novelManager.updateNovel = vi.fn().mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
      coverImage: undefined,
    });
    const router = createNovelsRouter(
      novelManager as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      bookStoreManager as any,
    );
    const handler = getRouteHandler(router, 'delete', '/cover/:id');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockDeleteNovelCoverFile).toHaveBeenCalledWith(novelManager, 'n1', 'cover.png');
    expect(novelManager.updateNovel).toHaveBeenCalledWith('n1', { coverImage: undefined });
    expect(bookStoreManager.onNovelCoverChanged).toHaveBeenCalledWith('n1');
  });

  it('blocks deleting novels that are still published in the bookstore', async () => {
    const novelManager = mockNovelManager();
    const bookStoreManager = {
      getBookByNovelId: vi.fn().mockResolvedValue({ publishStatus: 'published' }),
    };
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
    });
    const router = createNovelsRouter(
      novelManager as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      bookStoreManager as any,
    );
    const handler = getRouteHandler(router, 'delete', '/:id');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: '该小说已发布到书城，请先从书城下架后再删除' });
    expect(novelManager.deleteNovel).not.toHaveBeenCalled();
  });

  it('exports novels as json payload when the exporter returns text content', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
    });
    mockExportNovel.mockResolvedValue({
      content: '# chapter',
      filename: 'novel.md',
      mimeType: 'text/markdown',
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:id/export');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
        body: { format: 'markdown' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockExportNovel).toHaveBeenCalledWith(novelManager, 'n1', { format: 'markdown' });
    expect(res.body).toEqual({
      content: '# chapter',
      filename: 'novel.md',
      mimeType: 'text/markdown',
    });
  });

  it('validates fork payloads before creating a branch', async () => {
    const novelManager = mockNovelManager();
    novelManager.getNovel.mockResolvedValue({
      id: 'n1',
      ownerId: 'owner-1',
    });
    const router = createNovelsRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/:id/fork');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { id: 'n1' },
        body: { fromChapter: 0 },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Number must be greater than 0' });
    expect(novelManager.forkNovel).not.toHaveBeenCalled();
  });
});
