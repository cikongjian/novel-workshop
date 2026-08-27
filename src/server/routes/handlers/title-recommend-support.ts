import type { AgentContext } from '../../../agents/types.js';
import type { CharacterProfile, OutlineData, TitleRecommendation, WorldEntry } from '../../../novel/types.js';
import type { ChapterSummary } from '../../../novel/chapter-repository.js';

/** 章节概要最大条目数（取首尾各半，覆盖开篇和最新进展） */
const MAX_CHAPTER_SUMMARIES = 20;
/** 单条章节概要最大字符数 */
const CHAPTER_SUMMARY_MAX_CHARS = 80;
/** 大纲概要最大条目数 */
const MAX_OUTLINE_ENTRIES = 15;
/** 单条大纲最大字符数 */
const OUTLINE_ENTRY_MAX_CHARS = 60;
/** 角色档案最大条目数 */
const MAX_CHARACTERS = 6;
/** 单个角色描述最大字符数 */
const CHARACTER_DESC_MAX_CHARS = 80;
/** 世界观条目最大数 */
const MAX_WORLD_ENTRIES = 8;
/** 单个世界观条目最大字符数 */
const WORLD_ENTRY_MAX_CHARS = 60;

type RecommendationPlatform = TitleRecommendation['platform'];

type RawRecommendationPayload = {
  titles?: Array<{ title?: unknown; reasoning?: unknown }>;
  shortSynopsis?: unknown;
  longSynopsis?: unknown;
  tags?: unknown[];
  marketingInsight?: unknown;
  raw?: unknown;
};

function truncate(input: string | undefined, maxChars: number): string {
  return (input ?? '').slice(0, maxChars);
}

export function normalizeRecommendationPlatform(platform: unknown): RecommendationPlatform {
  return platform === 'qidian' || platform === 'fanqie' ? platform : 'general';
}

export function buildTitleRecommendationContext(params: {
  novel: {
    id: string;
    genre?: string;
    title: string;
    synopsis?: string;
    description?: string;
  };
  platform: RecommendationPlatform;
  userDirection?: string;
  characters: CharacterProfile[];
  worldEntries: WorldEntry[];
  outline: OutlineData;
  chapters: ChapterSummary[];
}): AgentContext {
  const half = Math.floor(MAX_CHAPTER_SUMMARIES / 2);
  const headChapters = params.chapters.slice(0, half);
  const tailChapters = params.chapters.length > half ? params.chapters.slice(-half) : [];
  const sampleChapters = [...headChapters, ...tailChapters]
    .filter((chapter, index, items) => items.findIndex((item) => item.chapterNumber === chapter.chapterNumber) === index);

  return {
    novelId: params.novel.id,
    genre: params.novel.genre || '',
    novelTitle: params.novel.title,
    novelSynopsis: params.novel.synopsis || params.novel.description || '',
    characterContext: params.characters
      .slice(0, MAX_CHARACTERS)
      .map((character) => `${character.name}(${character.role}): ${truncate(character.personality, CHARACTER_DESC_MAX_CHARS)}`)
      .join('\n'),
    worldContext: params.worldEntries
      .slice(0, MAX_WORLD_ENTRIES)
      .map((entry) => `[${entry.category}] ${entry.name}: ${truncate(entry.description, WORLD_ENTRY_MAX_CHARS)}`)
      .join('\n'),
    outlineContext: params.outline.chapters
      .slice(0, MAX_OUTLINE_ENTRIES)
      .map((chapter) =>
        `第${chapter.chapterNumber ?? '?'}章 ${chapter.title ?? ''}: ${truncate(chapter.summary, OUTLINE_ENTRY_MAX_CHARS)}`)
      .join('\n'),
    inputText: sampleChapters
      .map((chapter) => `第${chapter.chapterNumber}章 ${chapter.title || ''}: ${truncate(chapter.summary, CHAPTER_SUMMARY_MAX_CHARS)}`)
      .join('\n'),
    userDirection: [
      `目标平台：${params.platform}`,
      params.userDirection?.trim() ?? '',
    ].filter(Boolean).join('\n'),
  };
}

export function parseTitleRecommendationPayload(rawOutput: string): RawRecommendationPayload {
  const trimmed = rawOutput.trim();
  try {
    return JSON.parse(trimmed) as RawRecommendationPayload;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim()) as RawRecommendationPayload;
      } catch {
        return { raw: rawOutput };
      }
    }

    const jsonStart = rawOutput.indexOf('{');
    const jsonEnd = rawOutput.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1)) as RawRecommendationPayload;
      } catch {
        return { raw: rawOutput };
      }
    }

    return { raw: rawOutput };
  }
}

export function buildTitleRecommendationRecord(params: {
  id: string;
  platform: RecommendationPlatform;
  parsed: RawRecommendationPayload;
  createdAt: string;
}): TitleRecommendation {
  return {
    id: params.id,
    platform: params.platform,
    titles: Array.isArray(params.parsed.titles)
      ? params.parsed.titles.map((title) => ({
          title: String(title?.title ?? ''),
          reasoning: String(title?.reasoning ?? ''),
        }))
      : [],
    shortSynopsis: String(params.parsed.shortSynopsis ?? ''),
    longSynopsis: String(params.parsed.longSynopsis ?? ''),
    tags: Array.isArray(params.parsed.tags) ? params.parsed.tags.map((tag) => String(tag)) : [],
    marketingInsight: String(params.parsed.marketingInsight ?? ''),
    createdAt: params.createdAt,
  };
}

export function removeTitleRecommendation(
  recommendations: TitleRecommendation[] | undefined,
  recId: string,
): TitleRecommendation[] {
  return (recommendations ?? []).filter((recommendation) => recommendation.id !== recId);
}
