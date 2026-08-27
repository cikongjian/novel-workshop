import type { Router } from 'express';
import type { BackupManager } from '../../../../backup/backup-manager.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { ensureNovelAccess, isValidId, MAX_IMPORT_SIZE } from './route-support.js';

export function registerBackupMutationRoutes(
  router: Router,
  backupManager: BackupManager,
  novelManager: NovelManager,
): void {
  router.post('/novels/:novelId', async (req, res) => {
    try {
      if (!isValidId(req.params.novelId)) {
        res.status(400).json({ error: '无效的小说 ID' });
        return;
      }
      if (!(await ensureNovelAccess(req, res, novelManager, req.params.novelId))) {
        return;
      }
      const info = await backupManager.createBackup(req.params.novelId);
      res.status(201).json(info);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '创建备份失败') });
    }
  });

  router.post('/novels/:novelId/:backupId/restore', async (req, res) => {
    try {
      if (!isValidId(req.params.novelId) || !isValidId(req.params.backupId)) {
        res.status(400).json({ error: '无效的 ID 参数' });
        return;
      }
      if (!(await ensureNovelAccess(req, res, novelManager, req.params.novelId))) {
        return;
      }
      await backupManager.restoreBackup(req.params.novelId, req.params.backupId);
      res.json({ success: true, message: '备份恢复成功' });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '恢复备份失败') });
    }
  });

  router.delete('/novels/:novelId/:backupId', async (req, res) => {
    try {
      if (!isValidId(req.params.novelId) || !isValidId(req.params.backupId)) {
        res.status(400).json({ error: '无效的 ID 参数' });
        return;
      }
      if (!(await ensureNovelAccess(req, res, novelManager, req.params.novelId))) {
        return;
      }
      await backupManager.deleteBackup(req.params.novelId, req.params.backupId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '删除备份失败') });
    }
  });

  router.post('/import', async (req, res) => {
    try {
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.includes('application/gzip') && !contentType.includes('application/octet-stream')) {
        res.status(400).json({ error: '请以 application/gzip 或 application/octet-stream 格式上传 tar.gz 文件' });
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of req) {
        totalSize += (chunk as Buffer).length;
        if (totalSize > MAX_IMPORT_SIZE) {
          res.status(413).json({ error: '文件过大，最大支持 100MB' });
          return;
        }
        chunks.push(chunk as Buffer);
      }

      if (chunks.length === 0) {
        res.status(400).json({ error: '未收到文件数据' });
        return;
      }

      const data = Buffer.concat(chunks);
      const results = await backupManager.importAllNovels(data);
      if (results.length === 1) {
        res.status(201).json({
          success: true,
          message: `小说「${results[0].title}」导入成功`,
          novelId: results[0].novelId,
          title: results[0].title,
        });
        return;
      }
      const titles = results.map((item) => `「${item.title}」`).join('、');
      res.status(201).json({
        success: true,
        message: `${results.length} 本小说导入成功：${titles}`,
        novels: results,
      });
    } catch (err) {
      console.error('[backup] 导入失败:', err);
      res.status(500).json({
        error: safeErrorMessage(err, '导入失败'),
      });
    }
  });
}
