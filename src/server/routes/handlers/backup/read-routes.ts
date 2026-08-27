import type { Router } from 'express';
import type { BackupManager } from '../../../../backup/backup-manager.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { ensureAdmin, ensureNovelAccess, isValidId } from './route-support.js';

export function registerBackupReadRoutes(
  router: Router,
  backupManager: BackupManager,
  novelManager: NovelManager,
): void {
  router.get('/', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const backups = await backupManager.listBackups();
      res.json(backups);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取备份列表失败') });
    }
  });

  router.get('/novels/:novelId', async (req, res) => {
    try {
      if (!isValidId(req.params.novelId)) {
        res.status(400).json({ error: '无效的小说 ID' });
        return;
      }
      if (!(await ensureNovelAccess(req, res, novelManager, req.params.novelId))) {
        return;
      }
      const backups = await backupManager.listBackups(req.params.novelId);
      res.json(backups);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取备份列表失败') });
    }
  });
}
