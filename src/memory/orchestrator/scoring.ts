/**
 * 统一打分引擎
 *
 * 将来自不同来源的 MemoryItem 用统一公式计算最终分数，
 * 支持类型感知的来源权重调整。
 */

import { calculateDecayFactor } from '../../pipeline/memory-decay.js';
import type {
  MemoryItem,
  MemorySource,
  SourceWeights,
  ScoringWeights,
} from './types.js';
import { DEFAULT_SCORING_WEIGHTS } from './types.js';

// ────────────────────────────── 来源基础权重 ──────────────────────────────

/**
 * 默认来源权重（归一化到 [0, 1]）。
 * 反映各来源在"通用小说"场景下的基础重要性。
 */
const DEFAULT_SOURCE_WEIGHTS: Record<MemorySource, number> = {
  // 故事状态（硬约束）最高
  'story_state:constraint': 1.0,
  'story_state:snapshot': 0.90,
  'story_state:arc': 0.75,
  'story_state:mega_arc': 0.65,

  // 文件上下文（结构化数据）
  'file:previous_chapter': 0.88,
  'file:character': 0.80,
  'file:world': 0.75,

  // 向量检索（语义匹配）
  'vector:character_state': 0.78,
  'vector:fact': 0.72,
  'vector:digest': 0.70,
  'vector:chapter': 0.68,
  'vector:thread': 0.65,
  'vector:arc': 0.62,
  'vector:character': 0.60,
  'vector:world': 0.55,

  // 角色维度聚合
  'character_recap': 0.76,

  // 世界卡片
  'world_card': 0.70,

  // 管线提示（分析型，优先级最低）
  'pipeline_hint': 0.40,

  // 真相文件（确定性数据，高权重）
  'truth_file:current_state': 0.90,
  'truth_file:pending_hooks': 0.92,
  'truth_file:character_matrix': 0.88,

  // 结构化图谱
  'narrative_graph': 0.75,
  'knowledge_graph': 0.85,
};

/**
 * 类型感知的来源权重预设。
 * 只覆盖需要调整的来源，其余继承默认值。
 */
const GENRE_SOURCE_WEIGHT_PRESETS: Record<string, Partial<Record<MemorySource, number>>> = {
  mystery: {
    'vector:fact': 0.92,
    'vector:thread': 0.88,
    'vector:character_state': 0.72,
    'story_state:constraint': 1.0,
    'truth_file:character_matrix': 0.95,
  },
  romance: {
    'vector:character_state': 0.92,
    'character_recap': 0.88,
    'vector:digest': 0.80,
    'vector:fact': 0.60,
  },
  fantasy: {
    'vector:arc': 0.82,
    'vector:fact': 0.80,
    'world_card': 0.85,
    'file:world': 0.82,
    'truth_file:current_state': 0.95,
  },
  scifi: {
    'vector:fact': 0.88,
    'vector:arc': 0.80,
    'world_card': 0.82,
    'vector:thread': 0.75,
  },
  historical: {
    'vector:fact': 0.92,
    'vector:arc': 0.85,
    'world_card': 0.80,
    'vector:thread': 0.72,
  },
};

// ────────────────────────────── 新鲜度计算 ──────────────────────────────

/**
 * 计算新鲜度分数 [0.2, 1.0]。
 * 基于 calculateDecayFactor 但映射到 [0.2, 1.0] 区间。
 * chapterNumber=0 表示无时序信息，返回中性值 0.5。
 */
export function computeFreshness(chapterNumber: number, currentChapter: number): number {
  if (chapterNumber <= 0 || currentChapter <= 0) return 0.5;
  return calculateDecayFactor(currentChapter, chapterNumber);
}

// ────────────────────────────── 来源权重解析 ──────────────────────────────

/**
 * 解析最终来源权重：默认 → 类型预设 → 用户覆盖。
 */
export function resolveSourceWeights(
  genre?: string,
  overrides?: SourceWeights,
): Record<MemorySource, number> {
  const weights = { ...DEFAULT_SOURCE_WEIGHTS };

  if (genre && GENRE_SOURCE_WEIGHT_PRESETS[genre]) {
    Object.assign(weights, GENRE_SOURCE_WEIGHT_PRESETS[genre]);
  }

  if (overrides) {
    for (const [source, weight] of Object.entries(overrides)) {
      if (source in weights) {
        weights[source as MemorySource] = weight;
      }
    }
  }

  return weights;
}

// ────────────────────────────── 统一打分 ──────────────────────────────

/**
 * 为单个 MemoryItem 计算最终分数。
 *
 * finalScore = relevance × w_relevance
 *            + freshness × w_freshness
 *            + sourceWeight × w_source
 *            + unresolvedWeight × w_unresolved
 *            + (isCritical ? criticalBonus : 0)
 */
export function scoreItem(
  item: MemoryItem,
  sourceWeights: Record<MemorySource, number>,
  scoringWeights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): number {
  const sw = sourceWeights[item.source] ?? 0.5;

  const score =
    item.relevance * scoringWeights.relevance +
    item.freshness * scoringWeights.freshness +
    sw * scoringWeights.sourceWeight +
    item.unresolvedWeight * scoringWeights.unresolved +
    (item.isCritical ? scoringWeights.criticalBonus : 0);

  return score;
}

/**
 * 批量打分并排序。返回按最终分数降序排列的条目。
 */
export function scoreAndSort(
  items: MemoryItem[],
  sourceWeights: Record<MemorySource, number>,
  scoringWeights?: ScoringWeights,
): Array<MemoryItem & { finalScore: number }> {
  return items
    .map(item => ({
      ...item,
      finalScore: scoreItem(item, sourceWeights, scoringWeights),
    }))
    .sort((a, b) => b.finalScore - a.finalScore);
}
