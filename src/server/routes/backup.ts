/**
 * 备份管理 API 路由
 */

import { Router } from 'express';
import type { BackupManager } from '../../backup/backup-manager.js';
import type { StorageCleanupScheduler } from '../../backup/storage-cleanup.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { registerBackupCleanupRoutes } from './handlers/backup/cleanup-routes.js';
import { registerBackupExportRoutes } from './handlers/backup/export-routes.js';
import { registerBackupMutationRoutes } from './handlers/backup/mutation-routes.js';
import { registerBackupReadRoutes } from './handlers/backup/read-routes.js';

export function createBackupRouter(
  backupManager: BackupManager,
  novelManager: NovelManager,
  _storageCleanup?: StorageCleanupScheduler,
): Router {
  const router = Router();

  registerBackupReadRoutes(router, backupManager, novelManager);
  registerBackupMutationRoutes(router, backupManager, novelManager);
  registerBackupExportRoutes(router, backupManager, novelManager);
  registerBackupCleanupRoutes(router);

  return router;
}
