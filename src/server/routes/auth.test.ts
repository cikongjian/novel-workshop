import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthRouter } from './auth.js';

function getRouteHandlers(
  router: any,
  method: 'get' | 'post' | 'patch',
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

function createDeps() {
  return {
    db: {} as any,
    redis: {} as any,
    config: {
      jwtSecret: 'secret',
      jwtExpiresIn: '1h',
      refreshExpiresInDays: 7,
    } as any,
  };
}

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns password policy', async () => {
    const router = createAuthRouter(createDeps());
    const [handler] = getRouteHandlers(router, 'get', '/password-policy');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it('returns 401 for /me when unauthenticated', async () => {
    const router = createAuthRouter(createDeps());
    const [handler] = getRouteHandlers(router, 'get', '/me');
    const res = mockResponse();

    await handler(mockRequest(), res, vi.fn());

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: '未登录' });
  });

  it('returns 503 for admin cost overview when novel manager is unavailable', async () => {
    const router = createAuthRouter(createDeps());
    const handlers = getRouteHandlers(router, 'get', '/admin/cost-overview');
    const handler = handlers[handlers.length - 1];
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin' } as any,
      }),
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: '小说管理器未就绪' });
  });

  it('blocks risky public profile fields before updating', async () => {
    const router = createAuthRouter({
      ...createDeps(),
      contentAuditService: {
        auditText: vi.fn().mockResolvedValue({
          violations: [
            {
              type: 'ad',
              confidence: 74,
              position: { start: 0, end: 4 },
              keyword: '加我微信',
              context: '加我微信领福利',
            },
          ],
          overallScore: 74,
          suggestion: 'review',
        }),
      } as any,
    });
    const [handler] = getRouteHandlers(router, 'patch', '/profile');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: { bio: '加我微信领福利' },
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'PROFILE_CONTENT_BLOCKED' });
  });

  it('blocks risky usernames before changing them', async () => {
    const router = createAuthRouter({
      ...createDeps(),
      contentAuditService: {
        auditText: vi.fn().mockResolvedValue({
          violations: [
            {
              type: 'abuse',
              confidence: 92,
              position: { start: 0, end: 2 },
              keyword: '废物',
              context: '废物作者',
            },
          ],
          overallScore: 92,
          suggestion: 'block',
        }),
      } as any,
    });
    const [handler] = getRouteHandlers(router, 'post', '/change-username');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: {
          currentPassword: 'old-password',
          newUsername: '废物作者',
        },
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'USERNAME_CONTENT_BLOCKED' });
  });
});
