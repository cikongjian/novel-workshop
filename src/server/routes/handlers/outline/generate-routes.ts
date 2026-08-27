import type { Router } from 'express';
import type { OutlineData } from '../../../../novel/types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { parseAgentJsonContent, resolveOutlineModelAccess, type OutlineAiRouteDeps } from './ai-route-support.js';

export function registerOutlineGenerateRoutes(
  router: Router,
  deps: OutlineAiRouteDeps,
): void {
  const { novelManager, agents, broadcast } = deps;

  router.post('/generate', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      const { targetChapters, synopsis } = req.body;

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

      const context = {
        novelId,
        genre: novel.genre || '',
        novelTitle: novel.title,
        novelSynopsis: synopsis || novel.synopsis || novel.description || '',
        userDirection: `请生成 ${targetChapters || novel.targetChapters || 20} 章的完整大纲`,
      };

      const output = await agent.execute(context, modelAccess.client, (chunk) => {
        broadcast?.({ type: 'agent:chunk', agentRole: 'outline-generator', novelId, data: chunk, timestamp: new Date().toISOString() });
      });

      const outlineData = parseAgentJsonContent<Partial<OutlineData>>(output.content);
      if (!outlineData) {
        res.json({ raw: output.content, parsed: false });
        return;
      }

      const currentOutline = await novelManager.getOutline(novelId);
      const merged = {
        ...currentOutline,
        chapters: outlineData.chapters || currentOutline.chapters,
        plotThreads: outlineData.plotThreads || currentOutline.plotThreads,
        foreshadowing: outlineData.foreshadowing || currentOutline.foreshadowing,
      };
      await novelManager.saveOutline(novelId, merged);

      res.json({ outline: merged, parsed: true });
    } catch (err) {
      const message = safeErrorMessage(err, '大纲生成失败');
      res.status(500).json({ error: message });
    }
  });
}
