import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBillingRouter } from './billing.js';

function getRouteHandler(
  router: any,
  method: 'get' | 'post',
  path: string,
) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[layer.route.stack.length - 1].handle;
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

function createBillingServiceMock() {
  return {
    getPricingCatalog: vi.fn(),
    estimate: vi.fn(),
    redeemCode: vi.fn(),
    listRedemptionCodesForUser: vi.fn(),
    getOverview: vi.fn(),
    getSystemConfig: vi.fn(),
    updateSystemConfig: vi.fn(),
    listAllRedemptionCodes: vi.fn(),
    createManualRedemptionCodes: vi.fn(),
    updateRedemptionCodeStatus: vi.fn(),
    updateRedemptionCodeBatchStatus: vi.fn(),
  };
}

describe('billing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deprecated response for billing rules endpoint', async () => {
    const service = createBillingServiceMock();
    const router = createBillingRouter('data', service as any);
    const handler = getRouteHandler(router, 'get', '/rules');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({
      error: '该计费规则接口已下线，请改用 /billing/pricing。',
      code: 'BILLING_RULES_DEPRECATED',
    });
  });

  it('blocks overview access for another user account', async () => {
    const service = createBillingServiceMock();
    const router = createBillingRouter('data', service as any);
    const handler = getRouteHandler(router, 'get', '/users/:userId/overview');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user' } as any,
        params: { userId: 'user-2' },
        query: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(service.getOverview).not.toHaveBeenCalled();
  });

  it('rejects invalid estimate request payloads', async () => {
    const service = createBillingServiceMock();
    const router = createBillingRouter('data', service as any);
    const handler = getRouteHandler(router, 'post', '/estimate');
    const res = mockResponse();

    await handler(
      mockRequest({
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBeTruthy();
    expect(service.estimate).not.toHaveBeenCalled();
  });
});
