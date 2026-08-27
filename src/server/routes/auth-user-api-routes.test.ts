import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateUserApiProfile,
  mockDeleteUserApiProfile,
  mockGetProfile,
  mockGetUserApiProfileWithSecret,
  mockListUserApiProfiles,
  mockUpdateUserApiProfile,
  mockGetConfig,
  mockCreateNovelModelClient,
} = vi.hoisted(() => ({
  mockCreateUserApiProfile: vi.fn(),
  mockDeleteUserApiProfile: vi.fn(),
  mockGetProfile: vi.fn(),
  mockGetUserApiProfileWithSecret: vi.fn(),
  mockListUserApiProfiles: vi.fn(),
  mockUpdateUserApiProfile: vi.fn(),
  mockGetConfig: vi.fn(),
  mockCreateNovelModelClient: vi.fn(),
}));

vi.mock('../../auth/user-api-service.js', () => ({
  createUserApiProfile: mockCreateUserApiProfile,
  deleteUserApiProfile: mockDeleteUserApiProfile,
  getUserApiProfileWithSecret: mockGetUserApiProfileWithSecret,
  listUserApiProfiles: mockListUserApiProfiles,
  updateUserApiProfile: mockUpdateUserApiProfile,
}));

vi.mock('../../auth/user-service.js', () => ({
  getProfile: mockGetProfile,
}));

vi.mock('../../config/index.js', () => ({
  getConfig: mockGetConfig,
}));

vi.mock('../../models/provider.js', () => ({
  createNovelModelClient: mockCreateNovelModelClient,
}));

import { registerAuthUserApiRoutes } from './auth-user-api-routes.js';

function createRouter() {
  const routes: any[] = [];
  return {
    stack: routes,
    get(path: string, handler: any) {
      routes.push({ route: { path, methods: { get: true }, stack: [{ handle: handler }] } });
      return this;
    },
    post(path: string, handler: any) {
      routes.push({ route: { path, methods: { post: true }, stack: [{ handle: handler }] } });
      return this;
    },
    put(path: string, handler: any) {
      routes.push({ route: { path, methods: { put: true }, stack: [{ handle: handler }] } });
      return this;
    },
    delete(path: string, handler: any) {
      routes.push({ route: { path, methods: { delete: true }, stack: [{ handle: handler }] } });
      return this;
    },
  } as any;
}

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

describe('auth user api routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({
      userApi: {
        enabled: true,
        allowPlatformCache: true,
        allowLocalOnly: true,
      },
    });
  });

  it('returns 401 for policy when unauthenticated', async () => {
    const router = createRouter();
    registerAuthUserApiRoutes(router, {} as any);
    const handler = getRouteHandler(router, 'get', '/user-api/policy');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: '未登录' });
  });

  it('blocks profile creation when platform cache mode is disabled', async () => {
    mockGetProfile.mockResolvedValue({ id: 'user-1', role: 'admin', creatorStatus: 'approved' });
    mockGetConfig.mockReturnValue({
      userApi: {
        enabled: true,
        allowPlatformCache: false,
        allowLocalOnly: true,
      },
    });

    const router = createRouter();
    registerAuthUserApiRoutes(router, {} as any);
    const handler = getRouteHandler(router, 'post', '/user-api/profiles');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'admin' } as any,
        body: {
          name: 'Primary',
          scope: 'model',
          provider: 'openai',
          model: 'gpt-4.1',
          baseUrl: '',
          storageMode: 'server',
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '管理员已关闭平台缓存模式' });
    expect(mockCreateUserApiProfile).not.toHaveBeenCalled();
  });

  it('rejects draft test requests without any api key', async () => {
    mockGetProfile.mockResolvedValue({ id: 'user-1', role: 'admin', creatorStatus: 'approved' });

    const router = createRouter();
    registerAuthUserApiRoutes(router, {} as any);
    const handler = getRouteHandler(router, 'post', '/user-api/test-draft');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'admin' } as any,
        body: {
          provider: 'openai',
          model: 'gpt-4.1',
          baseUrl: '',
          storageMode: 'local',
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, error: '请先填写至少一个 API Key' });
    expect(mockCreateNovelModelClient).not.toHaveBeenCalled();
  });
});
