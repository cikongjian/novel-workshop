import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveUserModelAccess } = vi.hoisted(() => ({
  mockResolveUserModelAccess: vi.fn(),
}));

vi.mock('./helpers/user-api-model-resolver.js', () => ({
  resolveUserModelAccess: mockResolveUserModelAccess,
}));

import { createCastSessionRouter } from './cast-session.js';

function getRouteHandler(router: any, method: 'post', path: string) {
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
    getPendingCharacterCandidates: vi.fn(),
    getWorldEntries: vi.fn(),
    saveCharacter: vi.fn(),
    saveWorldEntry: vi.fn(),
  };
}

describe('cast session routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserModelAccess.mockReset();
  });

  it('blocks propose requests when the novel is not accessible', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-2',
    });
    const router = createCastSessionRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/propose');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {
          conversation: [{ role: 'user', content: '开场角色需求' }],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '无权访问此小说' });
  });

  it('returns 503 for propose when no active model client is available', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
      title: 'Novel A',
      genre: 'fantasy',
      synopsis: 'synopsis',
      modelConfig: { source: 'platform' },
    });
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.getPendingCharacterCandidates.mockResolvedValue([]);
    mockResolveUserModelAccess.mockResolvedValue({
      error: undefined,
      client: undefined,
    });

    const router = createCastSessionRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/propose');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        headers: {},
        body: {
          conversation: [{ role: 'user', content: '开场角色需求' }],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'AI 模型未就绪，无法生成开局角色提案' });
  });

  it('rejects confirm requests when required slots are not covered', async () => {
    const novelManager = createNovelManagerMock();
    novelManager.getNovel.mockResolvedValue({
      id: 'novel-1',
      ownerId: 'owner-1',
    });
    novelManager.getCharacters.mockResolvedValue([]);
    novelManager.getWorldEntries.mockResolvedValue([]);

    const router = createCastSessionRouter(novelManager as any);
    const handler = getRouteHandler(router, 'post', '/confirm');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user' } as any,
        params: { novelId: 'novel-1' },
        body: {
          proposal: {
            characters: [
              {
                name: '路人甲',
                role: 'supporting',
              },
            ],
            powerSystem: [],
            relationshipSeeds: [],
          },
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toContain('关键角色槽位覆盖不足');
    expect((res.body as any).slotCoverage.missingRequired).toEqual(['主角', '核心反派', '关键盟友']);
    expect(novelManager.saveCharacter).not.toHaveBeenCalled();
  });
});
