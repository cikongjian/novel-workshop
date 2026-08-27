import { Router } from 'express';
import type { AuthDb } from '../../auth/types.js';
import type { NovelAgent } from '../../agents/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { ModelClient } from '../../models/types.js';
import { checkNovelAccess } from '../middleware/novel-access.js';

export interface AssistantDeps {
  agents: Map<string, NovelAgent>;
  novelManager: NovelManager;
  novelMemory: NovelMemory;
  modelClient: ModelClient;
  authDb?: AuthDb;
}

export function createAssistantRouter(deps: AssistantDeps): Router {
  const router = Router();
  const { novelManager } = deps;

  async function ensureNovelAccess(
    req: import('express').Request,
    res: import('express').Response,
    novelId: string,
  ): Promise<boolean> {
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return false;
    }
    return true;
  }

  const sendDeprecated = (res: import('express').Response, code: string) => {
    res.status(410).json({
      error: 'Assistant legacy public endpoint has been deprecated.',
      code,
    });
  };

  async function handleDeprecatedAssistantRoute(
    req: import('express').Request,
    res: import('express').Response,
    code: string,
  ): Promise<void> {
    const novelId = typeof req.body?.novelId === 'string' ? req.body.novelId : '';
    if (!novelId) {
      res.status(400).json({ error: 'novelId is required' });
      return;
    }
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, code);
  }

  router.post('/assistant/check', async (req, res) => {
    await handleDeprecatedAssistantRoute(req, res, 'ASSISTANT_CHECK_DEPRECATED');
  });

  router.post('/assistant/complete', async (req, res) => {
    await handleDeprecatedAssistantRoute(req, res, 'ASSISTANT_COMPLETE_DEPRECATED');
  });

  router.post('/assistant/conflict', async (req, res) => {
    await handleDeprecatedAssistantRoute(req, res, 'ASSISTANT_CONFLICT_DEPRECATED');
  });

  return router;
}
