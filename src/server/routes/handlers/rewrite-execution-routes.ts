import type { Router } from 'express';
import { BatchRewriteBody, RewriteChapterBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { confirmRewriteChapter, previewRewriteChapter } from './rewrite-route-support.js';

export function registerRewriteExecutionRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, authDb } = deps;

  router.post('/rewrite-chapter', async (req, res) => {
    try {
      const parsed = RewriteChapterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { novelId, chapterNumber, userDirection, maxWordCount, stylePreset, styleNotes } = parsed.data;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter || !chapter.content.trim()) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在或内容为空` });
        return;
      }

      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }

      const preview = await previewRewriteChapter(deps, {
        novelId,
        chapterNumber,
        chapterContent: chapter.content,
        userDirection,
        maxWordCount,
        stylePreset,
        styleNotes,
        modelOverride: modelAccess.client,
      });

      await confirmRewriteChapter(deps, {
        novelId,
        chapterNumber,
        result: preview.result,
      });

      res.json({
        status: 'ok',
        chapterNumber,
        usedDefaultDirection: preview.usedDefaultDirection,
        wordCount: preview.chapterContent.length,
        similarity: preview.similarity,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '重写章节失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/rewrite-batch', async (req, res) => {
    try {
      const parsed = BatchRewriteBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { novelId, chapterNumbers, userDirection, maxWordCount, stylePreset, styleNotes } = parsed.data;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const orderedNumbers = [...new Set(chapterNumbers)].sort((a, b) => a - b);
      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }

      const results: Array<{
        chapterNumber: number;
        ok: boolean;
        usedDefaultDirection?: boolean;
        wordCount?: number;
        similarity?: number;
        error?: string;
      }> = [];

      for (const chapterNumber of orderedNumbers) {
        try {
          const chapter = await novelManager.getChapter(novelId, chapterNumber);
          if (!chapter || !chapter.content.trim()) {
            results.push({
              chapterNumber,
              ok: false,
              error: `第 ${chapterNumber} 章不存在或内容为空`,
            });
            continue;
          }

          const preview = await previewRewriteChapter(deps, {
            novelId,
            chapterNumber,
            chapterContent: chapter.content,
            userDirection,
            maxWordCount,
            stylePreset,
            styleNotes,
            modelOverride: modelAccess.client,
          });

          await confirmRewriteChapter(deps, {
            novelId,
            chapterNumber,
            result: preview.result,
          });

          results.push({
            chapterNumber,
            ok: true,
            usedDefaultDirection: preview.usedDefaultDirection,
            wordCount: preview.chapterContent.length,
            similarity: preview.similarity,
          });
        } catch (err) {
          results.push({
            chapterNumber,
            ok: false,
            error: safeErrorMessage(err, '重写失败'),
          });
        }
      }

      const succeeded = results.filter(item => item.ok).length;
      const failed = results.length - succeeded;

      res.json({
        status: failed > 0 ? 'partial' : 'completed',
        total: results.length,
        succeeded,
        failed,
        results,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '批量重写失败');
      res.status(500).json({ error: message });
    }
  });
}
