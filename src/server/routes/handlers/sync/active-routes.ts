import type { Router } from 'express';
import { getAiUsageContext } from '../../../../ai/usage-context.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { SyncClient } from '../../../../sync/sync-client.js';
import type { SyncExecuteRequest, SyncResult } from '../../../../sync/sync-types.js';
import { canAccessNovelByOwner, syncImportNovel, triggerReindex } from '../../sync-import.js';
import {
  getSyncUserScope,
  resolveRemoteAuthHeader,
  type SyncRouterDeps,
} from './route-support.js';

export function registerActiveSyncRoutes(
  router: Router,
  deps: SyncRouterDeps,
): void {
  const { backupManager, broadcastJson, novelManager } = deps;

  router.post('/compare', async (req, res) => {
    try {
      const { remoteUrl, remoteToken, remoteUsername, remotePassword } = req.body as {
        remoteUrl?: string;
        remoteToken?: string;
        remoteUsername?: string;
        remotePassword?: string;
      };
      if (!remoteUrl?.trim()) {
        res.status(400).json({ error: '请提供远端地址' });
        return;
      }

      const remoteAuthHeader = await resolveRemoteAuthHeader(req, remoteUrl, {
        remoteToken,
        remoteUsername,
        remotePassword,
      });
      const client = new SyncClient(remoteUrl, backupManager, novelManager, remoteAuthHeader);
      const scope = getSyncUserScope(req);
      const [localManifest, remoteManifest] = await Promise.all([
        client.buildLocalManifest({ ownerId: scope.userId, includeAll: scope.isAdmin }),
        client.fetchRemoteManifest(),
      ]);

      res.json(client.comparePlans(localManifest, remoteManifest));
    } catch (err) {
      res.status(500).json({ error: '对比失败', detail: safeErrorMessage(err, '对比失败') });
    }
  });

  router.post('/execute', async (req, res) => {
    try {
      const { remoteUrl, actions, remoteToken, remoteUsername, remotePassword } = req.body as SyncExecuteRequest;
      if (!remoteUrl?.trim() || !actions?.length) {
        res.status(400).json({ error: '缺少参数' });
        return;
      }

      const remoteAuthHeader = await resolveRemoteAuthHeader(req, remoteUrl, {
        remoteToken,
        remoteUsername,
        remotePassword,
      });
      const client = new SyncClient(remoteUrl, backupManager, novelManager, remoteAuthHeader);
      const scope = getSyncUserScope(req);
      const aiUsageContext = getAiUsageContext();
      const results: SyncResult[] = [];

      for (const item of actions) {
        const result: SyncResult = {
          syncId: item.syncId,
          title: item.syncId,
          action: item.action,
          success: false,
        };

        try {
          if (item.action === 'push' && item.localId) {
            const localNovel = await novelManager.getNovel(item.localId);
            if (!localNovel) {
              throw new Error('小说不存在');
            }
            if (!canAccessNovelByOwner(localNovel.ownerId, scope)) {
              throw new Error('无权推送该小说');
            }
            await client.pushNovel(item.localId);
            result.success = true;
          } else if (item.action === 'pull' && item.remoteId) {
            const buffer = await client.downloadRemoteNovel(item.remoteId);
            const importResult = await syncImportNovel(buffer, backupManager, novelManager, scope);
            triggerReindex(importResult.novelId, broadcastJson, {
              ...(aiUsageContext ?? {
                scope: 'http',
                operationKey: 'sync.execute',
                operationLabel: 'Sync execute',
                operationRegistered: true,
              }),
              novelId: importResult.novelId,
            });
            result.title = importResult.title;
            result.success = true;
          } else {
            result.error = '缺少必要的 ID 参数';
          }
        } catch (err) {
          result.error = safeErrorMessage(err, '同步操作失败');
        }

        results.push(result);
        broadcastJson?.({ type: 'sync:progress', result });
      }

      broadcastJson?.({ type: 'sync:complete', results });
      res.json({ success: true, results });
    } catch (err) {
      res.status(500).json({ error: '同步执行失败', detail: safeErrorMessage(err, '同步执行失败') });
    }
  });
}
