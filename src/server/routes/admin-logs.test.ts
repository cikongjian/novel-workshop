import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBufferedLogEntries,
  mockResolveReadableLogDirs,
} = vi.hoisted(() => ({
  mockBufferedLogEntries: vi.fn(),
  mockResolveReadableLogDirs: vi.fn(() => []),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
  getBufferedLogEntries: mockBufferedLogEntries,
}));

vi.mock('../../utils/log-paths.js', () => ({
  resolveReadableLogDirs: mockResolveReadableLogDirs,
}));

import { createAdminLogsRouter } from './admin-logs.js';

function getRouteHandler(router: any, method: 'get', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
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

async function createRouter() {
  return createAdminLogsRouter(() => (_req, _res, next) => next());
}

describe('admin logs routes', () => {
  beforeEach(() => {
    mockBufferedLogEntries.mockReset();
    mockResolveReadableLogDirs.mockReset();
    mockResolveReadableLogDirs.mockReturnValue([]);
    delete process.env.LOG_TO_FILE;
  });

  it('lists log files from the available sources', async () => {
    process.env.LOG_TO_FILE = 'true';
    const router = await createRouter();
    const handler = getRouteHandler(router, 'get', '/files');
    const res = mockResponse();

    await handler(mockRequest({ query: { limit: '5' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      files: [],
      totalSize: 0,
      count: 0,
      persistenceEnabled: true,
    });
  });

  it('falls back to buffered logs for queries when file logging is unavailable', async () => {
    mockBufferedLogEntries.mockReturnValue([
      { time: '2026-03-20T08:00:00.000Z', level: 'info', tag: 'billing', msg: 'Alpha event' },
      { time: '2026-03-20T09:00:00.000Z', level: 'error', tag: 'writer', msg: 'Beta event' },
    ]);
    const router = await createRouter();
    const handler = getRouteHandler(router, 'get', '/query');
    const res = mockResponse();

    await handler(
      mockRequest({
        query: { level: 'error', search: 'beta', limit: '10' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      logs: [
        { time: '2026-03-20T09:00:00.000Z', level: 'error', tag: 'writer', msg: 'Beta event' },
      ],
      summary: {
        total: 2,
        byLevel: { info: 1, error: 1 },
        byTag: { billing: 1, writer: 1 },
        timeRange: {
          earliest: '2026-03-20T08:00:00.000Z',
          latest: '2026-03-20T09:00:00.000Z',
        },
      },
      source: 'buffer',
      persistenceEnabled: false,
    });
  });

  it('returns stats from buffered logs when no files are present', async () => {
    mockBufferedLogEntries.mockReturnValue([
      { time: '2026-03-20T08:00:00.000Z', level: 'warn', tag: 'sync', msg: 'Gamma event' },
    ]);
    const router = await createRouter();
    const handler = getRouteHandler(router, 'get', '/stats');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      summary: {
        total: 1,
        byLevel: { warn: 1 },
        byTag: { sync: 1 },
        timeRange: {
          earliest: '2026-03-20T08:00:00.000Z',
          latest: '2026-03-20T08:00:00.000Z',
        },
      },
      files: {
        count: 0,
        totalSize: 0,
      },
      source: 'buffer',
      persistenceEnabled: false,
    });
  });

  it('returns sorted tags from buffered logs', async () => {
    mockBufferedLogEntries.mockReturnValue([
      { time: '2026-03-20T08:00:00.000Z', level: 'info', tag: 'writer', msg: 'Alpha' },
      { time: '2026-03-20T09:00:00.000Z', level: 'info', tag: 'billing', msg: 'Beta' },
      { time: '2026-03-20T10:00:00.000Z', level: 'info', tag: 'writer', msg: 'Gamma' },
    ]);
    const router = await createRouter();
    const handler = getRouteHandler(router, 'get', '/tags');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      tags: ['billing', 'writer'],
    });
  });

  it('returns the supported log levels', async () => {
    const router = await createRouter();
    const handler = getRouteHandler(router, 'get', '/levels');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      levels: ['debug', 'info', 'warn', 'error'],
    });
  });

  it('rejects invalid query parameters', async () => {
    const router = await createRouter();
    const handler = getRouteHandler(router, 'get', '/query');
    const res = mockResponse();

    await handler(
      mockRequest({
        query: { limit: '5001' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Number must be less than or equal to 1000',
    });
  });
});
