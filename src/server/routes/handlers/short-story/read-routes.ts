import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  listShortStoryTemplates,
  loadAccessibleShortStoryNovel,
  logger,
  normalizeBlueprint,
  type ShortStoryRouterDeps,
} from './route-support.js';

export function registerShortStoryReadRoutes(
  router: Router,
  deps: ShortStoryRouterDeps,
): void {
  router.get('/', async (req, res) => {
    try {
      const userId = req.auth?.id ?? 'dev';
      const novels = await deps.novelManager.listNovelSummaries();
      const items = novels
        .filter((novel) => (novel.ownerId ?? 'dev') === userId || req.auth?.role === 'admin')
        .filter((novel) => Boolean(novel.shortStoryBlueprint))
        .map((novel) => {
          const blueprint = normalizeBlueprint(novel.shortStoryBlueprint);
          return {
            id: novel.id,
            title: novel.title,
            status: novel.status,
            template: blueprint.template ?? 'custom',
            targetWordCount: blueprint.targetWordCount ?? 25_000,
            targetChapters: blueprint.targetChapters ?? 18,
            chapterCount: novel.chapterCount ?? 0,
            wordCount: novel.wordCount ?? 0,
            updatedAt: novel.updatedAt,
          };
        });

      res.json({ success: true, items });
    } catch (error) {
      logger.error('获取短篇列表失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: safeErrorMessage(error, '获取短篇列表失败'),
      });
    }
  });

  router.get('/:novelId/blueprint', async (req, res) => {
    try {
      const novelId = String(req.params.novelId);
      const novel = await loadAccessibleShortStoryNovel(req, res, deps, novelId);
      if (!novel) return;
      if (!novel.shortStoryBlueprint) {
        res.status(400).json({ error: '该小说不是短篇模式' });
        return;
      }

      res.json({
        success: true,
        blueprint: novel.shortStoryBlueprint,
      });
    } catch (error) {
      logger.error('获取短篇蓝图失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: safeErrorMessage(error, '获取失败'),
      });
    }
  });

  router.get('/:novelId/progress', async (req, res) => {
    try {
      const novelId = String(req.params.novelId);
      const novel = await loadAccessibleShortStoryNovel(req, res, deps, novelId);
      if (!novel) return;
      if (!novel.shortStoryBlueprint) {
        res.status(400).json({ error: '该小说不是短篇模式' });
        return;
      }

      const blueprint = normalizeBlueprint(novel.shortStoryBlueprint);
      const chapters = await deps.novelManager.listChapters(novelId);
      const currentChapter = chapters.length;
      const currentWordCount = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
      const paidChapters = chapters.filter((_, idx) => (
        blueprint.paywall.enabled && idx + 1 > (blueprint.paywall.freeChapters || 0)
      )).length;

      res.json({
        success: true,
        progress: {
          currentChapter,
          totalChapters: blueprint.targetChapters,
          currentWordCount,
          targetWordCount: blueprint.targetWordCount,
          estimatedCompletion: Math.min(100, (currentWordCount / blueprint.targetWordCount) * 100),
          paidChapters,
          freeChapters: currentChapter - paidChapters,
        },
      });
    } catch (error) {
      logger.error('获取短篇进度失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: safeErrorMessage(error, '获取失败'),
      });
    }
  });

  router.get('/templates', async (_req, res) => {
    try {
      res.json({
        success: true,
        templates: listShortStoryTemplates(),
      });
    } catch (error) {
      logger.error('获取模板列表失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: safeErrorMessage(error, '获取失败'),
      });
    }
  });

  router.get('/templates/:template', async (req, res) => {
    try {
      void req;
      res.status(410).json({
        error: '单模板详情接口已下线，请改用当前模板列表接口。',
        code: 'SHORT_STORY_TEMPLATE_DETAIL_DEPRECATED',
      });
    } catch (error) {
      logger.error('获取模板详情失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: safeErrorMessage(error, '获取失败'),
      });
    }
  });
}
