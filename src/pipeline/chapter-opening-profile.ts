import type { ShuangwenAudience, ShuangwenBlueprint } from './shuangwen-types.js';
import { getAudienceRules } from './shuangwen-utils.js';
import { DEFAULT_CHAPTER_WORD_TARGET } from './chapter-length-guard.js';

export const DEFAULT_OPENING_CHAPTER_WORD_COUNT = DEFAULT_CHAPTER_WORD_TARGET;

type ResolveChapterOneOpeningProfileParams = {
  chapterNumber: number;
  blueprint?: ShuangwenBlueprint;
  audience?: ShuangwenAudience;
  userDirection?: string;
  styleNotes?: string;
  maxWordCount?: number;
};

type ChapterOneOpeningProfile = {
  applied: boolean;
  userDirection: string;
  styleNotes?: string;
  maxWordCount?: number;
};

function normalizeBlock(value: string | undefined): string {
  return value?.trim() ?? '';
}

function joinDistinctBlocks(blocks: Array<string | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const block of blocks) {
    const normalized = normalizeBlock(block);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged.join('\n\n').trim();
}

export function buildUnifiedOpeningDirection(params: {
  blueprint: ShuangwenBlueprint;
  audience?: ShuangwenAudience;
}): string {
  const audience = params.audience ?? params.blueprint.audience;
  const { blueprint } = params;
  return [
    '写第 1 章时，先抓首屏，再尽快把读者带到题材主场景和第一口回报。',
    `必须落地：${blueprint.hook.openingScene}`,
    `触发事件：${blueprint.hook.incitingIncident}`,
    `第一口回报：${blueprint.hook.firstPayoff}。本章最好在前 65%-75% 篇幅内先落到一次可见结果，不要拖到章末之后。`,
    '首章预算：只完成一轮主目标推进、一次主回报兑现，再留一个章末新变量。第一次兑现后不要完整展开第二轮升级、转场、收编、核查或新危机处理。',
    `章末钩子：${blueprint.hook.chapterEndHookRule}。钩子必须是具体的人、事、任务、到来、选择或新结果，不要只留空泛气氛。`,
    '如果本章后半还要继续升级，新增内容必须换一个维度推进，例如身份、关系、利益、规则、代价或下一步行动，不能重复同一类冲突和同一类证据。',
    getAudienceRules(audience),
  ].join('\n');
}

export function resolveChapterOneOpeningProfile(
  params: ResolveChapterOneOpeningProfileParams,
): ChapterOneOpeningProfile {
  const baseDirection = normalizeBlock(params.userDirection);
  const baseStyleNotes = normalizeBlock(params.styleNotes);
  if (params.chapterNumber !== 1 || !params.blueprint) {
    return {
      applied: false,
      userDirection: baseDirection,
      styleNotes: baseStyleNotes || undefined,
      maxWordCount: params.maxWordCount,
    };
  }

  const openingDirection = buildUnifiedOpeningDirection({
    blueprint: params.blueprint,
    audience: params.audience ?? params.blueprint.audience,
  });

  return {
    applied: true,
    userDirection: joinDistinctBlocks([baseDirection, openingDirection]),
    styleNotes: joinDistinctBlocks([baseStyleNotes, params.blueprint.styleGuide]) || undefined,
    maxWordCount: params.maxWordCount ?? DEFAULT_OPENING_CHAPTER_WORD_COUNT,
  };
}
