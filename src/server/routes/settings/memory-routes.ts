import type { Router } from 'express';
import { registerMemoryHealthRoutes } from './memory-health-routes.js';
import { registerMemoryReindexRoutes } from './memory-reindex-routes.js';
import { ensureMemoryAdminAccess, type MemoryRouteDeps } from './memory-support.js';

export function registerMemoryRoutes(
  router: Router,
  broadcastJson?: (frame: Record<string, unknown>) => void,
): void {
  const deps: MemoryRouteDeps = { broadcastJson };

  router.use(ensureMemoryAdminAccess);
  registerMemoryReindexRoutes(router, deps);
  registerMemoryHealthRoutes(router);
}
