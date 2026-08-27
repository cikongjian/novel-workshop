import type { Router } from 'express';
import type { AuthDb } from '../../../auth/types.js';
import type { NovelManager } from '../../../novel/novel-manager.js';
import { registerGeneralSettingsReadWriteRoutes } from './general-read-write-routes.js';
import { registerGeneralSettingsTestRoutes } from './general-test-routes.js';

export function registerGeneralSettingsRoutes(
  router: Router,
  onSettingsChanged?: () => void,
  authDb?: AuthDb,
  novelManager?: NovelManager,
): void {
  const deps = { onSettingsChanged, authDb, novelManager };

  registerGeneralSettingsReadWriteRoutes(router, deps);
  registerGeneralSettingsTestRoutes(router, deps);
}
