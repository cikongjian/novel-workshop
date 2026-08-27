import type { Router } from 'express';
import { analyzeForeshadowing } from '../../../../pipeline/foreshadowing-tracker.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import type { OutlineDeps } from './route-types.js';
import { buildStoryTaskGraph } from '../../../../novel/story-task-graph.js';
import {
  UpdateOutlineBody,
  UpdateForeshadowingBody,
  backfillOutlineData,
  deduplicatePlotThreads,
} from './route-support.js';

type OutlineReadRouteDeps = Pick<OutlineDeps, 'novelManager'>;

export function registerOutlineReadRoutes(router: Router, { novelManager }: OutlineReadRouteDeps): void {
  router.get('/', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const outline = await novelManager.getOutline(novelId);
      const modified = backfillOutlineData(outline);
      if (modified) {
        await novelManager.saveOutline(novelId, outline).catch(() => {});
      }
      res.json(outline);
    } catch (err) {
      const message = safeErrorMessage(err, '获取大纲失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.get('/task-graph', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const [outline, characters, chapterSummaries] = await Promise.all([
        novelManager.getOutline(novelId),
        novelManager.getCharacters(novelId),
        novelManager.listChapters(novelId),
      ]);
      res.json(buildStoryTaskGraph({ outline, characters, chapterSummaries }));
    } catch (err) {
      const message = safeErrorMessage(err, '获取任务关系网失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.put('/', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = UpdateOutlineBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const current = await novelManager.getOutline(novelId);
      const updated = {
        chapters: parsed.data.chapters ?? current.chapters,
        plotThreads: deduplicatePlotThreads(parsed.data.plotThreads ?? current.plotThreads),
        foreshadowing: parsed.data.foreshadowing ?? current.foreshadowing,
      };

      await novelManager.saveOutline(novelId, updated);
      res.json(updated);
    } catch (err) {
      const message = safeErrorMessage(err, '更新大纲失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.get('/foreshadowing', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const outline = await novelManager.getOutline(novelId);
      res.json(outline.foreshadowing);
    } catch (err) {
      const message = safeErrorMessage(err, '获取伏笔列表失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.get('/foreshadowing-status', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const outline = await novelManager.getOutline(novelId);
      const currentChapter = await novelManager.findLatestChapterNumber(novelId, { preferWritten: true });
      const analysis = analyzeForeshadowing({
        foreshadowing: outline.foreshadowing,
        currentChapter,
      });
      res.json(analysis);
    } catch (err) {
      const message = safeErrorMessage(err, '获取伏笔状态失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.put('/foreshadowing/:id', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const { id } = req.params;
      const parsed = UpdateForeshadowingBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const outline = await novelManager.getOutline(novelId);
      const index = outline.foreshadowing.findIndex((foreshadowing) => foreshadowing.id === id);
      if (index === -1) {
        res.status(404).json({ error: '伏笔不存在' });
        return;
      }

      const updatedForeshadowing = {
        ...outline.foreshadowing[index],
        ...parsed.data,
      };
      outline.foreshadowing[index] = updatedForeshadowing;

      await novelManager.saveOutline(novelId, outline);
      res.json(updatedForeshadowing);
    } catch (err) {
      const message = safeErrorMessage(err, '更新伏笔失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.post('/foreshadowing-batch-resolve', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const outline = await novelManager.getOutline(novelId);
      const currentChapter = await novelManager.findLatestChapterNumber(novelId, { preferWritten: true });

      const body = req.body as { ids?: string[] };
      const idsToResolve = Array.isArray(body.ids) ? new Set(body.ids) : null;

      let resolvedCount = 0;
      const analysis = analyzeForeshadowing({
        foreshadowing: outline.foreshadowing,
        currentChapter,
      });
      const overdueIds = new Set(analysis.overdue.map(item => item.item.id));

      for (const item of outline.foreshadowing) {
        if (item.isResolved) continue;
        const shouldResolve = idsToResolve ? idsToResolve.has(item.id) : overdueIds.has(item.id);
        if (shouldResolve) {
          item.isResolved = true;
          item.resolvedInChapter = item.resolvedInChapter ?? currentChapter;
          if (!item.resolution) item.resolution = '逾期自动回收';
          resolvedCount++;
        }
      }

      if (resolvedCount > 0) {
        await novelManager.saveOutline(novelId, outline);
      }

      res.json({ resolvedCount, total: outline.foreshadowing.length });
    } catch (err) {
      const message = safeErrorMessage(err, '批量回收伏笔失败');
      res.status(500).json({ error: message });
    }
  });
}
