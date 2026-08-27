import type { Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { ChatMessage, ModelClient } from '../../../../models/types.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  CangjieChatBodySchema,
  CangjieChatReplySchema,
  type CangjieConversationTurn,
} from './cangjie-schemas.js';
import {
  buildFallbackOpeningReply,
  conversationTranscript,
  normalizeConversation,
  trimText,
} from './cangjie-support.js';

type CangjieDeps = {
  modelClient: ModelClient;
  authDb?: AuthDb;
};

function toModelMessages(messages: CangjieConversationTurn[], openingRequest: boolean): ChatMessage[] {
  if (openingRequest) {
    return [
      { role: 'system', content: '你是一个故事构思搭档，负责和用户边聊边把故事核心钩出来。' },
      {
        role: 'user',
        content: '请给出一个轻量开场，顺着用户的故事口味抛出 2-4 个最值得先聊的问题，不要输出 JSON，不要一次问太多。',
      },
    ];
  }

  const transcript = conversationTranscript(messages);
  return [
    {
      role: 'system',
      content: `你是一个故事构思搭档，负责和用户边聊边把故事核心钩出来。
要求：
- 回复自然、简洁、像懂网文的搭档。
- 每次只追问一个关键点，不要连续轰炸问题。
- 如果用户明确给出信息，不要重复确认，直接承接。
- 如果用户说"先别问""你先帮我想"，就先给 2-3 个可选方向。
- 如果用户说"差不多了""整理一下"，就收口，顺势引导进入整理清单。
- 不要输出 JSON。
- 不要复述成会议纪要，优先把内容变成一个能继续聊的钩子。`,
    },
    {
      role: 'user',
      content: `## 对话记录
${transcript}

请根据上面的对话继续聊，只追问一个最关键的点；如果信息已经够了，就直接给方向。`,
    },
  ];
}

export function registerCangjieChatRoute(router: Router, deps: CangjieDeps): void {
  router.post('/cangjie/chat', async (req, res) => {
    const parsed = CangjieChatBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数有误' });
      return;
    }

    try {
      const messages = normalizeConversation(parsed.data.messages);
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: req.auth?.id,
        headers: req.headers,
      });
      const activeModelClient = modelAccess.client ?? deps.modelClient;
      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 功能尚未就绪：缺少 modelClient' });
        return;
      }

      const response = await activeModelClient.chat(
        toModelMessages(messages, messages.length === 0),
        { temperature: 0.72, maxTokens: 900 },
      );
      const content = trimText(response.content || '', 1200);
      const reply = CangjieChatReplySchema.safeParse({
        message: {
          role: 'assistant',
          content: content || buildFallbackOpeningReply(messages),
        },
      });

      res.json(reply.success ? reply.data : {
        message: { role: 'assistant', content: buildFallbackOpeningReply(messages) },
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : '仓颉聊天失败' });
    }
  });
}
