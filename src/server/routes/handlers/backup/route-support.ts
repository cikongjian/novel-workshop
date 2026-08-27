import type { Request, Response } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';

export const MAX_IMPORT_SIZE = 100 * 1024 * 1024;

export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function ensureAdmin(req: Request, res: Response): boolean {
  if (req.auth?.role === 'admin') {
    return true;
  }
  res.status(403).json({ error: '需要管理员权限' });
  return false;
}

export async function ensureNovelAccess(
  req: Request,
  res: Response,
  novelManager: NovelManager,
  novelId: string,
): Promise<boolean> {
  const access = await checkNovelAccess(req, novelManager, novelId);
  if (!access.allowed) {
    res.status(access.status).json({ error: access.error });
    return false;
  }
  return true;
}

export function sendStorageCleanupDeprecated(res: Response, cli: string): void {
  res.status(410).json({
    error: 'Storage cleanup HTTP endpoint has been deprecated. Use the CLI command instead.',
    code: 'BACKUP_STORAGE_CLEANUP_DEPRECATED',
    cli,
  });
}
