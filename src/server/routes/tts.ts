/**
 * TTS 路由 — SSE 流式推送
 *
 * GET /api/tts/:novelId/:chapterNumber?rate=... — 流式合成章节音频
 */

import { Router } from 'express';
import type { NovelAgent } from '../../agents/types.js';
import type { ModelClient } from '../../models/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { registerTTSCatalogRoutes } from './handlers/tts/catalog-routes.js';
import { registerTTSDesignRoutes } from './handlers/tts/design-routes.js';
import { registerTTSEngineRoutes } from './handlers/tts/engine-routes.js';
import { createTTSAccessGuards } from './handlers/tts/route-support.js';
import { registerTTSSynthesisRoutes } from './handlers/tts/synthesis-routes.js';

export function createTTSRouter(
  novelManager: NovelManager,
  modelClient?: ModelClient,
  voiceDesignerAgent?: NovelAgent,
): Router {
  const router = Router({ mergeParams: true });
  const { ensureNovelAccess, requireAdminForServerTTS } = createTTSAccessGuards(novelManager);

  registerTTSCatalogRoutes(router, {
    ensureNovelAccess,
    novelManager,
    requireAdminForServerTTS,
  });
  registerTTSEngineRoutes(router, { requireAdminForServerTTS });
  registerTTSSynthesisRoutes(router, {
    ensureNovelAccess,
    novelManager,
    requireAdminForServerTTS,
  });
  registerTTSDesignRoutes(router, {
    ensureNovelAccess,
    modelClient,
    novelManager,
    requireAdminForServerTTS,
    voiceDesignerAgent,
  });

  return router;
}
