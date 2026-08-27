import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetConfig,
  mockReadSettings,
  mockReloadConfig,
  mockWriteSettings,
  mockCreateEmailService,
  mockAppendRealNameAuditLog,
  mockListRealNameAuditLogs,
  mockGetAllowedRealNameVerificationProviders,
  mockResetTTSEngine,
  mockNormalizeSettingsPayload,
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(),
  mockReadSettings: vi.fn(),
  mockReloadConfig: vi.fn(),
  mockWriteSettings: vi.fn().mockResolvedValue(undefined),
  mockCreateEmailService: vi.fn(),
  mockAppendRealNameAuditLog: vi.fn(),
  mockListRealNameAuditLogs: vi.fn(),
  mockGetAllowedRealNameVerificationProviders: vi.fn(),
  mockResetTTSEngine: vi.fn(),
  mockNormalizeSettingsPayload: vi.fn(),
}));

vi.mock('../../../config/index.js', () => ({
  getConfig: mockGetConfig,
  readSettings: mockReadSettings,
  reloadConfig: mockReloadConfig,
  writeSettings: mockWriteSettings,
  getNovelsDir: () => 'data/novels',
}));

vi.mock('../../../email/email-service.js', () => ({
  createEmailService: mockCreateEmailService,
}));

vi.mock('../../../auth/real-name-audit-service.js', () => ({
  appendRealNameAuditLog: mockAppendRealNameAuditLog,
  listRealNameAuditLogs: mockListRealNameAuditLogs,
}));

vi.mock('../../../auth/real-name-provider.js', () => ({
  getAllowedRealNameVerificationProviders: mockGetAllowedRealNameVerificationProviders,
}));

vi.mock('../../../tts/engine-factory.js', () => ({
  resetTTSEngine: mockResetTTSEngine,
}));

vi.mock('./settings-payload.js', () => ({
  normalizeSettingsPayload: mockNormalizeSettingsPayload,
}));

vi.mock('../../../tts/kokoro-service-manager.js', () => ({
  kokoroServiceManager: {
    autoStartIfNeeded: vi.fn(),
  },
}));

vi.mock('../../../tts/qwen3-service-manager.js', () => ({
  qwen3TTSServiceManager: {
    autoStartIfNeeded: vi.fn(),
  },
}));

import { registerGeneralSettingsRoutes } from './general-routes.js';

function createRouter() {
  const routes: any[] = [];
  return {
    stack: routes,
    get(path: string, handler: any) {
      routes.push({ route: { path, methods: { get: true }, stack: [{ handle: handler }] } });
      return this;
    },
    put(path: string, handler: any) {
      routes.push({ route: { path, methods: { put: true }, stack: [{ handle: handler }] } });
      return this;
    },
    post(path: string, handler: any) {
      routes.push({ route: { path, methods: { post: true }, stack: [{ handle: handler }] } });
      return this;
    },
  } as any;
}

function getRouteHandler(router: any, method: 'get' | 'put' | 'post', path: string) {
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

describe('general settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllowedRealNameVerificationProviders.mockReturnValue([]);
    mockReadSettings.mockReturnValue({});
    mockGetConfig.mockReturnValue({
      model: { apiKey: '', apiKeys: [] },
      embedding: { apiKey: '', apiKeys: [] },
      image: { apiKey: '' },
    });
    mockNormalizeSettingsPayload.mockImplementation((payload) => payload);
  });

  it('requires admin for reading settings', async () => {
    const router = createRouter();
    registerGeneralSettingsRoutes(router);
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

  it('rejects saving settings without modelProvider', async () => {
    const router = createRouter();
    registerGeneralSettingsRoutes(router);
    const handler = getRouteHandler(router, 'put', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin' } as any,
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'modelProvider is required' });
    expect(mockWriteSettings).not.toHaveBeenCalled();
  });

  it('rejects model tests for non-admin users without a novel scope', async () => {
    const router = createRouter();
    registerGeneralSettingsRoutes(router, undefined, undefined, undefined);
    const handler = getRouteHandler(router, 'post', '/test-model');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user' } as any,
        body: {
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4.1',
          baseUrl: '',
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: '需要管理员权限' });
  });
});
