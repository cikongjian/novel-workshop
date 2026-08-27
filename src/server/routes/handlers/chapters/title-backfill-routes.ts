import type { Router } from 'express';
import { DEFAULT_TITLE_REWRITE_SCORE } from '../../../../agents/title-audit.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  backfillChapterTitles,
  buildBackfillEmptyResponse,
  collectBackfillTitleTargets,
  resolveTitleRewriteThreshold,
  type ChapterTitleDeps,
} from './title-route-support.js';

export function registerBatchTitleRoutes(router: Router, deps: ChapterTitleDeps): void {
  router.post('/backfill-titles', async (req, res) => {
    const { authDb, modelClient, novelManager } = deps;
    if (!deps.agents) {
      res.status(503).json({ error: 'AI Agent 尚未就绪' });
      return;
    }

    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const body = (req.body || {}) as {
        force?: boolean;
        fromChapter?: number;
        toChapter?: number;
        rewriteBelowScore?: number;
      };
      const { force = false, fromChapter, toChapter } = body;
      const rewriteBelowScore = resolveTitleRewriteThreshold(body.rewriteBelowScore);

      const novel = await novelManager.getNovel(novelId);
      const chapterList = await novelManager.listChapters(novelId);
      const targetAudits = await collectBackfillTitleTargets({
        novelManager,
        novelId,
        novel,
        chapterList,
        force,
        fromChapter,
        toChapter,
        rewriteBelowScore,
      });
      const targetChapterNumbers = targetAudits.map(item => item.chapterNumber);

      if (targetChapterNumbers.length === 0) {
        res.json(buildBackfillEmptyResponse({ rewriteBelowScore }));
        return;
      }

      let activeModelClient = modelClient;
      if (authDb) {
        const novel = await novelManager.getNovel(novelId);
        if (novel) {
          const modelAccess = await resolveUserModelAccess({
            authDb,
            userId: req.auth?.id,
            headers: req.headers,
            novel,
          });
          activeModelClient = modelAccess.client ?? modelClient;
        }
      }
      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 模型未配置，请先配置 API Key' });
        return;
      }

      const resolvedDeps: ChapterTitleDeps = { ...deps, modelClient: activeModelClient };
      const { updated, results } = await backfillChapterTitles({
        deps: resolvedDeps,
        novelId,
        novel,
        targetChapterNumbers,
      });

      res.json({
        updated,
        total: targetChapterNumbers.length,
        threshold: rewriteBelowScore ?? DEFAULT_TITLE_REWRITE_SCORE,
        audited: targetAudits,
        results,
        message: `已为 ${updated}/${targetChapterNumbers.length} 个章节生成标题`,
      });
    } catch (err) {
      console.error('[批量补全标题] 失败:', err);
      res.status(500).json({
        error: safeErrorMessage(err, '批量补全标题失败'),
      });
    }
  });
}
