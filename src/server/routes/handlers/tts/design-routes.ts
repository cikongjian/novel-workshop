import type { Router } from 'express';
import { registerTTSBatchDesignRoutes } from './batch-design-routes.js';
import { registerTTSCharacterDesignRoutes } from './character-design-routes.js';
export type { TTSDesignRouteDeps } from './design-route-support.js';

export function registerTTSDesignRoutes(
  router: Router,
  deps: import('./design-route-support.js').TTSDesignRouteDeps,
): void {
  registerTTSCharacterDesignRoutes(router, deps);
  registerTTSBatchDesignRoutes(router, deps);
}
