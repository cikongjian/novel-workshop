import type { Router } from 'express';
import type { ChatMessage } from '../../../models/types.js';
import { InlineAIBody, INLINE_PROMPTS } from './types.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

function buildInlineSystemPrompt(basePrompt: string, operation: string): string {
  let systemPrompt = `${basePrompt}\n\n【对话表达硬约束】\n1. 禁止使用“（动作/情绪/声线）+台词”或“台词+（动作）”写法，例如（冷笑）“……”或“……”（咬牙）。\n2. 需要表达语气、动作、声线时，改为读者可直接感知的叙述或直给台词，不要用括号注释。\n3. 仅允许保留系统元数据括号：(#角色名)、(#死亡:角色名)、(#退场:角色名)。`;
  if (operation === 'rewrite') {
    systemPrompt += '\n\n【改写硬约束】\n1. 仅改写用户给出的片段本身，不补写前后文。\n2. 严禁改变事实锚点：人物身份、称谓/自称、时间地点、数字、关系。\n3. 若片段含有说话人标记格式（#角色名），必须原样保留。\n4. 只输出改写结果正文，不输出解释。';
  }
  return systemPrompt;
}

export function registerInlineTextRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, modelClient, authDb } = deps;

  router.post('/inline', async (req, res) => {
    try {
      const parsed = InlineAIBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { novelId, operation, text, context, instruction } = parsed.data;
      let systemPrompt = buildInlineSystemPrompt(INLINE_PROMPTS[operation], operation);
      let activeModelClient = modelClient;

      if (novelId) {
        try {
          const novel = await novelManager.getNovel(novelId);
          if (novel) {
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
            activeModelClient = modelAccess.client ?? modelClient;
            systemPrompt += `\n\n【小说背景】标题：《${novel.title}》，类型：${novel.genre}`;
            if (novel.synopsis) {
              systemPrompt += `，简介：${novel.synopsis}`;
            }
            if (operation === 'dialogue' || operation === 'rewrite') {
              const characters = await novelManager.getCharacters(novelId);
              if (characters.length > 0) {
                systemPrompt += '\n\n【主要角色】';
                for (const c of characters.slice(0, 5)) {
                  systemPrompt += `\n- ${c.name}（${c.role}）：${c.speechStyle || c.personality || ''}`;
                }
              }
            }
          }
        } catch {
          // 上下文加载失败不影响操作
        }
      }

      let userContent = '';
      if (context) {
        userContent += `【上下文】\n${context}\n\n`;
      }
      if (instruction) {
        userContent += `【附加要求】\n${instruction}\n\n`;
      }
      if (operation === 'continue') {
        userContent += `请续写以下内容：\n\n${text}`;
      } else {
        userContent += `请处理以下文本：\n\n${text}`;
      }
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      let fullContent = '';
      await activeModelClient.chatStream(messages, { temperature: 0.8 }, (chunk) => {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ type: 'done', content: fullContent })}\n\n`);
      res.end();
    } catch (err) {
      const message = safeErrorMessage(err, '内联 AI 操作失败');
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.end();
      }
    }
  });
}
