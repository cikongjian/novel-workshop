import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../errors.js';

const { mockVerifyAccessToken } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock('../../auth/jwt-service.js', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

import { createAuthMiddleware } from './auth.js';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/',
    headers: {},
    ...overrides,
  } as Request;
}

function createRes(): Response {
  return {} as Response;
}

function createEnabledAuthConfig(): Parameters<typeof createAuthMiddleware>[0] {
  return {
    enabled: true,
    jwtSecret: '12345678901234567890123456789012',
    jwtExpiresIn: '15m',
    refreshExpiresInDays: 7,
    adminUsername: '',
    adminPassword: '',
    redisHost: '',
    redisPort: 0,
    redisPassword: '',
    redisDb: 0,
  };
}

describe('auth middleware', () => {
  beforeEach(() => {
    mockVerifyAccessToken.mockReset();
  });

  it('keeps novel cover reads public', () => {
    const middleware = createAuthMiddleware(createEnabledAuthConfig());
    const req = createReq({
      method: 'GET',
      path: '/novels/cover/novel-1',
    });
    const next = vi.fn();

    middleware(req, createRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it.each([
    '/bookstore/book-1/reader/chapter-page',
    '/bookstore/book-1/reader/comics/1',
    '/bookstore/book-1/reader/comics/1/panels/panel-7-425285e9.png',
    '/bookstore/book-1/comments-page',
  ])('keeps public bookstore pagination reads public: %s', (path) => {
    const middleware = createAuthMiddleware(createEnabledAuthConfig());
    const req = createReq({ method: 'GET', path });
    const next = vi.fn();

    middleware(req, createRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it('requires auth for novel cover writes', () => {
    const middleware = createAuthMiddleware(createEnabledAuthConfig());
    const req = createReq({
      method: 'POST',
      path: '/novels/cover/novel-1',
    });
    const next = vi.fn();

    middleware(req, createRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('parses bearer token for novel cover writes', () => {
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      username: 'tester',
      role: 'user',
    });
    const middleware = createAuthMiddleware(createEnabledAuthConfig());
    const req = createReq({
      method: 'POST',
      path: '/novels/cover/novel-1',
      headers: {
        authorization: 'Bearer token-1',
      },
    });
    const next = vi.fn();

    middleware(req, createRes(), next);

    expect(mockVerifyAccessToken).toHaveBeenCalledWith('token-1', '12345678901234567890123456789012');
    expect(req.auth).toEqual({
      id: 'user-1',
      username: 'tester',
      role: 'user',
    });
    expect(next).toHaveBeenCalledWith();
  });
});
