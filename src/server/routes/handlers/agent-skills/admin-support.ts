import type { Request, Response } from 'express';

export function ensureAdmin(req: Request, res: Response): boolean {
  if (req.auth?.role === 'admin') {
    return true;
  }
  res.status(403).json({ error: '需要管理员权限' });
  return false;
}
