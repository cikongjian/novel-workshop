import type { Router } from 'express';
import { registerAdvancedCharacterChatRoutes } from './advanced-character-chat-routes.js';
import { registerAdvancedDeprecatedRoutes } from './advanced-deprecated-routes.js';
import { registerAdvancedDialogueRoutes } from './advanced-dialogue-routes.js';
import { registerAdvancedMarketingRoutes } from './advanced-marketing-routes.js';
import { registerAdvancedPlotRoutes } from './advanced-plot-routes.js';
import { registerAdvancedSuggestionsRoutes } from './advanced-suggestions-routes.js';
export type { AdvancedRouteDeps } from './advanced-route-support.js';

export function registerAdvancedRoutes(
  router: Router,
  deps: import('./advanced-route-support.js').AdvancedRouteDeps,
): void {
  registerAdvancedPlotRoutes(router, deps);
  registerAdvancedCharacterChatRoutes(router, deps);
  registerAdvancedDialogueRoutes(router, deps);
  registerAdvancedDeprecatedRoutes(router);
  registerAdvancedMarketingRoutes(router, deps);
  registerAdvancedSuggestionsRoutes(router, deps);
}
