import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { extractKeyEventsFromSummary, extractTensionFromSummary } from './route-support.js';
import type { OutlineAiRouteDeps } from './ai-route-support.js';

export function registerOutlineSyncRoutes(
  router: Router,
  deps: OutlineAiRouteDeps,
): void {
  const { novelManager } = deps;

  router.post('/sync', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      const { force = false, chapterNumbers } = req.body || {};
      const [chapterMetas, currentOutline] = await Promise.all([
        novelManager.listChapters(novelId),
        novelManager.getOutline(novelId),
      ]);

      const existingChapterMap = new Map(currentOutline.chapters.map(chapter => [chapter.chapterNumber, chapter]));
      const filterSet = Array.isArray(chapterNumbers) && chapterNumbers.length > 0 ? new Set(chapterNumbers as number[]) : null;
      const writtenChapterMetas = chapterMetas.filter(chapter => (chapter.wordCount > 0 || chapter.status !== 'outlined') && (!filterSet || filterSet.has(chapter.chapterNumber)));

      const newOutlineChapters: typeof currentOutline.chapters = [];
      const updatedChapterNums: number[] = [];

      for (const meta of writtenChapterMetas) {
        const existing = existingChapterMap.get(meta.chapterNumber);
        if (existing && existing.summary && !force) continue;

        const fullChapter = await novelManager.getChapter(novelId, meta.chapterNumber);
        const outlineComment = fullChapter?.agentComments?.find(comment => comment.agentRole === 'outline')?.comment || '';
        const summary = fullChapter?.summary || fullChapter?.outline?.summary || '';
        const extractedTension = outlineComment ? extractTensionFromSummary(outlineComment) : 5;
        const extractedKeyEvents = outlineComment ? extractKeyEventsFromSummary(outlineComment) : [];

        const outlineEntry = {
          chapterNumber: meta.chapterNumber,
          title: fullChapter?.outline?.title || fullChapter?.title || meta.title || `第${meta.chapterNumber}章`,
          summary,
          beats: fullChapter?.outline?.beats || existing?.beats || [],
          tensionTarget: fullChapter?.outline?.tensionTarget ?? (extractedTension !== 5 ? extractedTension : (existing?.tensionTarget ?? 5)),
          plotThreadsAdvanced: fullChapter?.outline?.plotThreadsAdvanced || existing?.plotThreadsAdvanced || [],
          keyEvents: fullChapter?.outline?.keyEvents?.length ? fullChapter.outline.keyEvents : (extractedKeyEvents.length ? extractedKeyEvents : (existing?.keyEvents || [])),
          notes: fullChapter?.outline?.notes || existing?.notes || `[自动同步] 从已写章节生成`,
        };

        if (existing) {
          existingChapterMap.set(meta.chapterNumber, outlineEntry);
          updatedChapterNums.push(meta.chapterNumber);
        } else {
          newOutlineChapters.push(outlineEntry);
        }
      }

      if (newOutlineChapters.length === 0 && updatedChapterNums.length === 0) {
        res.json({ outline: currentOutline, added: 0, updated: 0, message: '大纲已是最新，无需同步' });
        return;
      }

      const mergedChapters = [
        ...Array.from(existingChapterMap.values()),
        ...newOutlineChapters,
      ].sort((a, b) => a.chapterNumber - b.chapterNumber);

      const merged = {
        ...currentOutline,
        chapters: mergedChapters,
      };

      await novelManager.saveOutline(novelId, merged);
      const parts = [];
      if (newOutlineChapters.length > 0) parts.push(`新增 ${newOutlineChapters.length} 章`);
      if (updatedChapterNums.length > 0) parts.push(`更新 ${updatedChapterNums.length} 章`);
      res.json({
        outline: merged,
        added: newOutlineChapters.length,
        updated: updatedChapterNums.length,
        message: `已同步大纲：${parts.join('，')}`,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '大纲同步失败');
      res.status(500).json({ error: message });
    }
  });
}
