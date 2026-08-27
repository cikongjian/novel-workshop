import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovelManager } from '../../novel/novel-manager.js';
import { createAdminNovelDebugRouter } from './admin-novel-debug.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

function routeHandler(router: any, method: 'get' | 'post', routePath: string) {
  const layer = router.stack.find((entry: any) => (
    entry.route?.path === routePath && entry.route.methods?.[method]
  ));
  if (!layer) throw new Error(`route not found: ${method} ${routePath}`);
  return layer.route.stack[0].handle;
}

function mockResponse(): Response & { statusCode: number; body?: unknown } {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return response as Response & { statusCode: number; body?: unknown };
}

describe('admin novel debug routes', () => {
  it('protects every route with administrator middleware', () => {
    const router = createAdminNovelDebugRouter({ novelManager: {} as never });
    const middleware = router.stack[0].handle as (
      req: Request, res: Response, next: NextFunction,
    ) => void;
    const next = vi.fn();
    middleware({ auth: { id: 'user', username: 'user', role: 'user' } } as Request, mockResponse(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });

  it('returns a bounded maintenance list without novel content', async () => {
    const listNovels = vi.fn(async () => [{
      id: '11111111-1111-4111-8111-111111111111',
      title: '测试小说',
      ownerId: 'owner-1',
      status: 'writing',
      genre: 'modern',
      chapterCount: 3,
      finalizedChapterCount: 2,
      wordCount: 6000,
      synopsis: '不应返回的故事内容',
      updatedAt: '2026-07-12T00:00:00.000Z',
    }]);
    const router = createAdminNovelDebugRouter({
      novelManager: { listNovels } as never,
    });
    const handler = routeHandler(router, 'get', '/novels');
    const response = mockResponse();
    await handler({ query: { limit: '10', offset: '0' } } as unknown as Request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ total: 1, limit: 10, offset: 0 });
    expect(JSON.stringify(response.body)).not.toContain('不应返回的故事内容');
  });

  it('advertises the authenticated remote maintenance protocol', async () => {
    const router = createAdminNovelDebugRouter({
      novelManager: {} as never,
      backupManager: {} as never,
    });
    const handler = routeHandler(router, 'get', '/capabilities');
    const response = mockResponse();
    await handler({} as Request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      protocol: { name: 'novel-data-maintenance', version: 2 },
      features: {
        audit: true,
        organizationApply: true,
        backups: true,
        rollback: true,
        chapterIntegrity: true,
        chapterRepair: true,
        memoryCoverage: false,
        memoryReindex: false,
      },
      limits: { listPageSize: 100, organizationScopes: 6 },
    });
  });

  it('rejects an apply request when the confirmation id differs', async () => {
    const router = createAdminNovelDebugRouter({ novelManager: {} as never });
    const handler = routeHandler(router, 'post', '/novels/:novelId/organize');
    const response = mockResponse();
    await handler({
      params: { novelId: '11111111-1111-4111-8111-111111111111' },
      body: {
        apply: true,
        confirmNovelId: '22222222-2222-4222-8222-222222222222',
        expectedPlanToken: 'a'.repeat(64),
      },
    } as unknown as Request, response);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({ error: '确认的小说 ID 与目标不一致，已拒绝执行' });
  });

  it('returns a stable conflict code for a stale organization plan', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-novel-debug-'));
    temporaryRoots.push(root);
    const novelManager = new NovelManager(path.join(root, 'novels'));
    const novel = await novelManager.createNovel({ title: '远程整理测试', genre: 'modern' });
    const createBackup = vi.fn();
    const router = createAdminNovelDebugRouter({
      novelManager,
      backupManager: { createBackup } as never,
    });
    const handler = routeHandler(router, 'post', '/novels/:novelId/organize');
    const response = mockResponse();

    await handler({
      params: { novelId: novel.id },
      body: {
        apply: true,
        confirmNovelId: novel.id,
        expectedPlanToken: 'a'.repeat(64),
      },
    } as unknown as Request, response);

    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({ code: 'NOVEL_ORGANIZATION_PLAN_STALE' });
    expect(createBackup).not.toHaveBeenCalled();
  });

  it('lists only safe backup metadata', async () => {
    const novelId = '11111111-1111-4111-8111-111111111111';
    const router = createAdminNovelDebugRouter({
      novelManager: { getNovel: vi.fn(async () => ({ id: novelId })) } as never,
      backupManager: {
        listBackups: vi.fn(async () => [{
          id: 'backup-1',
          novelId,
          filename: 'backup-1.tar.gz',
          size: 512,
          createdAt: '2026-07-12T00:00:00.000Z',
        }]),
      } as never,
    });
    const handler = routeHandler(router, 'get', '/novels/:novelId/backups');
    const response = mockResponse();
    await handler({ params: { novelId } } as unknown as Request, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      novelId,
      backups: [{ id: 'backup-1', size: 512, createdAt: '2026-07-12T00:00:00.000Z' }],
    });
    expect(JSON.stringify(response.body)).not.toContain('filename');
  });

  it('rejects rollback when the confirmation id differs', async () => {
    const novelId = '11111111-1111-4111-8111-111111111111';
    const router = createAdminNovelDebugRouter({
      novelManager: {} as never,
      backupManager: {} as never,
    });
    const handler = routeHandler(router, 'post', '/novels/:novelId/rollback');
    const response = mockResponse();
    await handler({
      params: { novelId },
      body: {
        backupId: 'backup-1',
        confirmNovelId: '22222222-2222-4222-8222-222222222222',
      },
    } as unknown as Request, response);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({ error: '确认的小说 ID 与目标不一致，已拒绝回滚' });
  });

  it('rejects chapter repair when the confirmation id differs', async () => {
    const novelId = '11111111-1111-4111-8111-111111111111';
    const router = createAdminNovelDebugRouter({
      novelManager: {} as never,
      backupManager: {} as never,
    });
    const handler = routeHandler(router, 'post', '/novels/:novelId/chapter-integrity/repair');
    const response = mockResponse();
    await handler({
      params: { novelId },
      body: {
        apply: true,
        confirmNovelId: '22222222-2222-4222-8222-222222222222',
        expectedPlanToken: 'a'.repeat(64),
      },
    } as unknown as Request, response);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({ error: '确认的小说 ID 与目标不一致，已拒绝修复' });
  });
});
