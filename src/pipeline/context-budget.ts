/**
 * 上下文预算分配器
 * 当 Writer Agent 注入的上下文总量超过预算时，按优先级自动裁剪低优先级模块。
 */

export type ContextSection = {
  key: string;
  label: string;
  content: string;
  /** Higher = more important, will be kept when trimming */
  priority: number;
};

/** Priority levels (higher = more important) */
export const CONTEXT_PRIORITIES: Record<string, number> = {
  storyStateContext: 95,
  consistencyGuardrails: 90,
  previousChapterSummary: 88,
  smartGateHints: 87,
  characterContext: 85,
  characterEventContext: 83,
  namingConstraints: 82,
  worldContext: 82,
  worldBuilderGuidance: 70,
  foreshadowingHints: 80,
  causalChainHints: 78,
  outlineContract: 75,
  worldContract: 73,
  chapterAdviceContext: 62,
  characterStallHints: 65,
  beliefEvolutionHints: 63,
  tensionCurveHints: 60,
  plotThreadGraphHints: 58,
  relationshipEvolutionHints: 55,
  voiceDriftHints: 53,
  pacingHints: 50,
  cultureStoryHooks: 45,
  factionFronts: 40,
  antiTemplateRules: 35,
  recurringDescriptionHints: 52,
  chapterOpeningHints: 68,
  payoffDensityHints: 66,
  seriesContext: 30,
  universeContext: 32,
};

export const DEFAULT_MAX_CHARS = 64000;

/** Editor 上下文预算（Editor 主要需要草稿 + 场景计划 + 合约/修复提示，不需要全部分析型上下文） */
export const EDITOR_MAX_CHARS = 48000;

/** mergedPreviousSummary 总预算（7 路记忆检索合并后的上限） */
export const MEMORY_SUMMARY_MAX_CHARS = 24000;

/** 非登场角色的缩略档案单条上限 */
export const OFFSTAGE_CHARACTER_SUMMARY_MAX_CHARS = 80;

/**
 * Allocate context budget by keeping high-priority sections first.
 * When total chars exceed maxChars, lower-priority sections are dropped.
 * Sections with priority >= 70 get a truncated version if space remains.
 */
export function allocateContextBudget(
  sections: ContextSection[],
  maxChars: number = DEFAULT_MAX_CHARS,
): { kept: ContextSection[]; trimmed: string[] } {
  const sorted = [...sections].sort((a, b) => b.priority - a.priority);

  const kept: ContextSection[] = [];
  const trimmed: string[] = [];
  let usedChars = 0;

  for (const section of sorted) {
    if (usedChars + section.content.length <= maxChars) {
      kept.push(section);
      usedChars += section.content.length;
    } else {
      const remaining = maxChars - usedChars;
      if (section.priority >= 70 && remaining > 500) {
        kept.push({
          ...section,
          content:
            section.content.slice(0, remaining - 50) +
            '\n…（因上下文预算限制已截断）',
        });
        usedChars = maxChars;
      } else {
        trimmed.push(section.key);
      }
    }
  }

  return { kept, trimmed };
}

/**
 * Build a trimming summary for logging / injection into the prompt.
 */
export function buildTrimmingSummary(trimmed: string[]): string {
  if (trimmed.length === 0) return '';
  return `[上下文预算] 因总量超限，已裁剪以下模块：${trimmed.join('、')}`;
}

/**
 * mergedPreviousSummary 各来源的优先级（数值越高越优先保留）
 */
export const MEMORY_SECTION_PRIORITIES: Record<string, number> = {
  previousChapter: 90,
  characterState: 83,
  digestCtx: 80,
  enhancedChapter: 75,
  arcCtx: 70,
  factCtx: 65,
  threadCtx: 60,
};

/**
 * 按小说类型定制的记忆优先级预设。
 * 不同类型对记忆来源的侧重不同：
 * - mystery：事实图谱和情节线对推理至关重要
 * - romance：角色状态和情感变化是核心
 * - fantasy：弧线发展和事实约束防止设定矛盾
 * - scifi：事实严谨性 + 弧线连贯性
 * - historical：事实准确性最高优先
 */
export const GENRE_MEMORY_PRESETS: Record<string, Record<string, number>> = {
  mystery: {
    previousChapter: 90, factCtx: 88, threadCtx: 85,
    characterState: 80, digestCtx: 75, enhancedChapter: 70, arcCtx: 65,
  },
  romance: {
    previousChapter: 90, characterState: 88, digestCtx: 85,
    enhancedChapter: 80, arcCtx: 75, factCtx: 65, threadCtx: 60,
  },
  fantasy: {
    previousChapter: 90, arcCtx: 85, factCtx: 83,
    characterState: 80, digestCtx: 78, enhancedChapter: 75, threadCtx: 70,
  },
  scifi: {
    previousChapter: 90, factCtx: 85, arcCtx: 83,
    characterState: 80, threadCtx: 78, digestCtx: 75, enhancedChapter: 70,
  },
  historical: {
    previousChapter: 90, factCtx: 88, arcCtx: 85,
    digestCtx: 80, characterState: 78, enhancedChapter: 73, threadCtx: 68,
  },
};

/**
 * 解析记忆优先级：基于类型预设 + 用户自定义覆盖。
 * 返回完整的优先级映射表。
 */
export function resolveMemoryPriorities(
  genre?: string,
  override?: Record<string, number>,
): Record<string, number> {
  const base = { ...MEMORY_SECTION_PRIORITIES };
  if (genre && GENRE_MEMORY_PRESETS[genre]) {
    Object.assign(base, GENRE_MEMORY_PRESETS[genre]);
  }
  if (override) {
    Object.assign(base, override);
  }
  return base;
}

/**
 * 通用带标签的段落级预算分配器。
 * 按优先级从高到低保留段落，直到总字符数达到上限。
 * 超出上限的段落被截断或丢弃。
 */
export function allocateSectionBudget(
  sections: Array<{ key: string; content: string; priority: number }>,
  maxChars: number,
): { kept: Array<{ key: string; content: string }>; trimmedKeys: string[] } {
  const sorted = [...sections].sort((a, b) => b.priority - a.priority);
  const kept: Array<{ key: string; content: string }> = [];
  const trimmedKeys: string[] = [];
  let usedChars = 0;

  for (const section of sorted) {
    if (!section.content) continue;
    if (usedChars + section.content.length <= maxChars) {
      kept.push({ key: section.key, content: section.content });
      usedChars += section.content.length;
    } else {
      const remaining = maxChars - usedChars;
      if (remaining > 300) {
        kept.push({
          key: section.key,
          content: section.content.slice(0, remaining - 30) + '\n…（已截断）',
        });
        usedChars = maxChars;
      } else {
        trimmedKeys.push(section.key);
      }
    }
  }

  return { kept, trimmedKeys };
}

/**
 * Editor 不需要的低优先级上下文字段。
 * Editor 主要需要：draft (inputText)、scenePlan、outlineContract、worldContract、
 * qualityGateFixHints 等修复提示。分析型提示对 Editor 无用。
 */
export const EDITOR_EXCLUDED_CONTEXT_KEYS: string[] = [
  'tensionCurveHints',
  'characterStallHints',
  'beliefEvolutionHints',
  'relationshipEvolutionHints',
  'voiceDriftHints',
  'pacingHints',
  'cultureStoryHooks',
  'factionFronts',
  'antiTemplateRules',
  'recurringDescriptionHints',
  'chapterOpeningHints',
  'payoffDensityHints',
  'plotThreadGraphHints',
  'seriesContext',
  'anchorContext',
  'chapterAdviceContext',
  'causalChainHints',
];
