import { Router } from 'express';
import {
  UniverseBody,
  createUniverseAccessGuards,
  type UniverseRouterDeps,
} from './handlers/universes/route-support.js';
import { registerUniverseSeriesRoutes } from './handlers/universes/series-routes.js';
import { registerUniverseAssociationRoutes } from './handlers/universes/association-routes.js';
import { checkNovelAccess } from '../middleware/novel-access.js';

export function createUniverseRouter(deps: UniverseRouterDeps): Router {
  const { universeManager, novelManager, seriesManager } = deps;
  const router = Router();
  const { ensureNovelAccess, ensureUniverseAccess } = createUniverseAccessGuards({ universeManager, novelManager });

  registerUniverseSeriesRoutes(router, { universeManager, novelManager, seriesManager, ensureNovelAccess });

  router.get('/', async (req, res, next) => {
    try {
      const list = await universeManager.listUniverses();
      if (req.auth?.role === 'admin') {
        res.json(list);
        return;
      }

      const visible = [];
      for (const universe of list) {
        if (universe.ownerId && universe.ownerId === (req.auth?.id ?? 'dev')) {
          visible.push(universe);
          continue;
        }
        let allowed = true;
        for (const novelRef of universe.novels) {
          const access = await checkNovelAccess(req, novelManager, novelRef.novelId);
          if (!access.allowed) {
            allowed = false;
            break;
          }
        }
        if (allowed) visible.push(universe);
      }
      res.json(visible);
    } catch (err) {
      next(err);
    }
  });

  router.get('/novel/:novelId', async (req, res, next) => {
    try {
      const { novelId } = req.params;
      if (!(await ensureNovelAccess(req, res, novelId))) {
        return;
      }
      const universe = await universeManager.findUniverseByNovel(novelId);
      if (!universe) {
        res.status(404).json({ error: '当前小说尚未加入宇宙' });
        return;
      }
      const accessible = await ensureUniverseAccess(req, res, universe.id);
      if (!accessible) return;
      res.json(accessible);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const parsed = UniverseBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      const universe = await universeManager.createUniverse({
        ...parsed.data,
        ownerId: req.auth?.id ?? 'dev',
      });
      res.status(201).json(universe);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:universeId', async (req, res, next) => {
    try {
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      res.json(universe);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:universeId', async (req, res, next) => {
    try {
      const parsed = UniverseBody.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      const updated = await universeManager.updateUniverse(universe.id, parsed.data);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:universeId', async (req, res, next) => {
    try {
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      await universeManager.deleteUniverse(universe.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });
  registerUniverseAssociationRoutes(router, {
    universeManager,
    novelManager,
    ensureNovelAccess,
    ensureUniverseAccess,
  });

  return router;
}
