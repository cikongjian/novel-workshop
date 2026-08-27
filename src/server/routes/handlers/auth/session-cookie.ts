import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_TOKEN_COOKIE_NAME = 'nw_refresh_token';
export const REFRESH_TOKEN_PATTERN = /^[a-f0-9]{64}$/u;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function cookieOptions(refreshExpiresInDays?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(refreshExpiresInDays === undefined
      ? {}
      : { maxAge: refreshExpiresInDays * MILLISECONDS_PER_DAY }),
  };
}

export function readRefreshTokenCookie(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) continue;
    const name = part.slice(0, separatorIndex).trim();
    if (name !== REFRESH_TOKEN_COOKIE_NAME) continue;

    try {
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      return REFRESH_TOKEN_PATTERN.test(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  refreshExpiresInDays: number,
): void {
  if (!REFRESH_TOKEN_PATTERN.test(refreshToken)) {
    throw new Error('Refusing to set an invalid refresh token cookie');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, cookieOptions(refreshExpiresInDays));
}

export function clearRefreshTokenCookie(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, cookieOptions());
}
