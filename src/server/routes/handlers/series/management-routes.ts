import type { Router } from 'express';
import type { SeriesManager } from '../../../../novel/series-manager.js';
import {
  filterVisibleSeries,
  getCurrentUserId,
  type EnsureNovelAccess,
  type EnsureSeriesAccess,
  type SeriesRouterDeps,
} from './route-support.js';

type SeriesManagementRouteDeps = {
  ensureNovelAccess: EnsureNovelAccess;
  ensureSeriesAccess: EnsureSeriesAccess;
  seriesManager: SeriesManager;
  novelManager?: SeriesRouterDeps['novelManager'];
};

export function registerSeriesManagementRoutes(
  router: Router,
  { ensureNovelAccess, ensureSeriesAccess, seriesManager, novelManager }: SeriesManagementRouteDeps,
): void {
  router.get('/', async (req, res, next) => {
    try {
      const list = await seriesManager.listSeries();
      const visible = await filterVisibleSeries(req, { novelManager }, list);
      res.json(visible);
    } catch (err) { next(err); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { title, description, genre, masterPlan } = req.body;
      if (!title) { res.status(400).json({ error: 'title 必填' }); return; }
      const series = await seriesManager.createSeries({
        title,
        description,
        genre,
        masterPlan,
        ownerId: getCurrentUserId(req),
      });
      res.status(201).json(series);
    } catch (err) { next(err); }
  });

  router.get('/:seriesId', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId);
      if (!series) { return; }
      res.json(series);
    } catch (err) { next(err); }
  });

  router.put('/:seriesId', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId);
      if (!series) { return; }
      const { title, description, genre, masterPlan, blueprint } = req.body;
      const updated = await seriesManager.updateSeries(req.params.seriesId, {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(genre !== undefined && { genre }),
        ...(masterPlan !== undefined && { masterPlan }),
        ...(blueprint !== undefined && { blueprint }),
      });
      if (!updated) { res.status(404).json({ error: '系列不存在' }); return; }
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete('/:seriesId', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId);
      if (!series) { return; }
      const ok = await seriesManager.deleteSeries(req.params.seriesId);
      if (!ok) { res.status(404).json({ error: '系列不存在' }); return; }
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.post('/:seriesId/novels', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId);
      if (!series) { return; }
      const { novelId, title, timelineSpan, status } = req.body;
      if (!novelId || !title) { res.status(400).json({ error: 'novelId 和 title 必填' }); return; }
      if (!(await ensureNovelAccess(req, res, novelId))) {
        return;
      }
      const existingSeries = await seriesManager.findSeriesByNovel(novelId);
      if (existingSeries && existingSeries.id !== req.params.seriesId) {
        res.status(409).json({ error: `小说已加入系列《${existingSeries.title}》，请先移除后再加入新系列` });
        return;
      }
      const updated = await seriesManager.addNovel(req.params.seriesId, {
        novelId,
        title,
        timelineSpan: timelineSpan ?? '',
        legacy: [],
        status: status ?? 'planning',
      });
      if (!updated) { res.status(404).json({ error: '系列不存在' }); return; }
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.put('/:seriesId/novels/:novelId', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId);
      if (!series) { return; }
      const updated = await seriesManager.updateNovelRef(req.params.seriesId, req.params.novelId, {
        title: req.body.title,
        timelineSpan: req.body.timelineSpan,
        legacy: req.body.legacy,
        status: req.body.status,
        order: req.body.order,
      });
      if (!updated) { res.status(404).json({ error: '系列或小说不存在' }); return; }
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.delete('/:seriesId/novels/:novelId', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId);
      if (!series) { return; }
      const updated = await seriesManager.removeNovel(req.params.seriesId, req.params.novelId);
      if (!updated) { res.status(404).json({ error: '系列不存在' }); return; }
      res.json(updated);
    } catch (err) { next(err); }
  });

  router.put('/:seriesId/legacy', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId);
      if (!series) { return; }
      void req;
      void series;
      res.status(410).json({
        error: '系列 legacy 更新入口已废弃，请改用系列蓝图和小说元信息接口维护跨书状态',
      });
    } catch (err) { next(err); }
  });

  router.get('/:seriesId/blueprint', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId as string);
      if (!series) { return; }
      res.json(series.blueprint);
    } catch (err) { next(err); }
  });

  router.put('/:seriesId/blueprint', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId as string);
      if (!series) { return; }
      // blueprint 只接受对象类型，防止传入非对象值
      const blueprint = req.body;
      if (!blueprint || typeof blueprint !== 'object' || Array.isArray(blueprint)) {
        res.status(400).json({ error: 'blueprint 必须是对象' });
        return;
      }
      const updated = await seriesManager.updateSeries(req.params.seriesId as string, { blueprint });
      if (!updated) { res.status(404).json({ error: '系列不存在' }); return; }
      res.json(updated.blueprint);
    } catch (err) { next(err); }
  });

  router.put('/:seriesId/blueprint/books/:bookOrder', async (req, res, next) => {
    try {
      const series = await ensureSeriesAccess(req, res, req.params.seriesId as string);
      if (!series) { return; }
      void req;
      void series;
      res.status(410).json({
        error: '单书蓝图局部更新入口已废弃，请改用整系列蓝图更新接口',
        code: 'SERIES_BLUEPRINT_BOOK_PATCH_DEPRECATED',
      });
    } catch (err) { next(err); }
  });
}
