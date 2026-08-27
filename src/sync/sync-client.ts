/**
 * 同步客户端 — 协调本地与远端实例间的小说数据同步。
 *
 * 本地主动发起：push（本地→远端）或 pull（远端→本地）。
 */

import { createLogger } from '../utils/logger.js';
import { assertSafeUrl } from '../utils/url-safety.js';
import { safeFetch, SAFE_FETCH_RESPONSE_LIMITS } from '../utils/safe-fetch.js';
import { stripTrailingSlashes } from '../utils/text.js';
import type { BackupManager } from '../backup/backup-manager.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type {
  SyncManifestEntry,
  SyncPlan,
  SyncAction,
} from './sync-types.js';

const log = createLogger('sync-client');

/** 两端 updatedAt 差异在此范围内视为冲突（秒） */
const CONFLICT_THRESHOLD_SEC = 60;

const SYNC_FETCH_TIMEOUT_MS = 30_000;
const SYNC_TRANSFER_TIMEOUT_MS = 300_000;

export class SyncClient {
  private readonly remoteUrl: string;

  constructor(
    remoteUrl: string,
    private readonly backupManager: BackupManager,
    private readonly novelManager: NovelManager,
    private readonly remoteAuthHeader?: string,
  ) {
    assertSafeUrl(remoteUrl);
    this.remoteUrl = stripTrailingSlashes(remoteUrl);
  }

  /** 获取远端小说清单 */
  async fetchRemoteManifest(): Promise<SyncManifestEntry[]> {
    const url = `${this.remoteUrl}/api/sync/manifest`;
    const resp = await safeFetch(url, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(SYNC_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      throw new Error(`远端返回 ${resp.status}: ${await resp.text().catch(() => '')}`);
    }
    return resp.json() as Promise<SyncManifestEntry[]>;
  }

  /** 构建本地小说清单 */
  async buildLocalManifest(options?: { ownerId?: string; includeAll?: boolean }): Promise<SyncManifestEntry[]> {
    const novels = await this.novelManager.listNovels();
    const filtered = options?.includeAll
      ? novels
      : novels.filter((n) => (n.ownerId ?? 'dev') === (options?.ownerId ?? 'dev'));
    return filtered.map(n => ({
      id: n.id,
      syncId: n.syncId ?? n.id,
      title: n.title,
      updatedAt: n.updatedAt,
      chapterCount: n.chapterCount ?? 0,
    }));
  }

  /** 对比本地与远端清单，生成同步计划 */
  comparePlans(
    local: SyncManifestEntry[],
    remote: SyncManifestEntry[],
  ): SyncPlan[] {
    const plans: SyncPlan[] = [];
    const remoteBySyncId = new Map(remote.map(r => [r.syncId, r]));
    const matchedRemoteSyncIds = new Set<string>();

    for (const l of local) {
      const r = remoteBySyncId.get(l.syncId);
      if (!r) {
        plans.push({
          syncId: l.syncId,
          title: l.title,
          action: 'local_only',
          localId: l.id,
          localUpdatedAt: l.updatedAt,
        });
        continue;
      }

      matchedRemoteSyncIds.add(r.syncId);
      const action = this.determineAction(l.updatedAt, r.updatedAt);
      plans.push({
        syncId: l.syncId,
        title: l.title,
        action,
        localId: l.id,
        remoteId: r.id,
        localUpdatedAt: l.updatedAt,
        remoteUpdatedAt: r.updatedAt,
      });
    }

    // 仅远端有的
    for (const r of remote) {
      if (!matchedRemoteSyncIds.has(r.syncId)) {
        plans.push({
          syncId: r.syncId,
          title: r.title,
          action: 'remote_only',
          remoteId: r.id,
          remoteUpdatedAt: r.updatedAt,
        });
      }
    }

    return plans;
  }

  /** 推送本地小说到远端 */
  async pushNovel(localNovelId: string): Promise<void> {
    const { buffer } = await this.backupManager.exportNovel(localNovelId);
    const url = `${this.remoteUrl}/api/sync/import`;
    const resp = await safeFetch(url, {
      method: 'POST',
      headers: this.buildHeaders({ 'Content-Type': 'application/gzip' }),
      body: buffer,
      signal: AbortSignal.timeout(SYNC_TRANSFER_TIMEOUT_MS),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`推送失败 ${resp.status}: ${detail}`);
    }
    log.info('推送完成', { localNovelId });
  }

  async downloadRemoteNovel(remoteNovelId: string): Promise<Buffer> {
    const url = `${this.remoteUrl}/api/sync/export/${encodeURIComponent(remoteNovelId)}`;
    const resp = await safeFetch(url, {
      headers: this.buildHeaders(),
      signal: AbortSignal.timeout(SYNC_TRANSFER_TIMEOUT_MS),
      maxResponseBytes: SAFE_FETCH_RESPONSE_LIMITS.syncArchive,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`拉取失败 ${resp.status}: ${detail}`);
    }
    return Buffer.from(await resp.arrayBuffer());
  }

  // ===== 内部方法 =====

  private determineAction(localUpdatedAt: string, remoteUpdatedAt: string): SyncAction {
    const localTime = new Date(localUpdatedAt).getTime();
    const remoteTime = new Date(remoteUpdatedAt).getTime();
    const diffSec = Math.abs(localTime - remoteTime) / 1000;

    if (diffSec < CONFLICT_THRESHOLD_SEC) {
      return 'in_sync';
    }
    return localTime > remoteTime ? 'push' : 'pull';
  }

  private buildHeaders(baseHeaders?: Record<string, string>): Headers {
    const headers = new Headers(baseHeaders ?? {});
    if (this.remoteAuthHeader && !headers.has('Authorization')) {
      headers.set('Authorization', this.remoteAuthHeader);
    }
    return headers;
  }
}
