import type { BackupInfo } from '../backup/backup-manager.js';
import type { NovelManager } from './novel-manager.js';
import { auditNovelData, type NovelDataAuditReport } from './novel-data-audit.js';
import { withNovelMaintenanceLock } from './novel-maintenance-lock.js';

type BackupRestorer = {
  listBackups(novelId?: string): Promise<BackupInfo[]>;
  createBackup(novelId: string): Promise<BackupInfo>;
  restoreBackup(novelId: string, backupId: string): Promise<void>;
};

export type NovelDataRollbackResult = {
  novelId: string;
  restoredBackup: Pick<BackupInfo, 'id' | 'size' | 'createdAt'>;
  safetyBackup: Pick<BackupInfo, 'id' | 'size' | 'createdAt'>;
  reportAfter: NovelDataAuditReport;
};

export class NovelDataBackupNotFoundError extends Error {
  constructor(backupId: string) {
    super(`指定备份不存在：${backupId}`);
    this.name = 'NovelDataBackupNotFoundError';
  }
}

function slimBackup(backup: BackupInfo): Pick<BackupInfo, 'id' | 'size' | 'createdAt'> {
  return { id: backup.id, size: backup.size, createdAt: backup.createdAt };
}

export async function rollbackNovelData(params: {
  novelManager: NovelManager;
  backupManager: BackupRestorer;
  novelId: string;
  backupId: string;
}): Promise<NovelDataRollbackResult> {
  return withNovelMaintenanceLock(params.novelId, async () => {
    const backups = await params.backupManager.listBackups(params.novelId);
    const target = backups.find(backup => backup.id === params.backupId);
    if (!target) throw new NovelDataBackupNotFoundError(params.backupId);

    const safetyBackup = await params.backupManager.createBackup(params.novelId);
    await params.backupManager.restoreBackup(params.novelId, params.backupId);
    params.novelManager.invalidateChapterIndex(params.novelId);

    return {
      novelId: params.novelId,
      restoredBackup: slimBackup(target),
      safetyBackup: slimBackup(safetyBackup),
      reportAfter: await auditNovelData(params.novelManager, params.novelId),
    };
  });
}
