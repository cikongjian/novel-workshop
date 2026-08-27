import type { Router } from 'express';
import type { UniverseMetadata } from '../../../../novel/universe-types.js';
import type { UniverseRouterDeps, EnsureNovelAccess } from './route-support.js';

type UniverseSeriesRouteDeps = Pick<UniverseRouterDeps, 'universeManager' | 'novelManager' | 'seriesManager'> & {
  ensureNovelAccess: EnsureNovelAccess;
};

export function registerUniverseSeriesRoutes(
  router: Router,
  { universeManager, novelManager, seriesManager, ensureNovelAccess }: UniverseSeriesRouteDeps,
): void {
  router.post('/from-series/:seriesId', async (req, res, next) => {
    try {
      if (!seriesManager) {
        res.status(503).json({ error: '当前环境未启用系列能力' });
        return;
      }

      const series = await seriesManager.getSeries(req.params.seriesId);
      if (!series) {
        res.status(404).json({ error: '系列不存在' });
        return;
      }

      const sortedNovels = [...series.novels].sort((a, b) => a.order - b.order);
      if (sortedNovels.length === 0) {
        res.status(400).json({ error: '当前系列还没有作品，无法同步为宇宙' });
        return;
      }

      for (const novelRef of sortedNovels) {
        if (!(await ensureNovelAccess(req, res, novelRef.novelId))) {
          return;
        }
      }

      const matchedUniverseIds = new Set<string>();
      let targetUniverse: UniverseMetadata | null = null;
      for (const novelRef of sortedNovels) {
        const existingUniverse = await universeManager.findUniverseByNovel(novelRef.novelId);
        if (!existingUniverse) continue;
        matchedUniverseIds.add(existingUniverse.id);
        targetUniverse = existingUniverse;
      }

      if (matchedUniverseIds.size > 1) {
        res.status(409).json({ error: '该系列内的作品已分属多个宇宙，无法自动同步，请先人工整理' });
        return;
      }

      const mode = targetUniverse ? 'updated' : 'created';
      if (!targetUniverse) {
        targetUniverse = await universeManager.createUniverse({
          title: series.title,
          description: series.description,
          corePremise: series.blueprint.overarchingTheme,
          sharedWorldRules: series.blueprint.sharedWorldRules,
          timelineBaseline: series.blueprint.timelineOverview,
          ownerId: req.auth?.id ?? 'dev',
        });
      } else {
        const metadataUpdates: Record<string, string> = {};
        if (!targetUniverse.title.trim()) metadataUpdates.title = series.title;
        if (!targetUniverse.description.trim() && series.description.trim()) metadataUpdates.description = series.description;
        if (!targetUniverse.corePremise.trim() && series.blueprint.overarchingTheme.trim()) {
          metadataUpdates.corePremise = series.blueprint.overarchingTheme;
        }
        if (!targetUniverse.sharedWorldRules.trim() && series.blueprint.sharedWorldRules.trim()) {
          metadataUpdates.sharedWorldRules = series.blueprint.sharedWorldRules;
        }
        if (!targetUniverse.timelineBaseline.trim() && series.blueprint.timelineOverview.trim()) {
          metadataUpdates.timelineBaseline = series.blueprint.timelineOverview;
        }
        if (Object.keys(metadataUpdates).length > 0) {
          targetUniverse = await universeManager.updateUniverse(targetUniverse.id, metadataUpdates) ?? targetUniverse;
        }
      }

      for (const novelRef of sortedNovels) {
        const novel = await novelManager.getNovel(novelRef.novelId);
        const existingRef: UniverseMetadata['novels'][number] | undefined = targetUniverse.novels.find(
          item => item.novelId === novelRef.novelId,
        );
        targetUniverse = await universeManager.addNovel(targetUniverse.id, {
          novelId: novelRef.novelId,
          title: novel.title,
          genre: novel.genre,
          status: novel.status,
          notes: existingRef?.notes || `系列第 ${novelRef.order} 部`,
        }) ?? targetUniverse;
      }

      for (let index = 0; index < sortedNovels.length - 1; index += 1) {
        const fromNovel = sortedNovels[index];
        const toNovel = sortedNovels[index + 1];
        const exists = targetUniverse.relations.some(relation => (
          relation.fromNovelId === fromNovel.novelId
          && relation.toNovelId === toNovel.novelId
          && relation.type === 'mainline-next'
        ));
        if (exists) continue;

        targetUniverse = await universeManager.addRelation(targetUniverse.id, {
          fromNovelId: fromNovel.novelId,
          toNovelId: toNovel.novelId,
          type: 'mainline-next',
          timelineSpan: toNovel.timelineSpan,
          inheritWorld: true,
          inheritCharacters: true,
          inheritForeshadowing: true,
          notes: `由系列《${series.title}》同步的主线顺序`,
        }) ?? targetUniverse;
      }

      res.json({
        mode,
        universe: targetUniverse,
      });
    } catch (err) {
      next(err);
    }
  });
}
