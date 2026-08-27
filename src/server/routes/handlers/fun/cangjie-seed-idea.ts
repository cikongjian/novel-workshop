import type { Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { ChatMessage, ModelClient } from '../../../../models/types.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  CangjieChecklistItemSchema,
  CangjieSeedIdeaBodySchema,
  CangjieSeedIdeaCardSchema,
  type CangjieChecklistItem,
  type CangjieConversationTurn,
} from './cangjie-schemas.js';
import {
  buildFallbackSeedIdea,
  conversationTranscript,
  extractJsonObject,
  normalizeConversation,
  trimText,
} from './cangjie-support.js';

type CangjieDeps = {
  modelClient: ModelClient;
  authDb?: AuthDb;
};

function toModelMessages(messages: CangjieConversationTurn[], checklist: CangjieChecklistItem[]): ChatMessage[] {
  const transcript = conversationTranscript(messages);
  return [
    {
      role: 'system',
      content: `你要把选中的故事清单整理成可直接交给爽文开书管线的 seedIdea。
要求：
- 只输出 JSON，不要 markdown，不要解释。
- 不要提聊天记录、清单、提示词或模型本身。
- title 要像真实书名方向，简洁、具体、有记忆点。
- synopsis 100-180 字，直接给读者看的简介感。
- seedIdea 120-220 字，必须写清题材、主角、目标、核心冲突、爽点、第一章钩子。
- protagonist/world/conflict/opening/storyCoreBrief 都要具体、能直接落地给后续写作 Agent。
- 只使用 checklist 里的选中内容，不要引入新冲突。`,
    },
    {
      role: 'user',
      content: JSON.stringify({ messages, checklist, transcript }, null, 2),
    },
  ];
}

function normalizeSelectedChecklist(checklist: CangjieChecklistItem[]): CangjieChecklistItem[] {
  const selected = checklist.filter(item => item.selected);
  return selected.length > 0 ? selected : checklist;
}

export function registerCangjieSeedIdeaRoute(router: Router, deps: CangjieDeps): void {
  router.post('/cangjie/seed-idea', async (req, res) => {
    const parsed = CangjieSeedIdeaBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数有误' });
      return;
    }

    try {
      const messages = normalizeConversation(parsed.data.messages);
      const checklist = normalizeSelectedChecklist(
        parsed.data.checklist.map(item => CangjieChecklistItemSchema.parse({
          ...item,
          content: trimText(item.content, 180),
          title: trimText(item.title, 24),
          selected: item.selected !== false,
        })),
      );
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

      const response = await activeModelClient.chat(toModelMessages(messages, checklist), {
        temperature: 0.48,
        maxTokens: 1600,
      });
      const parsedJson = extractJsonObject(response.content);
      const parsedIdea = CangjieSeedIdeaCardSchema.safeParse(parsedJson);
      const idea = parsedIdea.success
        ? CangjieSeedIdeaCardSchema.parse({
            ...parsedIdea.data,
            title: trimText(parsedIdea.data.title, 40),
            synopsis: trimText(parsedIdea.data.synopsis, 180),
            seedIdea: trimText(parsedIdea.data.seedIdea, 240),
            protagonist: trimText(parsedIdea.data.protagonist, 120),
            world: trimText(parsedIdea.data.world, 120),
            conflict: trimText(parsedIdea.data.conflict, 120),
            opening: trimText(parsedIdea.data.opening, 120),
            storyCoreBrief: trimText(parsedIdea.data.storyCoreBrief, 180),
          })
        : buildFallbackSeedIdea(messages, checklist);

      res.json({ idea });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : '仓颉开书提示生成失败' });
    }
  });
}
