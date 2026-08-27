import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';

const MAX_CHAPTER_SUMMARIES = 10;
const MAX_CHARACTERS = 5;
const MAX_WORLD_ENTRIES = 5;
const MAX_PLOT_THREADS = 3;

export function registerSynopsisGeneratorRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, modelClient, broadcast, agents, authDb } = deps;

  // POST /api/generate/synopsis — 生成起点/番茄风格作品介绍
  router.post('/synopsis', async (req, res) => {
    try {
      const { novelId } = req.body;
      if (!novelId) {
        res.status(400).json({ error: '缺少 novelId' });
        return;
      }

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
      const chapters = await novelManager.listChapters(novelId);

      if (chapters.length < 3) {
        res.status(400).json({ error: '内容不足，建议至少更新 3 章后再生成作品介绍' });
        return;
      }

      const characters = await novelManager.getCharacters(novelId);
      const worldEntries = await novelManager.getWorldEntries(novelId);
      const outline = await novelManager.getOutline(novelId);

      const agent = agents?.get('synopsis-generator');
      if (!agent) {
        res.status(500).json({ error: 'synopsis-generator Agent 未注册' });
        return;
      }

      // 取最近的章节摘要
      const recentChapters = chapters.slice(-MAX_CHAPTER_SUMMARIES);
      const chapterSummaries = recentChapters.map(ch => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title || '',
        summary: ch.summary || '',
      }));

      // 主要角色
      const mainCharacters = characters
        .filter(c => c.role === 'protagonist' || c.role === 'antagonist')
        .slice(0, MAX_CHARACTERS)
        .map(c => ({
          name: c.name,
          role: c.role,
          backstory: c.backstory || '',
          motivation: c.motivation || '',
          abilities: c.abilities || [],
        }));

      // 核心世界观
      const keyWorldEntries = worldEntries
        .filter(e => e.category === 'power' || e.category === 'rule' || e.category === 'faction')
        .slice(0, MAX_WORLD_ENTRIES)
        .map(e => ({
          name: e.name,
          category: e.category,
          description: e.description,
        }));

      // 活跃情节线
      const activePlotThreads = outline.plotThreads
        ?.filter(t => t.status === 'developing' || t.status === 'planted')
        .slice(0, MAX_PLOT_THREADS)
        .map(t => ({
          name: t.name,
          description: t.description,
          status: t.status,
        })) || [];

      const context = {
        novelId,
        genre: novel.genre || '',
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis || '',
        synopsis: novel.synopsis || '',
        chapterSummaries,
        characters: mainCharacters,
        worldEntries: keyWorldEntries,
        outline: {
          plotThreads: activePlotThreads,
        },
      };

      const output = await agent.execute(context, modelAccess.client ?? modelClient, (chunk) => {
        broadcast({
          type: 'agent:chunk',
          agentRole: 'synopsis-generator',
          novelId,
          data: chunk,
          timestamp: new Date().toISOString(),
        } as import('../../../agents/types.js').AgentEvent);
      });

      // 解析 JSON 输出
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(output.content.trim());
      } catch {
        const jsonMatch = output.content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[1].trim());
          } catch {
            parsed = { raw: output.content };
          }
        } else {
          const start = output.content.indexOf('{');
          const end = output.content.lastIndexOf('}');
          if (start !== -1 && end > start) {
            try {
              parsed = JSON.parse(output.content.slice(start, end + 1));
            } catch {
              parsed = { raw: output.content };
            }
          } else {
            parsed = { raw: output.content };
          }
        }
      }

      res.json({
        qidian: parsed.qidian || {},
        fanqie: parsed.fanqie || {},
      });
    } catch (err: unknown) {
      const message = safeErrorMessage(err, '生成作品介绍失败');
      res.status(500).json({ error: message });
    }
  });
}
