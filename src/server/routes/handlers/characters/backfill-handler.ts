import type { Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { registerBackfillPositionRoutes } from './backfill-position-routes.js';
import { registerBackfillTtsRoutes } from './backfill-tts-routes.js';

export function registerBackfillHandlers(
  router: Router,
  novelManager: NovelManager,
  modelClient?: ModelClient,
  novelMemory?: NovelMemory,
  authDb?: AuthDb,
): void {
  const deps = {
    novelManager,
    modelClient,
    novelMemory,
    authDb,
  };
  registerBackfillTtsRoutes(router, deps);
  registerBackfillPositionRoutes(router, deps);
}
