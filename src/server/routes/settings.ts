import { Router } from 'express';
import { registerGeneralSettingsRoutes } from './settings/general-routes.js';
import { registerMemoryRoutes } from './settings/memory-routes.js';
import { registerPortraitDictionaryRoutes } from './settings/portrait-dictionary-routes.js';
import { registerRealNameProviderRoutes } from './settings/real-name-provider-routes.js';
import { registerTtsServiceRoutes } from './settings/tts-routes.js';
import type { AuthDb } from '../../auth/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';

type SettingsRouterDeps = {
  broadcastJson?: (frame: Record<string, unknown>) => void;
  onSettingsChanged?: () => void;
  authDb?: AuthDb;
  novelManager?: NovelManager;
};

export function createSettingsRouter(deps?: SettingsRouterDeps): Router {
  const router = Router();

  registerGeneralSettingsRoutes(router, deps?.onSettingsChanged, deps?.authDb, deps?.novelManager);
  registerRealNameProviderRoutes(router);
  registerPortraitDictionaryRoutes(router);
  registerMemoryRoutes(router, deps?.broadcastJson);
  registerTtsServiceRoutes(router);
  return router;
}
