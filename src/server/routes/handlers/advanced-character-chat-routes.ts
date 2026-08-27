import type { Router } from 'express';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import type { AdvancedRouteDeps } from './advanced-route-support.js';

export function registerAdvancedCharacterChatRoutes(router: Router, deps: AdvancedRouteDeps): void {
  const { novelManager, modelClient, authDb } = deps;

  router.post('/character-chat', async (req, res) => {
    try {
      const { novelId, characterId, message, history } = req.body;
      if (!novelId || !characterId || !message) {
        res.status(400).json({ error: '缺少 novelId/characterId/message' }); return;
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
      const characters = await novelManager.getCharacters(novelId);
      const character = characters.find(c => c.id === characterId);
      if (!character) { res.status(404).json({ error: '角色不存在' }); return; }

      const systemPrompt = [
        `你现在扮演小说《${novel.title}》中的角色"${character.name}"。`,
        `类型：${novel.genre || ''}`,
        '',
        `## 角色设定`,
        character.personality ? `性格：${character.personality}` : '',
        character.speechStyle ? `说话风格：${character.speechStyle}` : '',
        character.backstory ? `背景：${character.backstory}` : '',
        character.motivation ? `动机：${character.motivation}` : '',
        character.currentState ? `当前状态：${character.currentState}` : '',
        character.age ? `年龄：${character.age}` : '',
        character.gender ? `性别：${character.gender}` : '',
        character.appearance ? `外貌：${character.appearance}` : '',
        '',
        `## 要求`,
        `请完全以"${character.name}"的身份、语气和思维方式回答。`,
        `保持角色的说话风格和性格特征，不要跳出角色。`,
        `回答要简洁自然，像真实对话一样。`,
        `禁止使用“（动作/情绪/声线）+台词”或“台词+（动作）”写法（例如：（冷笑）“……”）。`,
        `如需表达动作和语气，请用直述句让读者直接感知，不使用括号标签。`,
      ].filter(Boolean).join('\n');

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      if (Array.isArray(history)) {
        for (const h of history.slice(-10)) {
          messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
        }
      }
      messages.push({ role: 'user', content: message });

      const response = await (modelAccess.client ?? modelClient).chat(messages, { temperature: 0.8, maxTokens: 1024 });
      res.json({ reply: response.content, character: character.name });
    } catch (err: unknown) {
      res.status(500).json({ error: safeErrorMessage(err, '角色对话失败') });
    }
  });
}
