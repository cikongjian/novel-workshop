import type { Router } from 'express';
import { ensureAdmin, sendStorageCleanupDeprecated } from './route-support.js';

export function registerBackupCleanupRoutes(router: Router): void {
  router.get('/storage-cleanup/preview', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    sendStorageCleanupDeprecated(res, 'nw backup storage-cleanup');
  });

  router.post('/storage-cleanup/run', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    sendStorageCleanupDeprecated(res, 'nw backup storage-cleanup --apply');
  });
}
