import { Router } from 'express';
import type { AuthDb } from '../../auth/types.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { ModelClient } from '../../models/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { checkNovelAccess } from '../middleware/novel-access.js';
import { registerCastSessionConfirmRoutes } from './handlers/cast-session/confirm-routes.js';
import { registerCastSessionProposeRoutes } from './handlers/cast-session/propose-routes.js';

export function createCastSessionRouter(
  novelManager: NovelManager,
  modelClient?: ModelClient,
  novelMemory?: NovelMemory,
  authDb?: AuthDb,
): Router {
  const router = Router({ mergeParams: true });

  async function ensureNovelAccess(
    req: import('express').Request,
    res: import('express').Response,
  ): Promise<string | null> {
    const novelId = (req.params as Record<string, string>).novelId;
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return null;
    }
    return novelId;
  }

  registerCastSessionProposeRoutes(router, {
    authDb,
    ensureNovelAccess,
    modelClient,
    novelManager,
  });
  registerCastSessionConfirmRoutes(router, {
    ensureNovelAccess,
    novelManager,
    novelMemory,
  });

  return router;
}
