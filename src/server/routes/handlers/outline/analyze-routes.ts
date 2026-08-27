import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { resolveOutlineModelAccess, type OutlineAiRouteDeps } from './ai-route-support.js';

export function registerOutlineAnalyzeRoutes(
  router: Router,
  deps: OutlineAiRouteDeps,
): void {
  const { novelManager, broadcast } = deps;

  router.post('/analyze', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      const { chapterNumbers } = req.body || {};

      const [chapterMetas, currentOutline, novel] = await Promise.all([
        novelManager.listChapters(novelId),
        novelManager.getOutline(novelId),
        novelManager.getNovel(novelId),
      ]);
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
      if (!modelAccess.client) {
        res.status(503).json({ error: 'AI 模型未就绪' });
        return;
      }

      let targetChapters: number[];
      if (chapterNumbers && Array.isArray(chapterNumbers) && chapterNumbers.length > 0) {
        targetChapters = chapterNumbers;
      } else {
        targetChapters = chapterMetas
          .filter(chapter => chapter.wordCount > 0 || chapter.status !== 'outlined')
          .map(chapter => chapter.chapterNumber);
      }

      const existingChapterMap = new Map(currentOutline.chapters.map(chapter => [chapter.chapterNumber, chapter]));
      const analyzedChapterNums: number[] = [];

      for (const chapterNum of targetChapters) {
        const fullChapter = await novelManager.getChapter(novelId, chapterNum);
        if (!fullChapter || !fullChapter.content) continue;

        const contentSnippet = fullChapter.content.slice(0, 3000);
        const analysisPrompt = `请分析以下小说章节内容，提取关键信息。

## 小说信息
- 标题：${novel.title}
- 类型：${novel.genre || '未知'}
- 章节：第${chapterNum}章 ${fullChapter.title || ''}

## 章节内容（节选）
${contentSnippet}

## 请输出 JSON 格式：
{
  "tensionTarget": <1-10的数字，表示本章整体紧张度，1最低10最高>,
  "keyEvents": [<3-5个关键事件/场景的简短描述，每个不超过15字>],
  "summaryHint": "<如果章节摘要为空，请生成一个100字以内的摘要>"
}

只输出 JSON，不要其他内容。`;

        try {
          const response = await modelAccess.client.chat([
            { role: 'user', content: analysisPrompt },
          ], { temperature: 0.3, maxTokens: 500 });

          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            const existing = existingChapterMap.get(chapterNum);

            const updatedEntry = {
              chapterNumber: chapterNum,
              title: existing?.title || fullChapter.title || `第${chapterNum}章`,
              summary: existing?.summary || analysis.summaryHint || fullChapter.summary || '',
              beats: existing?.beats || [],
              tensionTarget: analysis.tensionTarget ?? existing?.tensionTarget ?? 5,
              plotThreadsAdvanced: existing?.plotThreadsAdvanced || [],
              keyEvents: analysis.keyEvents?.length ? analysis.keyEvents : (existing?.keyEvents || []),
              notes: existing?.notes || `[AI分析] 自动提取`,
            };

            existingChapterMap.set(chapterNum, updatedEntry);
            analyzedChapterNums.push(chapterNum);

            broadcast?.({
              type: 'agent:chunk',
              agentRole: 'outline-analyzer',
              novelId,
              data: `已分析第 ${chapterNum} 章`,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (parseErr) {
          console.error(`分析第 ${chapterNum} 章失败:`, parseErr);
        }
      }

      if (analyzedChapterNums.length === 0) {
        res.json({ outline: currentOutline, analyzed: 0, message: '没有可分析的章节' });
        return;
      }

      const mergedChapters = Array.from(existingChapterMap.values())
        .sort((a, b) => a.chapterNumber - b.chapterNumber);

      const merged = {
        ...currentOutline,
        chapters: mergedChapters,
      };

      await novelManager.saveOutline(novelId, merged);
      res.json({
        outline: merged,
        analyzed: analyzedChapterNums.length,
        chapters: analyzedChapterNums,
        message: `已用 AI 分析 ${analyzedChapterNums.length} 章大纲`,
      });
    } catch (err) {
      const message = safeErrorMessage(err, 'AI 分析失败');
      res.status(500).json({ error: message });
    }
  });
}
