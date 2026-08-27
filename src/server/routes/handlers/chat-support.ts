import type { IncomingHttpHeaders } from 'node:http';
import type { ChatMessage } from '../../../models/types.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';

export const CHAT_ROUTE_TIMEOUT_MS = 6 * 60_000;

export function summarizeChatMessage(text: string, maxLength = 80): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

export function isChatTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes('timeout')
    || message.includes('timed out')
    || message.includes('aborted')
    || message.includes('504')
    || message.includes('gateway timeout')
    || message.includes('gateway time-out');
}

export function buildCreativeChatSystemPrompt(params: {
  novel?: {
    title: string;
    genre: string;
    synopsis?: string;
  };
  characters?: Array<{
    name: string;
    role?: string;
    personality?: string;
  }>;
  worldEntries?: Array<{
    name: string;
    category: string;
    description: string;
  }>;
}): string {
  let systemPrompt = '你是一位资深的小说创作助手，擅长帮助作者进行创意构思、情节设计和角色塑造。';
  if (!params.novel) {
    return systemPrompt;
  }

  systemPrompt += `\n\n当前关联的小说：《${params.novel.title}》`;
  systemPrompt += `\n类型：${params.novel.genre}`;
  if (params.novel.synopsis) {
    systemPrompt += `\n简介：${params.novel.synopsis}`;
  }
  if ((params.characters?.length ?? 0) > 0) {
    systemPrompt += '\n\n主要角色：';
    for (const character of params.characters ?? []) {
      systemPrompt += `\n- ${character.name}（${character.role ?? ''}）：${character.personality || '暂无描述'}`;
    }
  }
  if ((params.worldEntries?.length ?? 0) > 0) {
    systemPrompt += '\n\n世界观要素：';
    for (const worldEntry of params.worldEntries ?? []) {
      systemPrompt += `\n- ${worldEntry.name}（${worldEntry.category}）：${worldEntry.description.slice(0, 100)}`;
    }
  }
  return systemPrompt;
}

export async function resolveCreativeChatContext(params: {
  deps: GenerateDeps;
  novelId?: string;
  userId?: string;
  headers: IncomingHttpHeaders;
}): Promise<{
  systemPrompt: string;
  activeModelClient: GenerateDeps['modelClient'];
  blockedError?: string;
}> {
  const { deps, novelId, userId, headers } = params;
  const { novelManager, modelClient, authDb } = deps;
  if (!novelId) {
    const modelAccess = await resolveUserModelAccess({
      authDb,
      userId,
      headers,
    });
    return {
      systemPrompt: buildCreativeChatSystemPrompt({}),
      activeModelClient: modelAccess.client ?? modelClient,
      blockedError: modelAccess.error,
    };
  }

  const novel = await novelManager.getNovel(novelId);
  if (!novel) {
    const modelAccess = await resolveUserModelAccess({
      authDb,
      userId,
      headers,
    });
    return {
      systemPrompt: buildCreativeChatSystemPrompt({}),
      activeModelClient: modelAccess.client ?? modelClient,
      blockedError: modelAccess.error,
    };
  }

  const modelAccess = await resolveUserModelAccess({
    authDb,
    userId,
    headers,
    novel,
  });
  if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
    return {
      systemPrompt: buildCreativeChatSystemPrompt({ novel }),
      activeModelClient: modelClient,
      blockedError: modelAccess.error,
    };
  }

  const [characters, worldEntries] = await Promise.all([
    novelManager.getCharacters(novelId),
    novelManager.getWorldEntries(novelId),
  ]);
  return {
    systemPrompt: buildCreativeChatSystemPrompt({
      novel,
      characters,
      worldEntries,
    }),
    activeModelClient: modelAccess.client ?? modelClient,
  };
}

export function buildExpandIdeaSystemPrompt(field: 'direction' | 'styleNotes'): string {
  return field === 'direction'
    ? `你是专业的小说创作顾问。用户会给你一句简短的灵感/想法，请你结合小说上下文将其扩展成一段详细的"创作方向"描述（100-200字），包含可能涉及的情节走向、人物互动、情感基调和场景氛围。

重要要求：
- 必须紧密衔接上一章的结尾情况，从上一章结束的场景、情绪、悬念自然过渡
- 用户给出的关键词/想法是本章的核心方向，在此基础上补充细节，但不要偏离
- 保持自然流畅，不要使用编号列表格式，用连贯的段落表达
- 只输出扩写后的创作方向文本，不要输出任何解释`
    : `你是专业的小说创作顾问。用户会给你一句简短的风格/笔法描述，请你结合小说上下文将其扩展成一段详细的"风格补充"说明（50-150字），涵盖叙事视角、语体风格、节奏偏好、修辞手法等方面。保持简练专业。只输出扩写后的风格说明文本，不要输出任何解释。`;
}

export async function resolveExpandIdeaContext(params: {
  deps: GenerateDeps;
  novelId: string;
  userId?: string;
  headers: IncomingHttpHeaders;
  chapterNumber?: number;
}): Promise<{
  novelContext: string;
  activeModelClient: GenerateDeps['modelClient'];
  blockedError?: string;
  billingBypass: boolean;
}> {
  const { deps, novelId, userId, headers, chapterNumber } = params;
  const { novelManager, modelClient, authDb } = deps;
  let novelContext = '';
  let activeModelClient = modelClient;
  let billingBypass = false;

  const novel = await novelManager.getNovel(novelId);
  if (novel) {
    const modelAccess = await resolveUserModelAccess({
      authDb,
      userId,
      headers,
      novel,
    });
    billingBypass = modelAccess.billingBypass;
    if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
      return {
        novelContext,
        activeModelClient,
        blockedError: modelAccess.error,
        billingBypass,
      };
    }
    activeModelClient = modelAccess.client ?? modelClient;
    novelContext += `小说：《${novel.title}》\n类型：${novel.genre}`;
    if (novel.synopsis) {
      novelContext += `\n简介：${novel.synopsis}`;
    }
  }

  const outline = await novelManager.getOutline(novelId);
  const targetNum = chapterNumber ?? ((outline?.chapters?.length ?? 0) + 1);
  if (outline?.chapters?.length) {
    const chapterOutline = outline.chapters.find(item => item.chapterNumber === targetNum);
    if (chapterOutline) {
      novelContext += `\n\n本章大纲（第 ${targetNum} 章）：${chapterOutline.title ?? ''}`;
      if ('outline' in chapterOutline && typeof chapterOutline.outline === 'string' && chapterOutline.outline) {
        novelContext += `\n${chapterOutline.outline}`;
      }
      if (chapterOutline.keyEvents?.length) {
        novelContext += `\n关键事件：${chapterOutline.keyEvents.join('；')}`;
      }
    }
  }

  const prevNum = targetNum - 1;
  if (prevNum >= 1) {
    const prevChapter = await novelManager.getChapter(novelId, prevNum);
    if (prevChapter) {
      novelContext += `\n\n【上一章情况（第 ${prevNum} 章：${prevChapter.title ?? ''})】`;
      if (prevChapter.summary) {
        novelContext += `\n摘要：${prevChapter.summary}`;
      }
      const prevContent = prevChapter.content ?? '';
      if (prevContent.length > 0) {
        const tail = prevContent.length > 600 ? `…${prevContent.slice(-600)}` : prevContent;
        novelContext += `\n结尾片段：${tail}`;
      }
    }
  }

  const characters = await novelManager.getCharacters(novelId);
  if (characters.length > 0) {
    novelContext += '\n\n主要角色：';
    for (const character of characters.slice(0, 8)) {
      novelContext += `\n- ${character.name}（${character.role}）`;
    }
  }

  return {
    novelContext,
    activeModelClient,
    billingBypass,
  };
}

export function buildExpandIdeaMessages(params: {
  systemPrompt: string;
  novelContext: string;
  text: string;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: params.novelContext ? `${params.systemPrompt}\n\n---\n${params.novelContext}` : params.systemPrompt,
    },
    { role: 'user', content: params.text },
  ];
}
