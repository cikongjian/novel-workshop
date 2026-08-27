import type { Router } from 'express';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { safeParseAgentJson, type AdvancedRouteDeps } from './advanced-route-support.js';

export function registerAdvancedPlotRoutes(router: Router, deps: AdvancedRouteDeps): void {
  const { novelManager, modelClient, broadcast, agents, authDb } = deps;

  router.post('/explore-plot', async (req, res) => {
    try {
      const { novelId, chapterNumber } = req.body;
      if (!novelId) { res.status(400).json({ error: '缺少 novelId' }); return; }

      const novel = await novelManager.getNovel(novelId);
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
      const outline = await novelManager.getOutline(novelId);
      const characters = await novelManager.getCharacters(novelId);
      const worldEntries = await novelManager.getWorldEntries(novelId);

      const currentChapter = chapterNumber || novel.chapterCount;
      const prevChapter = currentChapter > 1 ? await novelManager.getChapter(novelId, currentChapter - 1) : null;

      const agent = agents?.get('plot-explorer');
      if (!agent) { res.status(500).json({ error: 'plot-explorer Agent 未注册' }); return; }

      const unresolvedFs = outline.foreshadowing?.filter(f => !f.isResolved).map(f => `- ${f.hint}（第${f.plantedInChapter}章埋设）`).join('\n') || '';

      const context = {
        novelId,
        genre: novel.genre || '',
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis || novel.description || '',
        chapterNumber: currentChapter,
        outlineContext: outline.chapters?.map(c => `第${c.chapterNumber}章 ${c.title}: ${c.summary}`).join('\n') || '',
        previousChapterSummary: prevChapter?.summary || prevChapter?.content?.slice(0, 500) || '',
        characterContext: characters.map(c => `${c.name}(${c.role}): ${c.personality || ''}, 动机: ${c.motivation || ''}`).join('\n'),
        worldContext: worldEntries.slice(0, 20).map(e => `[${e.category}] ${e.name}: ${e.description || ''}`).join('\n'),
        unresolvedForeshadowing: unresolvedFs,
      };

      const output = await agent.execute(context, modelAccess.client ?? modelClient, (chunk) => {
        broadcast({ type: 'agent:chunk', agentRole: 'plot-explorer', novelId, data: chunk, timestamp: new Date().toISOString() });
      });

      const parsed = safeParseAgentJson(output.content);
      const branches = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).branches))
          ? (parsed as Record<string, unknown>).branches
          : parsed;
      res.json({ branches });
    } catch (err: unknown) {
      res.status(500).json({ error: safeErrorMessage(err, '剧情探索失败') });
    }
  });
}
