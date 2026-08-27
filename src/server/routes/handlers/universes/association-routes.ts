import type { Router } from 'express';
import {
  CreateRelatedWorkBody,
  UniverseNovelBody,
  UniverseRelationBody,
  UniverseRelationUpdateBody,
  type EnsureNovelAccess,
  type EnsureUniverseAccess,
  type UniverseRouterDeps,
} from './route-support.js';

type UniverseAssociationRouteDeps = Pick<UniverseRouterDeps, 'universeManager' | 'novelManager'> & {
  ensureNovelAccess: EnsureNovelAccess;
  ensureUniverseAccess: EnsureUniverseAccess;
};

export function registerUniverseAssociationRoutes(
  router: Router,
  { universeManager, novelManager, ensureNovelAccess, ensureUniverseAccess }: UniverseAssociationRouteDeps,
): void {
  router.post('/:universeId/novels', async (req, res, next) => {
    try {
      const parsed = UniverseNovelBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      if (!(await ensureNovelAccess(req, res, parsed.data.novelId))) {
        return;
      }

      const existingUniverse = await universeManager.findUniverseByNovel(parsed.data.novelId);
      if (existingUniverse && existingUniverse.id !== universe.id) {
        res.status(409).json({ error: `该小说已加入宇宙《${existingUniverse.title}》` });
        return;
      }

      const novel = await novelManager.getNovel(parsed.data.novelId);
      const updated = await universeManager.addNovel(universe.id, {
        novelId: parsed.data.novelId,
        title: novel.title,
        genre: novel.genre,
        status: novel.status,
        notes: parsed.data.notes ?? '',
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:universeId/novels/:novelId', async (req, res, next) => {
    try {
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      const updated = await universeManager.removeNovel(universe.id, req.params.novelId);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:universeId/relations', async (req, res, next) => {
    try {
      const parsed = UniverseRelationBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      const updated = await universeManager.addRelation(universe.id, parsed.data);
      if (!updated) {
        res.status(400).json({ error: '作品关系创建失败，请确认两部作品都属于当前宇宙' });
        return;
      }
      res.status(201).json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:universeId/relations/:relationId', async (req, res, next) => {
    try {
      const parsed = UniverseRelationUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      const updated = await universeManager.updateRelation(universe.id, req.params.relationId, parsed.data);
      if (!updated) {
        res.status(404).json({ error: '作品关系不存在' });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:universeId/relations/:relationId', async (req, res, next) => {
    try {
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      const updated = await universeManager.removeRelation(universe.id, req.params.relationId);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:universeId/works', async (req, res, next) => {
    try {
      const parsed = CreateRelatedWorkBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      const universe = await ensureUniverseAccess(req, res, req.params.universeId);
      if (!universe) return;
      if (!(await ensureNovelAccess(req, res, parsed.data.sourceNovelId))) {
        return;
      }
      if (!universe.novels.some(novel => novel.novelId === parsed.data.sourceNovelId)) {
        res.status(400).json({ error: '来源作品不在当前宇宙中' });
        return;
      }

      const createdNovel = await novelManager.createNovel({
        title: parsed.data.title,
        genre: parsed.data.genre,
        synopsis: parsed.data.synopsis,
        description: parsed.data.description,
        constitutionTags: parsed.data.constitutionTags,
        ownerId: req.auth?.id ?? 'dev',
      });

      let updated = await universeManager.addNovel(universe.id, {
        novelId: createdNovel.id,
        title: createdNovel.title,
        genre: createdNovel.genre,
        status: createdNovel.status,
        notes: '',
      });

      if (!updated) {
        res.status(500).json({ error: '创建关联作品后，加入宇宙失败' });
        return;
      }

      updated = await universeManager.addRelation(universe.id, {
        fromNovelId: parsed.data.sourceNovelId,
        toNovelId: createdNovel.id,
        type: parsed.data.relationType,
        anchorChapterNumber: parsed.data.anchorChapterNumber,
        timelineSpan: parsed.data.timelineSpan,
        spoilerCeiling: parsed.data.spoilerCeiling,
        inheritWorld: parsed.data.inheritWorld,
        inheritCharacters: parsed.data.inheritCharacters,
        inheritForeshadowing: parsed.data.inheritForeshadowing,
        notes: parsed.data.relationNotes,
      });

      if (!updated) {
        res.status(500).json({ error: '创建关联作品后，作品关系写入失败' });
        return;
      }

      res.status(201).json({
        universe: updated,
        novel: createdNovel,
      });
    } catch (err) {
      next(err);
    }
  });
}
