import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeReindexMemory: vi.fn(),
}));

vi.mock('../../scripts/reindex-memory.js', () => ({
  executeReindexMemory: mocks.executeReindexMemory,
}));

import { createMemoryRouter } from './memory.js';

function routeHandler(router: any, method: 'post', routePath: string) {
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

describe('memory routes', () => {
  beforeEach(() => {
    mocks.executeReindexMemory.mockReset();
  });

  it('releases the live memory store before and after a disk rebuild', async () => {
    const events: string[] = [];
    const close = vi.fn(() => events.push('close'));
    mocks.executeReindexMemory.mockImplementation(async () => {
      events.push('rebuild');
      return { ok: true, failedNovels: 0 };
    });
    const router = createMemoryRouter({
      novelMemory: { close } as never,
      novelManager: {} as never,
    });
    const handler = routeHandler(router, 'post', '/novels/:novelId/memory/reindex');
    const response = mockResponse();

    await handler({
      params: { novelId: 'novel-1' },
      body: { clearBeforeRebuild: true, dryRun: false },
    } as unknown as Request, response);

    expect(response.statusCode).toBe(200);
    expect(events).toEqual(['close', 'rebuild', 'close']);
    expect(close).toHaveBeenNthCalledWith(1, 'novel-1');
    expect(close).toHaveBeenNthCalledWith(2, 'novel-1');
  });

  it('keeps the live memory store open for a dry-run', async () => {
    const close = vi.fn();
    mocks.executeReindexMemory.mockResolvedValue({ ok: true, failedNovels: 0 });
    const router = createMemoryRouter({
      novelMemory: { close } as never,
      novelManager: {} as never,
    });
    const handler = routeHandler(router, 'post', '/novels/:novelId/memory/reindex');

    await handler({
      params: { novelId: 'novel-1' },
      body: { dryRun: true },
    } as unknown as Request, mockResponse());

    expect(close).not.toHaveBeenCalled();
  });
});
