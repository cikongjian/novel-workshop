import { Router } from 'express';
import { registerSeriesManagementRoutes } from './handlers/series/management-routes.js';
import {
  createSeriesAccessGuards,
  type SeriesRouterDeps,
} from './handlers/series/route-support.js';
import { registerSeriesStoryStateRoutes } from './handlers/series/story-state-routes.js';

/**
 * 系列作品 & 故事状态 API 路由
 * 前缀: /api/series
 */
export function createSeriesRouter(deps: SeriesRouterDeps): Router {
  const router = Router();
  const { ensureNovelAccess, ensureSeriesAccess } = createSeriesAccessGuards(deps);

  registerSeriesManagementRoutes(router, {
    ensureNovelAccess,
    ensureSeriesAccess,
    seriesManager: deps.seriesManager,
    novelManager: deps.novelManager,
  });
  registerSeriesStoryStateRoutes(router, {
    agents: deps.agents,
    broadcastJson: deps.broadcastJson,
    ensureNovelAccess,
    modelClient: deps.modelClient,
    novelManager: deps.novelManager,
    storyStateManager: deps.storyStateManager,
  });

  return router;
}
