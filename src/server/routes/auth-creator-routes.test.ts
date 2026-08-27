import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockReviewCreatorStatus,
  mockRedeemCreatorInviteCode,
  mockSubmitCreatorApplication,
  mockListCreatorApplications,
  mockReviewCreatorApplication,
  mockEnsureRealNameVerified,
} = vi.hoisted(() => ({
  mockReviewCreatorStatus: vi.fn(),
  mockRedeemCreatorInviteCode: vi.fn(),
  mockSubmitCreatorApplication: vi.fn(),
  mockListCreatorApplications: vi.fn(),
  mockReviewCreatorApplication: vi.fn(),
  mockEnsureRealNameVerified: vi.fn(),
}));

vi.mock('../../auth/creator-service.js', async () => {
  const actual = await vi.importActual<typeof import('../../auth/creator-service.js')>('../../auth/creator-service.js');
  return {
    ...actual,
    reviewCreatorStatus: mockReviewCreatorStatus,
    redeemCreatorInviteCode: mockRedeemCreatorInviteCode,
  };
});

vi.mock('../../auth/creator-application-service.js', async () => {
  const actual = await vi.importActual<typeof import('../../auth/creator-application-service.js')>('../../auth/creator-application-service.js');
  return {
    ...actual,
    submitCreatorApplication: mockSubmitCreatorApplication,
    listCreatorApplications: mockListCreatorApplications,
    reviewCreatorApplication: mockReviewCreatorApplication,
  };
});

vi.mock('./helpers/real-name.js', () => ({
  ensureRealNameVerified: mockEnsureRealNameVerified,
}));

import { registerAuthCreatorRoutes } from './auth-creator-routes.js';

function createRouter() {
  const routes: any[] = [];
  return {
    stack: routes,
    post(path: string, ...handlers: any[]) {
      routes.push({ route: { path, methods: { post: true }, stack: handlers.map((handle) => ({ handle })) } });
      return this;
    },
    get(path: string, ...handlers: any[]) {
      routes.push({ route: { path, methods: { get: true }, stack: handlers.map((handle) => ({ handle })) } });
      return this;
    },
    patch(path: string, ...handlers: any[]) {
      routes.push({ route: { path, methods: { patch: true }, stack: handlers.map((handle) => ({ handle })) } });
      return this;
    },
  } as any;
}

function getRouteHandlers(router: any, method: 'get' | 'post' | 'patch', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry: any) => entry.handle);
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
  return response as Response & { statusCode: number; body?: unknown };
}

describe('auth creator routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated creator applications', async () => {
    const router = createRouter();
    registerAuthCreatorRoutes(router, { db: {} as any });
    const [handler] = getRouteHandlers(router, 'post', '/creator-applications');
    const res = mockResponse();
    const next = vi.fn();

    await handler(mockRequest(), res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: '未登录' });
    expect(mockEnsureRealNameVerified).not.toHaveBeenCalled();
  });

  it('rejects invalid invite redeem payloads', async () => {
    const router = createRouter();
    registerAuthCreatorRoutes(router, { db: {} as any });
    const [handler] = getRouteHandlers(router, 'post', '/creator-invite/redeem');
    const res = mockResponse();
    const next = vi.fn();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user' } as any,
        body: { inviteCode: '' },
      }),
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.message).toBe('邀请码参数无效');
    expect(mockRedeemCreatorInviteCode).not.toHaveBeenCalled();
  });

  it('rejects invalid creator status updates', async () => {
    const router = createRouter();
    registerAuthCreatorRoutes(router, { db: {} as any });
    const handlers = getRouteHandlers(router, 'patch', '/users/:userId/creator-status');
    const handler = handlers[handlers.length - 1];
    const res = mockResponse();
    const next = vi.fn();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin' } as any,
        params: { userId: 'user-1' },
        body: { status: 'bad-status' },
      }),
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error.message).toBe('作家状态参数无效');
    expect(mockReviewCreatorStatus).not.toHaveBeenCalled();
  });
});
