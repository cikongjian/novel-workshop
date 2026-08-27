import type { Router } from 'express';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { safeParseAgentJson, type AdvancedRouteDeps } from './advanced-route-support.js';

export function registerAdvancedDialogueRoutes(router: Router, deps: AdvancedRouteDeps): void {
  const { novelManager, modelClient, broadcast, agents, authDb } = deps;

  router.post('/polish-dialogue', async (req, res) => {
    try {
      const { novelId, chapterNumber, text } = req.body;
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
      const characters = await novelManager.getCharacters(novelId);
      const content = text || (chapterNumber ? (await novelManager.getChapter(novelId, chapterNumber))?.content : null);
      if (!content) { res.status(400).json({ error: '无章节内容' }); return; }

      const agent = agents?.get('dialogue-polisher');
      if (!agent) { res.status(500).json({ error: 'dialogue-polisher Agent 未注册' }); return; }

      const context = {
        novelId,
        genre: novel.genre || '',
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis || novel.description || '',
        inputText: content,
        characterContext: characters.map(c => `${c.name}: 性格=${c.personality || ''}, 说话风格=${c.speechStyle || ''}`).join('\n'),
        dialogueTargetCharacters: characters.map(c => c.name).join(', '),
      };

      const output = await agent.execute(context, modelAccess.client ?? modelClient, (chunk) => {
        broadcast({ type: 'agent:chunk', agentRole: 'dialogue-polisher', novelId, data: chunk, timestamp: new Date().toISOString() });
      });

      const report = safeParseAgentJson(output.content);
      res.json({ report });
    } catch (err: unknown) {
      res.status(500).json({ error: safeErrorMessage(err, '对话打磨失败') });
    }
  });
}
