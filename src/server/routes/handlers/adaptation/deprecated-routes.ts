import type { Router } from 'express';
import {
  ensureAdmin,
  ensureNovelAccess,
  sendDeprecated,
  sendSmokeDeprecated,
  type ResolvedAdaptationRouteDeps,
} from './route-support.js';

export function registerAdaptationDeprecatedRoutes(
  router: Router,
  deps: Pick<ResolvedAdaptationRouteDeps, 'novelManager'>,
): void {
  router.post('/scene-cards/rebuild', async (req, res) => {
    const novelId = await ensureNovelAccess(req, res, deps.novelManager);
    if (!novelId) {
      return;
    }
    sendDeprecated(
      res,
      'ADAPTATION_SCENE_CARDS_REBUILD_DEPRECATED',
      'Scene-card rebuild over HTTP has been deprecated.',
    );
  });

  router.get('/scene-cards/:chapterNumber', async (req, res) => {
    const novelId = await ensureNovelAccess(req, res, deps.novelManager);
    if (!novelId) {
      return;
    }
    sendDeprecated(
      res,
      'ADAPTATION_SCENE_CARDS_READ_DEPRECATED',
      'Scene-card retrieval over HTTP has been deprecated.',
    );
  });

  router.get('/metrics', async (req, res) => {
    const novelId = await ensureNovelAccess(req, res, deps.novelManager);
    if (!novelId) {
      return;
    }
    sendDeprecated(
      res,
      'ADAPTATION_METRICS_DEPRECATED',
      'Adaptation metrics over HTTP has been deprecated.',
    );
  });

  router.post('/smoke/run', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    sendSmokeDeprecated(res, 'ADAPTATION_SMOKE_RUN_DEPRECATED', 'nw adaptation smoke');
  });

  router.post('/smoke/report', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    sendSmokeDeprecated(res, 'ADAPTATION_SMOKE_REPORT_DEPRECATED', 'nw adaptation smoke-report');
  });

  router.post('/smoke/clean', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    sendSmokeDeprecated(res, 'ADAPTATION_SMOKE_CLEAN_DEPRECATED', 'nw adaptation smoke-clean');
  });

  router.post('/smoke/read', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    sendSmokeDeprecated(res, 'ADAPTATION_SMOKE_READ_DEPRECATED', 'nw adaptation smoke-report');
  });
}
