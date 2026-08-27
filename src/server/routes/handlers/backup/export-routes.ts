import type { Router } from 'express';
import type { BackupManager } from '../../../../backup/backup-manager.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { ensureAdmin, ensureNovelAccess, isValidId } from './route-support.js';

export function registerBackupExportRoutes(
  router: Router,
  backupManager: BackupManager,
  novelManager: NovelManager,
): void {
  router.get('/export-all', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const { buffer, count } = await backupManager.exportAllNovels();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `novel-workshop-all-${count}novels-${timestamp}.tar.gz`;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      console.error('[backup] 批量导出失败:', err);
      res.status(500).json({
        error: safeErrorMessage(err, '批量导出失败'),
      });
    }
  });

  router.get('/export/:novelId', async (req, res) => {
    try {
      if (!isValidId(req.params.novelId)) {
        res.status(400).json({ error: '无效的小说 ID' });
        return;
      }
      if (!(await ensureNovelAccess(req, res, novelManager, req.params.novelId))) {
        return;
      }
      const { buffer, title } = await backupManager.exportNovel(req.params.novelId);
      const safeTitle = title.replace(/[^\w\u4e00-\u9fff-]/g, '_');
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.tar.gz"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      console.error('[backup] 导出小说失败:', { novelId: req.params.novelId, error: err });
      res.status(500).json({
        error: safeErrorMessage(err, '导出失败'),
      });
    }
  });
}
