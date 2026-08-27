import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { registerBillingPaymentRoutes } from './payment-routes.js';

function getRouteHandler(router: any, method: 'get' | 'post', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

function createRouter() {
  const routes: any[] = [];
  return {
    stack: routes,
    post(path: string, handler: any) {
      routes.push({ route: { path, methods: { post: true }, stack: [{ handle: handler }] } });
      return this;
    },
    get(path: string, handler: any) {
      routes.push({ route: { path, methods: { get: true }, stack: [{ handle: handler }] } });
      return this;
    },
  } as any;
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
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

describe('billing payment routes', () => {
  it('rejects unauthenticated topup order creation', async () => {
    const paymentService = {
      createTopupOrder: vi.fn(),
    } as any;
    const router = createRouter();
    registerBillingPaymentRoutes(router, paymentService);
    const handler = getRouteHandler(router, 'post', '/users/:userId/topups/orders');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { userId: 'user-123' },
        body: { points: 100, channel: 'wechat' },
      }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(paymentService.createTopupOrder).not.toHaveBeenCalled();
  });

  it('allows an authenticated user to create an order for self', async () => {
    const paymentService = {
      createTopupOrder: vi.fn().mockResolvedValue({ ok: true }),
    } as any;
    const router = createRouter();
    registerBillingPaymentRoutes(router, paymentService);
    const handler = getRouteHandler(router, 'post', '/users/:userId/topups/orders');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { userId: 'user-123' },
        body: { points: 100, channel: 'wechat' },
        auth: { id: 'user-123', role: 'user', username: 'user-123' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(paymentService.createTopupOrder).toHaveBeenCalledTimes(1);
  });
});
