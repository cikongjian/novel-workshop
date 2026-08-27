import { Router } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import { buildDependencyGraph } from '../../novel/chapter-dependency-graph.js';
import { checkNovelAccess } from '../middleware/novel-access.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

async function batchLoadChapters(
  novelManager: NovelManager,
  novelId: string,
  chapterNumbers: number[],
  concurrency = 20,
): Promise<Map<number, any>> {
  const result = new Map<number, any>();
  for (let i = 0; i < chapterNumbers.length; i += concurrency) {
    const batch = chapterNumbers.slice(i, i + concurrency);
    const loaded = await Promise.allSettled(
      batch.map(async (num) => {
        const ch = await novelManager.getChapter(novelId, num);
        return { num, ch };
      }),
    );
    for (const item of loaded) {
      if (item.status === 'fulfilled' && item.value.ch) {
        result.set(item.value.num, item.value.ch);
      }
    }
  }
  return result;
}

export function createAnalyticsRouter(novelManager: NovelManager) {
  const router = Router({ mergeParams: true });

  const sendDeprecated = (res: import('express').Response, code: string) => {
    res.status(410).json({
      error: 'Analytics legacy public endpoint has been deprecated.',
      code,
    });
  };

  async function ensureNovelAccess(
    req: import('express').Request,
    res: import('express').Response,
    novelId: string,
  ): Promise<boolean> {
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return false;
    }
    return true;
  }

  function ensureAdmin(req: import('express').Request, res: import('express').Response): boolean {
    if (req.auth?.role === 'admin') {
      return true;
    }
    res.status(403).json({ error: '需要管理员权限' });
    return false;
  }

  router.get('/overview', async (req, res) => {
    const { novelId } = req.params as Record<string, string>;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_OVERVIEW_DEPRECATED');
  });

  router.get('/quality-trend', async (req, res) => {
    const { novelId } = req.params as Record<string, string>;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_QUALITY_TREND_DEPRECATED');
  });

  router.get('/revision-stats', async (req, res) => {
    const { novelId } = req.params as Record<string, string>;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_REVISION_STATS_DEPRECATED');
  });

  router.get('/plot-threads', async (req, res) => {
    const { novelId } = req.params as Record<string, string>;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_PLOT_THREADS_DEPRECATED');
  });

  router.get('/character-arcs', async (req, res) => {
    const { novelId } = req.params as Record<string, string>;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_CHARACTER_ARCS_DEPRECATED');
  });

  router.get('/outline-deviation', async (req, res) => {
    const { novelId } = req.params as Record<string, string>;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_OUTLINE_DEVIATION_DEPRECATED');
  });

  router.get('/performance', async (req, res) => {
    const { novelId } = req.params as Record<string, string>;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_PERFORMANCE_DEPRECATED');
  });

  router.get('/performance/all', (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    sendDeprecated(res, 'ANALYTICS_PERFORMANCE_ALL_DEPRECATED');
  });

  router.get('/dependency-graph', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      if (!(await ensureNovelAccess(req, res, novelId))) {
        return;
      }

      const chapterMetas = await novelManager.listChapters(novelId);
      const characters = await novelManager.getCharacters(novelId);
      const outline = await novelManager.getOutline(novelId);
      const chapterMap = await batchLoadChapters(
        novelManager,
        novelId,
        chapterMetas.map(c => c.chapterNumber),
      );

      const chapters = [];
      for (const meta of chapterMetas) {
        const full = chapterMap.get(meta.chapterNumber);
        if (!full) {
          continue;
        }
        chapters.push({
          meta: {
            chapterNumber: meta.chapterNumber,
            title: meta.title,
            wordCount: meta.wordCount,
          },
          content: full.content || '',
          events: [],
        });
      }

      const graph = buildDependencyGraph({
        chapters,
        characters,
        plotThreads: outline?.plotThreads ?? [],
        foreshadowing: outline?.foreshadowing ?? [],
      });

      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取依赖图失败') });
    }
  });

  return router;
}
