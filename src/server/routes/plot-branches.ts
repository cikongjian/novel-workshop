import { Router } from 'express';
import type { AgentEvent, NovelAgent } from '../../agents/types.js';
import type { AuthDb } from '../../auth/types.js';
import type { ModelClient } from '../../models/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { UniverseManager } from '../../novel/universe-manager.js';
import { registerPlotBranchApplyRoutes } from './handlers/plot-branches/apply-routes.js';
import { registerPlotBranchPreviewRoutes } from './handlers/plot-branches/preview-routes.js';
import { registerPlotBranchTreeRoutes } from './handlers/plot-branches/tree-routes.js';

export function createPlotBranchRouter(
  novelManager: NovelManager,
  modelClient?: ModelClient,
  agents?: Map<string, NovelAgent>,
  broadcast?: (event: AgentEvent) => void,
  authDb?: AuthDb,
  universeManager?: UniverseManager,
): Router {
  const router = Router({ mergeParams: true });
  const deps = { novelManager, modelClient, agents, broadcast, authDb, universeManager };

  registerPlotBranchTreeRoutes(router, deps);
  registerPlotBranchApplyRoutes(router, deps);
  registerPlotBranchPreviewRoutes(router, deps);

  return router;
}
