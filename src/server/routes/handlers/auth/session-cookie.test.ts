import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE_NAME,
  setRefreshTokenCookie,
} from './session-cookie.js';

const originalNodeEnv = process.env.NODE_ENV;
const validToken = 'a'.repeat(64);

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe('refresh token cookie', () => {
  it('reads only a valid refresh token', () => {
    const req = {
      headers: { cookie: `theme=dark; ${REFRESH_TOKEN_COOKIE_NAME}=${validToken}` },
    } as Request;

    expect(readRefreshTokenCookie(req)).toBe(validToken);
    req.headers.cookie = `${REFRESH_TOKEN_COOKIE_NAME}=invalid`;
    expect(readRefreshTokenCookie(req)).toBeUndefined();
  });

  it('sets an HttpOnly production cookie with the configured lifetime', () => {
    process.env.NODE_ENV = 'production';
    const cookie = vi.fn();
    const setHeader = vi.fn();
    const res = { cookie, setHeader } as unknown as Response;

    setRefreshTokenCookie(res, validToken, 7);

    expect(cookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, validToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('clears the cookie with matching attributes', () => {
    process.env.NODE_ENV = 'development';
    const clearCookie = vi.fn();
    const setHeader = vi.fn();
    const res = { clearCookie, setHeader } as unknown as Response;

    clearRefreshTokenCookie(res);

    expect(clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
