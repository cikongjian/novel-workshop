import type { Router } from 'express';
import { RewriteChapterBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  type CachedRewritePreview,
  buildPreviewCacheKey,
  buildRewriteRequesterKey,
  confirmRewriteChapter,
  previewRewriteChapter,
  purgeExpiredPreviews,
  trimPreviewCache,
} from './rewrite-route-support.js';

export function registerRewritePreviewRoutes(
  router: Router,
  deps: GenerateDeps,
  previewCache: Map<string, CachedRewritePreview>,
): void {
  const { novelManager, authDb } = deps;

  router.post('/rewrite-chapter-preview', async (req, res) => {
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

      purgeExpiredPreviews(previewCache);
      const requesterKey = buildRewriteRequesterKey(req);
      const cacheKey = buildPreviewCacheKey(novelId, chapterNumber, requesterKey);
      previewCache.delete(cacheKey);
      previewCache.set(cacheKey, {
        ...preview,
        createdAt: Date.now(),
      });
      trimPreviewCache(previewCache);

      res.json({
        status: 'preview',
        chapterNumber,
        chapterContent: preview.chapterContent,
        editedContent: preview.editedContent,
        readerFeedback: preview.readerFeedback,
        similarity: preview.similarity,
        similarityReason: preview.similarityReason,
        usedDefaultDirection: preview.usedDefaultDirection,
        wordCount: preview.chapterContent.length,
      });
    } catch (err) {
      console.error('[rewrite-preview] 错误:', err);
      const message = safeErrorMessage(err, '重写预览失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/rewrite-chapter-confirm', async (req, res) => {
    try {
      const { novelId, chapterNumber } = req.body;
      if (!novelId || typeof chapterNumber !== 'number') {
        res.status(400).json({ error: '参数错误' });
        return;
      }

      purgeExpiredPreviews(previewCache);
      const requesterKey = buildRewriteRequesterKey(req);
      const cacheKey = buildPreviewCacheKey(novelId, chapterNumber, requesterKey);
      const preview = previewCache.get(cacheKey);
      if (!preview) {
        res.status(404).json({ error: '预览结果已过期，请重新生成' });
        return;
      }

      await confirmRewriteChapter(deps, {
        novelId,
        chapterNumber,
        result: preview.result,
      });

      previewCache.delete(cacheKey);

      res.json({
        status: 'ok',
        chapterNumber,
        wordCount: preview.chapterContent.length,
        similarity: preview.similarity,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '确认入库失败');
      res.status(500).json({ error: message });
    }
  });
}
