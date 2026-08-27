import fs from 'node:fs/promises';
import path from 'node:path';
import type { BackupManager } from '../../backup/backup-manager.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { AiUsageContext } from '../../ai/usage-context.js';
import { runWithAiUsageContextAsync } from '../../ai/usage-context.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('sync-route');

const SYNC_IMPORT_SKIP_NAMES = new Set([
  'memory.db',
  'memory.db-wal',
  'memory.db-shm',
  'memory-lance',
  'tts',
  'voices',
]);

export type SyncUserScope = {
  userId: string;
  isAdmin: boolean;
};

export function canAccessNovelByOwner(ownerId: string | undefined, scope: SyncUserScope): boolean {
  return scope.isAdmin || (ownerId ?? 'dev') === scope.userId;
}

function shouldSkipSyncImportFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!normalized) return false;
  const segments = normalized
    .split('/')
    .filter(Boolean)
    .map(segment => segment.toLowerCase());
  return segments.some(segment => SYNC_IMPORT_SKIP_NAMES.has(segment));
}

export async function syncImportNovel(
  data: Buffer,
  _backupManager: BackupManager,
  novelManager: NovelManager,
  scope: SyncUserScope,
): Promise<{ novelId: string; title: string; isUpdate: boolean }> {
  const { createGunzip } = await import('node:zlib');
  const decompressed = await gunzipBuffer(data, createGunzip);
  const files = parseTarForSyncId(decompressed);

  const novelJsonFile = files.find(file => file.name === 'novel.json');
  if (!novelJsonFile) {
    throw new Error('导入包缺少 novel.json');
  }

  let incomingMeta: Record<string, unknown>;
  try {
    incomingMeta = JSON.parse(novelJsonFile.data.toString('utf-8'));
  } catch {
    throw new Error('novel.json 解析失败');
  }

  const incomingSyncId = (incomingMeta.syncId as string) ?? (incomingMeta.id as string);
  const title = typeof incomingMeta.title === 'string' ? incomingMeta.title : '未命名作品';

  const localNovels = await novelManager.listNovels();
  const existing = localNovels.find(
    novel => (novel.syncId ?? novel.id) === incomingSyncId && canAccessNovelByOwner(novel.ownerId, scope),
  );

  if (existing) {
    const novelDir = path.join(novelManager.getDataDir(), 'novels', existing.id);

    const entries = await fs.readdir(novelDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(novelDir, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
    }

    incomingMeta.id = existing.id;
    incomingMeta.syncId = incomingSyncId;
    incomingMeta.ownerId = existing.ownerId ?? scope.userId;
    const updatedJson = Buffer.from(JSON.stringify(incomingMeta, null, 2), 'utf-8');

    for (const file of files) {
      const normalized = path.normalize(file.name);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) continue;
      if (shouldSkipSyncImportFile(normalized)) continue;
      const targetPath = path.join(novelDir, normalized);
      if (!targetPath.startsWith(novelDir)) continue;
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const content = file.name === 'novel.json' ? updatedJson : file.data;
      await fs.writeFile(targetPath, content);
    }

    log.info('同步覆盖成功', { novelId: existing.id, syncId: incomingSyncId, title });
    return { novelId: existing.id, title, isUpdate: true };
  }

  const newId = crypto.randomUUID();
  incomingMeta.id = newId;
  incomingMeta.syncId = incomingSyncId;
  incomingMeta.ownerId = scope.userId;
  const updatedJson = Buffer.from(JSON.stringify(incomingMeta, null, 2), 'utf-8');

  const novelDir = path.join(novelManager.getDataDir(), 'novels', newId);
  await fs.mkdir(novelDir, { recursive: true });

  for (const file of files) {
    const normalized = path.normalize(file.name);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) continue;
    if (shouldSkipSyncImportFile(normalized)) continue;
    const targetPath = path.join(novelDir, normalized);
    if (!targetPath.startsWith(novelDir)) continue;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const content = file.name === 'novel.json' ? updatedJson : file.data;
    await fs.writeFile(targetPath, content);
  }

  log.info('同步新建成功', { novelId: newId, syncId: incomingSyncId, title });
  return { novelId: newId, title, isUpdate: false };
}

export function triggerReindex(
  novelId: string,
  broadcastJson?: (frame: Record<string, unknown>) => void,
  usageContext?: Partial<AiUsageContext>,
): void {
  void runWithAiUsageContextAsync(
    {
      ...(usageContext ?? {
        scope: 'system',
        operationKey: 'system.unscoped',
        operationLabel: 'Unscoped system AI call',
        operationRegistered: true,
      }),
      novelId,
    },
    async () => {
      try {
        const { executeReindexMemory } = await import('../../scripts/reindex-memory.js');
        await executeReindexMemory({
          novelIds: [novelId],
          clearBeforeRebuild: true,
          onProgress: broadcastJson
            ? progress => broadcastJson({ type: 'reindex:progress', ...progress })
            : undefined,
        });
        log.info('Sync import reindex completed', { novelId });
        broadcastJson?.({ type: 'reindex:complete', ok: true, novelId });
      } catch (err) {
        log.warn('Sync import reindex failed', { novelId, error: String(err) });
      }
    },
  );
}

function parseTarForSyncId(buffer: Buffer): Array<{ name: string; data: Buffer }> {
  const files: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) break;

    const nameEnd = header.indexOf(0);
    const name = header.subarray(0, Math.min(nameEnd >= 0 ? nameEnd : 100, 100)).toString('utf-8');
    const sizeStr = header.subarray(124, 135).toString('ascii').trim();
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;

    if (name && size > 0) {
      const payload = Buffer.from(buffer.subarray(offset, offset + size));
      files.push({ name, data: payload });
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

function gunzipBuffer(
  compressed: Buffer,
  createGunzipFn: typeof import('node:zlib').createGunzip,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzipFn();
    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gunzip.on('end', () => resolve(Buffer.concat(chunks)));
    gunzip.on('error', reject);
    gunzip.end(compressed);
  });
}
