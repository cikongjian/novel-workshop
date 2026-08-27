import type { Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { ChatMessage, ModelClient } from '../../../../models/types.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  CangjieChecklistDraftItemSchema,
  CangjieOrganizeBodySchema,
  CangjieOrganizeReplySchema,
  type CangjieConversationTurn,
} from './cangjie-schemas.js';
import {
  buildFallbackChecklist,
  conversationTranscript,
  extractJsonObject,
  normalizeChecklistDraft,
  normalizeConversation,
} from './cangjie-support.js';

type CangjieDeps = {
  modelClient: ModelClient;
  authDb?: AuthDb;
};

function toModelMessages(messages: CangjieConversationTurn[]): ChatMessage[] {
  const transcript = conversationTranscript(messages);
  return [
    {
      role: 'system',
      content: `你要把聊天记录整理成一份可直接开书的故事核心清单。
要求：
- 只输出 JSON，不要 markdown，不要解释。
- 结果不能出现“可能”“也许”“待确认”“冲突”之类的字眼。
- 每个条目都要具体、无冲突、能直接服务开书。
- 默认所有条目 selected=true。
- 尽量覆盖：故事题眼、主角设定、世界规则、核心冲突、关键关系、第一章开局、爽点承诺、禁写边界。
- 如果聊天里没有某类信息，可以省略，不要硬凑。`,
    },
    {
      role: 'user',
      content: `## 对话记录
${transcript}

请输出 JSON：
{
  "checklist": [
    {
      "id": "premise-1",
      "group": "premise",
      "title": "故事题眼",
      "content": "一句话说明这本书最吸引人的核心",
      "selected": true
    }
  ]
}`,
    },
  ];
}

export function registerCangjieOrganizeRoute(router: Router, deps: CangjieDeps): void {
  router.post('/cangjie/organize', async (req, res) => {
    const parsed = CangjieOrganizeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数有误' });
      return;
    }

    try {
      const messages = normalizeConversation(parsed.data.messages);
      if (messages.length === 0) {
        res.json({ checklist: buildFallbackChecklist(messages) });
        return;
      }

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

      const response = await activeModelClient.chat(toModelMessages(messages), {
        temperature: 0.32,
        maxTokens: 1800,
      });
      const parsedJson = extractJsonObject(response.content);
      const draftResult = CangjieChecklistDraftItemSchema.array().safeParse(
        Array.isArray((parsedJson as { checklist?: unknown } | null)?.checklist)
          ? (parsedJson as { checklist: unknown[] }).checklist
          : [],
      );
      const checklist = draftResult.success && draftResult.data.length > 0
        ? normalizeChecklistDraft(draftResult.data)
        : buildFallbackChecklist(messages);
      const normalized = CangjieOrganizeReplySchema.safeParse({ checklist });

      res.json(normalized.success ? normalized.data : { checklist: buildFallbackChecklist(messages) });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : '仓颉整理失败' });
    }
  });
}
