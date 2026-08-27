import type { Router } from 'express';
import { buildComplianceRequestContext } from '../../../../compliance/compliance-event-manager.js';
import {
  NovelDataBackupNotFoundError,
  rollbackNovelData,
} from '../../../../novel/novel-data-rollback.js';
import { createLogger } from '../../../../utils/logger.js';
import type { AdminNovelDebugDeps } from '../../admin-novel-debug.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  firstZodMessage,
  NovelDebugParams,
  NovelRollbackBody,
} from './route-support.js';

const log = createLogger('AdminNovelDebugBackup');

export function registerAdminNovelDebugBackupRoutes(
  router: Router,
  { novelManager, backupManager, complianceEventManager }: AdminNovelDebugDeps,
): void {
  router.get('/novels/:novelId/backups', async (req, res) => {
    const parsed = NovelDebugParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: firstZodMessage(parsed.error) });
      return;
    }
    if (!backupManager) {
      res.status(503).json({ error: '备份服务未配置' });
      return;
    }
    try {
      await novelManager.getNovel(parsed.data.novelId);
      const backups = (await backupManager.listBackups(parsed.data.novelId)).map(backup => ({
        id: backup.id,
        size: backup.size,
        createdAt: backup.createdAt,
      }));
      res.json({ novelId: parsed.data.novelId, backups });
    } catch (error) {
      const message = safeErrorMessage(error, '读取小说备份失败');
      res.status(message.includes('不存在') ? 404 : 500).json({ error: message });
    }
  });

  router.post('/novels/:novelId/rollback', async (req, res) => {
    const parsedParams = NovelDebugParams.safeParse(req.params);
    const parsedBody = NovelRollbackBody.safeParse(req.body);
    if (!parsedParams.success) {
      res.status(400).json({ error: firstZodMessage(parsedParams.error) });
      return;
    }
    if (!parsedBody.success) {
      res.status(400).json({ error: firstZodMessage(parsedBody.error) });
      return;
    }
    if (parsedBody.data.confirmNovelId !== parsedParams.data.novelId) {
      res.status(409).json({ error: '确认的小说 ID 与目标不一致，已拒绝回滚' });
      return;
    }
    if (!backupManager) {
      res.status(503).json({ error: '备份服务未配置' });
      return;
    }

    try {
      const result = await rollbackNovelData({
        novelManager,
        backupManager,
        novelId: parsedParams.data.novelId,
        backupId: parsedBody.data.backupId,
      });
      if (complianceEventManager) {
        await complianceEventManager.record({
          category: 'creator',
          eventType: 'admin_novel_data_rollback',
          status: 'success',
          actorUserId: req.auth?.id ?? null,
          actorUsername: req.auth?.username ?? null,
          actorRole: req.auth?.role ?? null,
          targetType: 'novel',
          targetId: result.novelId,
          targetLabel: result.reportAfter.novel.title,
          request: buildComplianceRequestContext(req),
          detail: {
            restoredBackupId: result.restoredBackup.id,
            safetyBackupId: result.safetyBackup.id,
          },
        }).catch(error => {
          log.warn('小说数据回滚成功，但合规事件记录失败', {
            novelId: result.novelId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      res.json(result);
    } catch (error) {
      if (error instanceof NovelDataBackupNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: safeErrorMessage(error, '回滚小说数据失败') });
    }
  });
}
