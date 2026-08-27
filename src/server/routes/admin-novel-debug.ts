import { Router } from 'express';
import type { BackupManager } from '../../backup/backup-manager.js';
import type { ComplianceEventManager } from '../../compliance/compliance-event-manager.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { requireAdmin } from '../middleware/auth.js';
import { registerAdminNovelDebugReadRoutes } from './handlers/admin-novel-debug/read-routes.js';
import { registerAdminNovelDebugMutationRoutes } from './handlers/admin-novel-debug/mutation-routes.js';
import { registerAdminNovelDebugBackupRoutes } from './handlers/admin-novel-debug/backup-routes.js';
import { registerAdminNovelChapterIntegrityRoutes } from './handlers/admin-novel-debug/chapter-integrity-routes.js';

export type AdminNovelDebugDeps = {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  backupManager?: BackupManager;
  complianceEventManager?: ComplianceEventManager;
};

export function createAdminNovelDebugRouter(deps: AdminNovelDebugDeps): Router {
  const router = Router();
  router.use(requireAdmin());
  registerAdminNovelDebugReadRoutes(router, deps);
  registerAdminNovelDebugMutationRoutes(router, deps);
  registerAdminNovelDebugBackupRoutes(router, deps);
  registerAdminNovelChapterIntegrityRoutes(router, deps);
  return router;
}
