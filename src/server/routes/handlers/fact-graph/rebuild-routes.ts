import type { Router } from 'express';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { extractFactsFromChapter, mergeFactsIntoGraph } from '../../../../novel/fact-graph-builder.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { createEmptyFactGraph } from './route-support.js';

export function registerFactGraphRebuildRoutes(
  router: Router,
  novelManager: NovelManager,
  novelMemory?: NovelMemory,
): void {
  router.post('/rebuild', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      const chapters = await novelManager.listChapters(novelId);
      const characters = await novelManager.getCharacters(novelId);
      const characterNames = characters.map((character) => character.name);

      let graph = createEmptyFactGraph(novelId);
      const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
      for (const chapterMeta of sorted) {
        const chapter = await novelManager.getChapter(novelId, chapterMeta.chapterNumber);
        if (!chapter) continue;
        const facts = extractFactsFromChapter({
          chapterContent: chapter.content,
          chapterNumber: chapterMeta.chapterNumber,
          characterNames,
        });
        graph = mergeFactsIntoGraph(graph, facts, chapterMeta.chapterNumber);
      }

      await novelManager.saveFactGraph(novelId, graph);
      if (novelMemory) {
        await novelMemory.indexFactGraph(novelId, graph).catch(() => undefined);
      }
      res.json(graph);
    } catch (err) {
      const message = safeErrorMessage(err, '重建事实图谱失败');
      res.status(500).json({ error: message });
    }
  });
}
