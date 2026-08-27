import type { Request } from 'express';
import { z } from 'zod';
import type { AuthConfig, AuthDb } from '../../../../auth/types.js';
import type { BackupManager } from '../../../../backup/backup-manager.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { Redis } from 'ioredis';
import { assertSafeUrl } from '../../../../utils/url-safety.js';
import { safeFetch } from '../../../../utils/safe-fetch.js';
import { stripTrailingSlashes } from '../../../../utils/text.js';

export const MAX_IMPORT_SIZE = 500 * 1024 * 1024; // 500MB（同步可能传大量数据）

export const SyncSessionBody = z.object({
  username: z.string().min(1, '账号不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

export type SyncUserScope = {
  userId: string;
  isAdmin: boolean;
};

export interface SyncRouterDeps {
  backupManager: BackupManager;
  novelManager: NovelManager;
  broadcastJson?: (frame: Record<string, unknown>) => void;
  authConfig?: AuthConfig;
  authDb?: AuthDb;
  redis?: Redis;
}

export function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function getSyncUserScope(req: Request): SyncUserScope {
  return {
    userId: req.auth?.id ?? 'dev',
    isAdmin: req.auth?.role === 'admin',
  };
}

export async function resolveRemoteAuthHeader(
  req: Request,
  remoteUrl: string,
  params?: { remoteToken?: string; remoteUsername?: string; remotePassword?: string },
): Promise<string | undefined> {
  const remoteToken = params?.remoteToken;
  const bodyToken = remoteToken?.trim();
  if (bodyToken) {
    return bodyToken.startsWith('Bearer ') ? bodyToken : `Bearer ${bodyToken}`;
  }

  const remoteUsername = params?.remoteUsername?.trim();
  const remotePassword = params?.remotePassword?.trim();
  if (remoteUsername && remotePassword) {
    assertSafeUrl(remoteUrl);
    const sessionUrl = `${stripTrailingSlashes(remoteUrl)}/api/sync/session`;
    const resp = await safeFetch(sessionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: remoteUsername, password: remotePassword }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`远端登录失败 ${resp.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = (await resp.json().catch(() => ({}))) as { accessToken?: string };
    const token = data.accessToken?.trim();
    if (token) return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const authHeader = req.headers.authorization?.trim();
  return authHeader?.startsWith('Bearer ') ? authHeader : undefined;
}
