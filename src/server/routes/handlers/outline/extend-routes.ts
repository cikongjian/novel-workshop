import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { parseAgentJsonContent, resolveOutlineModelAccess, type OutlineAiRouteDeps } from './ai-route-support.js';

export function registerOutlineExtendRoutes(
  router: Router,
  deps: OutlineAiRouteDeps,
): void {
  const { novelManager, agents, broadcast } = deps;

  router.post('/extend', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      const { additionalChapters = 5, direction = '' } = req.body;

      const novel = await novelManager.getNovel(novelId);
      const agent = agents?.get('outline-generator');
      if (!agent) { res.status(500).json({ error: 'outline-generator Agent 未注册' }); return; }

      const modelAccess = await resolveOutlineModelAccess({
        deps,
        novel,
        userId: req.auth?.id,
        headers: req.headers,
      });
      if (modelAccess.error) {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      if (!modelAccess.client) { res.status(503).json({ error: 'AI 模型未就绪' }); return; }

      const [currentOutline, chapters, characters, worldEntries] = await Promise.all([
        novelManager.getOutline(novelId),
        novelManager.listChapters(novelId),
        novelManager.getCharacters(novelId),
        novelManager.getWorldEntries(novelId),
      ]);

      const existingSummary = (currentOutline.chapters || [])
        .map(chapter => `第${chapter.chapterNumber}章「${chapter.title}」: ${chapter.summary?.slice(0, 80) ?? ''}`)
        .join('\n');

      const openThreads = (currentOutline.plotThreads || [])
        .filter(thread => thread.status !== 'resolved')
        .map(thread => `- ${thread.name}: ${thread.description?.slice(0, 60) ?? ''}`)
        .join('\n');

      const openForeshadowing = (currentOutline.foreshadowing || [])
        .filter(foreshadowing => !foreshadowing.isResolved)
        .map(foreshadowing => `- 第${foreshadowing.plantedInChapter}章埋下: ${foreshadowing.hint}`)
        .join('\n');

      const lastChapterNum = Math.max(...chapters.map(chapter => chapter.chapterNumber), 0);

      const context = {
        novelId,
        genre: novel.genre || '',
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis || novel.description || '',
        worldContext: worldEntries.slice(0, 10).map(entry => `${entry.name}: ${entry.description?.slice(0, 60) ?? ''}`).join('\n'),
        characterContext: characters.slice(0, 10).map(character => `${character.name}: ${character.personality?.slice(0, 60) ?? ''}`).join('\n'),
        userDirection: [
          `## 续写模式`,
          `当前已有 ${currentOutline.chapters?.length ?? 0} 章大纲，已写到第 ${lastChapterNum} 章。`,
          `请从第 ${(currentOutline.chapters?.length ?? 0) + 1} 章开始，续写 ${additionalChapters} 章大纲。`,
          ``,
          `### 已有大纲概要`,
          existingSummary || '（无）',
          ``,
          `### 未完成的情节线`,
          openThreads || '（无）',
          ``,
          `### 未回收的伏笔`,
          openForeshadowing || '（无）',
          ``,
          direction ? `### 用户方向\n${direction}` : '',
          ``,
          `请确保续写内容与已有大纲衔接，优先推进未完成的情节线和回收逾期伏笔。`,
          `输出 JSON 格式，仅包含新增章节的 chapters 数组。`,
        ].filter(Boolean).join('\n'),
      };

      const output = await agent.execute(context, modelAccess.client, (chunk) => {
        broadcast?.({ type: 'agent:chunk', agentRole: 'outline-generator', novelId, data: chunk, timestamp: new Date().toISOString() });
      });

      const parsed = parseAgentJsonContent<Record<string, unknown> | unknown[]>(output.content);
      if (!parsed) {
        res.json({ raw: output.content, parsed: false });
        return;
      }
      const newChapters = Array.isArray(parsed) ? parsed : parsed.chapters || parsed;

      const merged = {
        ...currentOutline,
        chapters: [...(currentOutline.chapters || []), ...(Array.isArray(newChapters) ? newChapters : [])],
        plotThreads: currentOutline.plotThreads,
        foreshadowing: currentOutline.foreshadowing,
      };
      await novelManager.saveOutline(novelId, merged);

      res.json({ outline: merged, newChapters, parsed: true });
    } catch (err) {
      const message = safeErrorMessage(err, '大纲续写失败');
      res.status(500).json({ error: message });
    }
  });
}
