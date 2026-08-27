import type { Router, Request, Response } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  auditNovelTitles,
  fixNovelTitles,
  type TitleBatchFixOptions,
} from './title-batch-support.js';

export interface ChapterTitleBatchDeps {
  novelManager: import('../../../../novel/novel-manager.js').NovelManager;
}

/**
 * 注册批量标题修复路由：
 * - POST /audit-titles  审计小说章节标题质量（dry-run，纯算法）
 * - POST /fix-titles    批量修复章节标题（默认 dryRun=true，需显式 dryRun=false 才写入）
 *
 * 与现有 /backfill-titles 互补：后者调用 AI 异步生成；本路由纯算法即时修复。
 */
export function registerTitleBatchRoutes(router: Router, deps: ChapterTitleBatchDeps): void {
  router.post('/audit-titles', async (req: Request, res: Response) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const body = (req.body || {}) as { chapterNumbers?: number[] };
      const { novel, summary } = await auditNovelTitles({
        novelManager: deps.novelManager,
        novelId,
        chapterNumbers: body.chapterNumbers,
      });
      res.json({
        novelId,
        novelTitle: novel?.title ?? null,
        summary,
        reports: summary.reports,
      });
    } catch (err) {
      console.error('[审计标题] 失败:', err);
      res.status(500).json({ error: safeErrorMessage(err, '审计标题失败') });
    }
  });

  router.post('/fix-titles', async (req: Request, res: Response) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const body = (req.body || {}) as {
        chapterNumbers?: number[];
        level?: TitleBatchFixOptions['level'];
        dryRun?: boolean;
        skipEdited?: boolean;
        forceGood?: boolean;
        minGenreMatch?: number;
      };

      // 默认 dryRun=true，强制要求显式 dryRun=false 才会写入
      const dryRun = body.dryRun !== false;

      const options: TitleBatchFixOptions = {
        chapterNumbers: body.chapterNumbers,
        level: body.level ?? 'fix',
        dryRun,
        skipEdited: body.skipEdited !== false,
        forceGood: body.forceGood ?? false,
        minGenreMatch: body.minGenreMatch ?? 0,
      };

      const result = await fixNovelTitles({
        novelManager: deps.novelManager,
        novelId,
        options,
      });

      res.json({
        novelId,
        dryRun,
        applied: result.applied,
        skipped: result.skipped,
        audit: result.audit,
        results: result.results,
        avgQualityScore: result.avgQualityScore,
        avgGenreMatch: result.avgGenreMatch,
        message: dryRun
          ? `预览模式：${result.results.filter(r => r.after !== r.before).length}/${result.results.length} 个章节有可修复标题，未实际写入`
          : `已修复 ${result.applied} 个章节标题，跳过 ${result.skipped} 个`,
      });
    } catch (err) {
      console.error('[批量修复标题] 失败:', err);
      res.status(500).json({ error: safeErrorMessage(err, '批量修复标题失败') });
    }
  });
}
