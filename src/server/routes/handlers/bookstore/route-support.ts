import type { Request } from 'express';
import { UnauthorizedError } from '../../../errors.js';

export function getRouteParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parsePositiveIntegerParam(req: Request, key: string): number | null {
  const value = Number.parseInt(getRouteParam(req, key), 10);
  if (Number.isNaN(value) || value < 1) return null;
  return value;
}

export function requireBookstoreAuth(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) {
    throw new UnauthorizedError('请先登录后再进行此操作');
  }
  return req.auth;
}
