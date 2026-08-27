import type { Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../../../config/index.js';
import { resolveNovelStorageDir } from '../../../novel/data-root.js';
import type { NovelManager } from '../../../novel/novel-manager.js';
import { decryptNovelApiKey, isApiKeyMasked } from '../helpers/novel-api-key-crypto.js';
import { checkNovelAccess } from '../../middleware/novel-access.js';

export type GeneralSettingsRouteDeps = {
  onSettingsChanged?: () => void;
  authDb?: import('../../../auth/types.js').AuthDb;
  novelManager?: NovelManager;
};

export function ensureAdmin(req: Request, res: Response): boolean {
  if (req.auth?.role === 'admin') {
    return true;
  }
  res.status(403).json({ error: '需要管理员权限' });
  return false;
}

export async function ensureSettingsTestAccess(
  req: Request,
  res: Response,
  novelManager: NovelManager | undefined,
  novelId?: string,
): Promise<{ allowed: true; allowGlobalFallback: boolean } | { allowed: false }> {
  if (req.auth?.role === 'admin') {
    return { allowed: true, allowGlobalFallback: true };
  }

  if (!novelId) {
    res.status(403).json({ error: '需要管理员权限' });
    return { allowed: false };
  }

  if (!novelManager) {
    res.status(500).json({ error: '小说管理器未就绪' });
    return { allowed: false };
  }

  const access = await checkNovelAccess(req, novelManager, novelId);
  if (!access.allowed) {
    res.status(access.status).json({ error: access.error });
    return { allowed: false };
  }

  return { allowed: true, allowGlobalFallback: false };
}

export async function resolveNovelStoredApiKey(
  novelId: string,
  kind: 'model' | 'embedding',
): Promise<string> {
  try {
    const novelPath = path.join(resolveNovelStorageDir(getNovelsDir(), novelId), 'novel.json');
    const raw = await fs.readFile(novelPath, 'utf-8');
    const novel = JSON.parse(raw);
    const encrypted = kind === 'model'
      ? novel.modelConfig?.apiKey
      : novel.embeddingConfig?.apiKey;
    return encrypted ? decryptNovelApiKey(encrypted) : '';
  } catch {
    return '';
  }
}

export { isApiKeyMasked };
