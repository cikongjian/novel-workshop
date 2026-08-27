import { randomUUID } from 'node:crypto';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CharacterProfile, Chapter } from '../../../../novel/types.js';
import { inferShuangwenAudienceFromGenre } from '../../../../pipeline/shuangwen-pipeline.js';
import type { ShuangwenGenreSchema } from './types.js';
import type { z } from 'zod';

export function now(): string {
  return new Date().toISOString();
}

export function normalizeName(name: unknown): string {
  return typeof name === 'string' ? name.trim() : '';
}

function coerceBlueprintCharacterBrief(params: {
  archetype?: unknown;
  goal?: unknown;
  flaw?: unknown;
  threat?: unknown;
}): { personality: string; motivation: string } {
  const archetype = normalizeName(params.archetype);
  const goal = normalizeName(params.goal);
  const flaw = normalizeName(params.flaw);
  const threat = normalizeName(params.threat);

  const personalityParts = [archetype && `原型：${archetype}`, flaw && `缺陷：${flaw}`].filter(Boolean);
  const motivationParts = [goal && `目标：${goal}`, threat && `威胁：${threat}`].filter(Boolean);

  return {
    personality: personalityParts.join('；').slice(0, 240),
    motivation: motivationParts.join('；').slice(0, 240),
  };
}

export async function seedCharactersFromShuangwenBlueprint(params: {
  novelManager: NovelManager;
  novelId: string;
  blueprint: unknown;
  chapterNumber?: number;
}): Promise<void> {
  const blueprint = (params.blueprint && typeof params.blueprint === 'object')
    ? (params.blueprint as Record<string, any>)
    : null;
  if (!blueprint) return;

  const existing = await params.novelManager.getCharacters(params.novelId);
  const existingNames = new Set(existing.map(c => c.name));

  const ts = now();
  const chapterNumber = params.chapterNumber;
  const defaultState = chapterNumber ? `[第${chapterNumber}章] 初次出场` : '[爽文蓝图] 初始设定';

  const createIfMissing = async (opts: {
    name: string;
    role: CharacterProfile['role'];
    personality?: string;
    motivation?: string;
    tags?: string[];
  }) => {
    const name = opts.name.trim();
    if (!name || existingNames.has(name)) return;

    const profile: CharacterProfile = {
      id: randomUUID(),
      name,
      aliases: [],
      role: opts.role,
      position: '',
      appearance: '',
      personality: opts.personality ?? '',
      personalityTraits: [],
      speechStyle: '',
      speechExamples: [],
      backstory: '',
      motivation: opts.motivation ?? '',
      abilities: [],
      relationships: [],
      arc: '',
      currentState: defaultState,
      firstAppearance: chapterNumber,
      voiceDesignStatus: 'none',
      tags: Array.from(new Set(['auto-seeded', 'from-shuangwen-blueprint', ...(opts.tags ?? [])])),
      createdAt: ts,
      updatedAt: ts,
    };
    await params.novelManager.saveCharacter(params.novelId, profile);
    existingNames.add(name);
  };

  const protagonistName = normalizeName(blueprint.protagonist?.name);
  if (protagonistName) {
    const brief = coerceBlueprintCharacterBrief({
      archetype: blueprint.protagonist?.archetype,
      goal: blueprint.protagonist?.goal,
      flaw: blueprint.protagonist?.flaw,
    });
    await createIfMissing({
      name: protagonistName,
      role: 'protagonist',
      personality: brief.personality,
      motivation: brief.motivation,
      tags: ['protagonist'],
    });
  }

  const antagonistName = normalizeName(blueprint.antagonist?.name);
  if (antagonistName) {
    const brief = coerceBlueprintCharacterBrief({
      archetype: blueprint.antagonist?.archetype,
      threat: blueprint.antagonist?.threat,
    });
    await createIfMissing({
      name: antagonistName,
      role: 'antagonist',
      personality: brief.personality,
      motivation: brief.motivation,
      tags: ['antagonist'],
    });
  }
}

export function resolveAudienceAndGenre(params: {
  inputGenre: z.infer<typeof ShuangwenGenreSchema>;
  inputAudience?: string | undefined;
  existingNovel?: { genre?: string } | null;
}): { genreUsed: z.infer<typeof ShuangwenGenreSchema>; audienceUsed: string } {
  const genreUsed = (params.existingNovel?.genre ?? params.inputGenre) as z.infer<typeof ShuangwenGenreSchema>;
  const audienceUsed = params.inputAudience ?? inferShuangwenAudienceFromGenre(genreUsed);
  return { genreUsed, audienceUsed };
}

/**
 * 合并生成的大纲与已有章节数据：已有内容的章节保留真实摘要/标题，
 * 只对尚未写作的章节使用生成的大纲。
 */
export async function mergeOutlineWithExistingChapters(params: {
  novelManager: NovelManager;
  novelId: string;
  generatedOutline: import('../../../../novel/types.js').OutlineData;
}): Promise<import('../../../../novel/types.js').OutlineData> {
  const { novelManager, novelId, generatedOutline } = params;
  const chapterList = await novelManager.listChapters(novelId);

  // 找出有真实内容的章节（wordCount > 0 表示已写作）
  const writtenChapterNumbers = chapterList
    .filter(ch => ch.wordCount > 0)
    .map(ch => ch.chapterNumber);

  if (writtenChapterNumbers.length === 0) return generatedOutline;

  // 逐个读取已写章节的真实标题和摘要
  const existingMap = new Map<number, { title: string; summary: string }>();
  for (const num of writtenChapterNumbers) {
    try {
      const ch = await novelManager.getChapter(novelId, num);
      if (ch) {
        existingMap.set(num, {
          title: ch.title || '',
          summary: ch.summary || ch.content?.slice(0, 400) || '',
        });
      }
    } catch { /* 读取失败则跳过 */ }
  }

  if (existingMap.size === 0) return generatedOutline;

  // 合并：已有内容的章节用真实数据覆盖生成的摘要
  const mergedChapters = generatedOutline.chapters.map(ch => {
    const existing = existingMap.get(ch.chapterNumber);
    if (!existing) return ch;
    return {
      ...ch,
      title: existing.title || ch.title,
      summary: existing.summary || ch.summary,
      notes: ch.notes ? `${ch.notes}（已有章节内容，摘要来自实际正文）` : '已有章节内容，摘要来自实际正文',
    };
  });

  return { ...generatedOutline, chapters: mergedChapters };
}

export async function ensureOutlinedChapters(params: {
  novelManager: NovelManager;
  novelId: string;
  chapterOutlines: Array<{ chapterNumber: number; title: string; summary: string }>;
  skipChapterNumbers?: Set<number>;
}): Promise<{ created: number; skipped: number }> {
  const { novelManager, novelId } = params;
  const existing = await novelManager.listChapters(novelId);
  const existingSet = new Set(existing.map(ch => ch.chapterNumber));

  const skip = params.skipChapterNumbers ?? new Set<number>();
  let created = 0;
  let skipped = 0;

  for (const outline of params.chapterOutlines) {
    if (existingSet.has(outline.chapterNumber) || skip.has(outline.chapterNumber)) {
      skipped += 1;
      continue;
    }

    const chapter: Chapter = {
      novelId,
      chapterNumber: outline.chapterNumber,
      title: outline.title ?? '',
      content: '',
      wordCount: 0,
      status: 'outlined',
      outline: {
        chapterNumber: outline.chapterNumber,
        title: outline.title ?? '',
        summary: outline.summary ?? '',
        beats: [],
        tensionTarget: 5,
        plotThreadsAdvanced: [],
        keyEvents: [],
        notes: '',
      },
      agentComments: [],
      revisionCount: 0,
      summary: '',
      createdAt: now(),
      updatedAt: now(),
    };

    await novelManager.saveChapter(novelId, chapter);
    created += 1;
  }

  return { created, skipped };
}
