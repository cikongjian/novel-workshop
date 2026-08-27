import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createBackupRouter } from './backup.js';

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
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader: vi.fn(),
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response as unknown as Response & { statusCode: number; body?: unknown };
}

function createBackupManagerMock() {
  return {
    listBackups: vi.fn(),
    createBackup: vi.fn(),
    restoreBackup: vi.fn(),
    deleteBackup: vi.fn(),
    exportAllNovels: vi.fn(),
    exportNovel: vi.fn(),
    importAllNovels: vi.fn(),
  };
}

function createNovelManagerMock() {
  return {
    getNovel: vi.fn(),
  };
}

describe('backup routes', () => {
  it('requires admin for listing all backups', async () => {
    const router = createBackupRouter(createBackupManagerMock() as any, createNovelManagerMock() as any);
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '需要管理员权限' });
  });

  it('rejects invalid novel ids when listing backups for a novel', async () => {
    const router = createBackupRouter(createBackupManagerMock() as any, createNovelManagerMock() as any);
    const handler = getRouteHandler(router, 'get', '/novels/:novelId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'bad/id' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '无效的小说 ID' });
  });

  it('returns deprecated response for storage cleanup preview', async () => {
    const router = createBackupRouter(createBackupManagerMock() as any, createNovelManagerMock() as any);
    const handler = getRouteHandler(router, 'get', '/storage-cleanup/preview');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({
      error: 'Storage cleanup HTTP endpoint has been deprecated. Use the CLI command instead.',
      code: 'BACKUP_STORAGE_CLEANUP_DEPRECATED',
      cli: 'nw backup storage-cleanup',
    });
  });
});
