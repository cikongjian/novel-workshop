import type { Router } from 'express';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import type { AdvancedRouteDeps } from './advanced-route-support.js';

export function registerAdvancedSuggestionsRoutes(router: Router, deps: AdvancedRouteDeps): void {
  const { novelManager } = deps;

  router.post('/suggestions', async (req, res) => {
    try {
      const { novelId, chapterNumber } = req.body;
      if (!novelId) { res.status(400).json({ error: '缺少 novelId' }); return; }

      const novel = await novelManager.getNovel(novelId);
      const outline = await novelManager.getOutline(novelId);
      const chapters = await novelManager.listChapters(novelId);

      const suggestions: Array<{ type: string; priority: 'high' | 'medium' | 'low'; message: string }> = [];

      const finalizedCount = chapters.filter(c => c.status === 'finalized').length;
      if (finalizedCount > 3) {
        suggestions.push({
          type: 'character',
          priority: 'medium',
          message: `已完成 ${finalizedCount} 章，建议检查角色一致性`,
        });
      }

      const unresolvedFs = outline.foreshadowing?.filter(f => !f.isResolved) || [];
      if (unresolvedFs.length > 5) {
        suggestions.push({
          type: 'foreshadowing',
          priority: 'high',
          message: `有 ${unresolvedFs.length} 条未回收伏笔，建议运行伏笔梳理`,
        });
      }

      if (!outline.chapters || outline.chapters.length === 0) {
        suggestions.push({
          type: 'outline',
          priority: 'high',
          message: '尚未生成大纲，建议使用 AI 大纲生成功能',
        });
      }

      const worldEntries = await novelManager.getWorldEntries(novelId);
      if (worldEntries.length < 5 && finalizedCount > 2) {
        suggestions.push({
          type: 'world',
          priority: 'medium',
          message: '世界观条目较少，建议运行世界观梳理补充设定',
        });
      }

      const nextChapter = (chapterNumber || novel.chapterCount || 0) + 1;
      const outlineChapter = outline.chapters?.find(c => c.chapterNumber === nextChapter);
      if (outlineChapter) {
        suggestions.push({
          type: 'next-chapter',
          priority: 'low',
          message: `下一章（第${nextChapter}章）：${outlineChapter.title} - ${outlineChapter.summary?.slice(0, 80) || ''}`,
        });
      }

      res.json({ suggestions });
    } catch (err: unknown) {
      res.status(500).json({ error: safeErrorMessage(err, '获取建议失败') });
    }
  });
}
