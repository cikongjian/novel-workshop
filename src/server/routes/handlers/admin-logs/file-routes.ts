import type { Router } from 'express';
import {
  GetLogFilesSchema,
  getLogFiles,
  isFileLoggingEnabled,
  logger,
} from './log-support.js';

export function registerAdminLogFileRoutes(router: Router): void {
  router.get('/files', async (req, res) => {
    try {
      const query = GetLogFilesSchema.safeParse(req.query);
      if (!query.success) {
        res.status(400).json({ error: query.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      const files = await getLogFiles();
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const limitedFiles = query.data.limit ? files.slice(0, query.data.limit) : files;

      res.json({
        files: limitedFiles.map(file => ({
          name: file.name,
          size: file.size,
          mtime: file.mtime,
        })),
        totalSize,
        count: files.length,
        persistenceEnabled: isFileLoggingEnabled(),
      });
    } catch (err) {
      logger.error('获取日志文件列表失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取日志文件列表失败' });
    }
  });
}
