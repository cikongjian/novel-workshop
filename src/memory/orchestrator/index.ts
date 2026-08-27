/**
 * 统一记忆编排器 — 入口模块
 *
 * 提供工厂函数和类型导出，方便外部集成。
 *
 * 使用方式：
 * ```ts
 * import { createOrchestrator } from './memory/orchestrator/index.js';
 *
 * const orchestrator = createOrchestrator({
 *   rawSearch: novelMemoryRawSearch,
 *   storyState: storyStateDataAdapter,
 *   worldCards: worldCardDataAdapter,
 * });
 *
 * const result = await orchestrator.orchestrate({
 *   novelId, userDirection, outlineContent,
 *   chapterNumber, chapterCount,
 *   previousChapterContext, genre,
 * });
 *
 * // result.mergedContext → 注入 Writer Agent
 * ```
 */

export { MemoryOrchestrator } from './orchestrator.js';
export type {
  MemoryItem,
  MemorySource,
  MemorySourceAdapter,
  OrchestratorParams,
  OrchestratorResult,
  OrchestratorStats,
  SourceWeights,
  ScoringWeights,
} from './types.js';
export {
  DEFAULT_SCORING_WEIGHTS,
  ORCHESTRATOR_BUDGET_CHARS,
  DEDUP_SIMILARITY_THRESHOLD,
  MAX_ITEM_CHARS,
} from './types.js';
export { scoreItem, scoreAndSort, resolveSourceWeights, computeFreshness } from './scoring.js';
export { deduplicateItems } from './dedup.js';
export type { RawVectorSearch, StoryStateData, WorldCardData } from './adapters.js';
export {
  VectorSearchAdapter,
  MultiQueryVectorAdapter,
  CharacterRecapAdapter,
  StoryStateAdapter,
  WorldCardAdapter,
  PreviousChapterAdapter,
} from './adapters.js';
export { TruthFileAdapter } from './truth-file-adapter.js';
export type { TruthFileData } from './truth-file-adapter.js';
export { NarrativeGraphAdapter } from './narrative-graph-adapter.js';
export type { NarrativeGraphData } from './narrative-graph-adapter.js';
export { KnowledgeGraphAdapter } from './knowledge-graph-adapter.js';
export type { KnowledgeGraphData } from './knowledge-graph-adapter.js';
export {
  NovelMemorySearchBridge,
  StoryStateBridge,
  WorldCardBridge,
} from './bridges.js';

import type { RawVectorSearch, StoryStateData, WorldCardData } from './adapters.js';
import {
  VectorSearchAdapter,
  MultiQueryVectorAdapter,
  CharacterRecapAdapter,
  StoryStateAdapter,
  WorldCardAdapter,
  PreviousChapterAdapter,
} from './adapters.js';
import { TruthFileAdapter } from './truth-file-adapter.js';
import type { TruthFileData } from './truth-file-adapter.js';
import { NarrativeGraphAdapter } from './narrative-graph-adapter.js';
import type { NarrativeGraphData } from './narrative-graph-adapter.js';
import { KnowledgeGraphAdapter } from './knowledge-graph-adapter.js';
import type { KnowledgeGraphData } from './knowledge-graph-adapter.js';
import { MemoryOrchestrator } from './orchestrator.js';
import type { MemorySource, ScoringWeights } from './types.js';

/**
 * 编排器工厂函数。
 *
 * 根据提供的数据源接口创建完整的编排器实例。
 * 未提供的数据源会被跳过（对应适配器不注入）。
 */
export function createOrchestrator(deps: {
  /** 原始向量搜索接口 */
  rawSearch?: RawVectorSearch;
  /** 故事状态数据接口 */
  storyState?: StoryStateData;
  /** 世界卡片数据接口 */
  worldCards?: WorldCardData;
  /** 真相文件数据接口 */
  truthFiles?: TruthFileData;
  /** 叙事图谱数据接口 */
  narrativeGraph?: NarrativeGraphData;
  /** 知识图谱数据接口 */
  knowledgeGraph?: KnowledgeGraphData;
  /** 打分权重覆盖 */
  scoringWeights?: ScoringWeights;
  /** 总预算字符数覆盖 */
  budgetChars?: number;
}): MemoryOrchestrator {
  const adapters = [];

  // 上一章上下文（总是启用）
  adapters.push(new PreviousChapterAdapter());

  // 向量检索适配器
  if (deps.rawSearch) {
    // 多查询检索：chapter（主力）
    adapters.push(new MultiQueryVectorAdapter({
      category: 'chapter',
      source: 'vector:chapter' as MemorySource,
      limit: 5,
      rawSearch: deps.rawSearch,
    }));

    // 单查询检索：digest, arc, fact, thread, character_state
    const singleQueryCategories: Array<{ category: string; source: MemorySource; limit: number }> = [
      { category: 'digest', source: 'vector:digest', limit: 5 },
      { category: 'arc', source: 'vector:arc', limit: 3 },
      { category: 'fact', source: 'vector:fact', limit: 4 },
      { category: 'thread', source: 'vector:thread', limit: 4 },
      { category: 'character_state', source: 'vector:character_state', limit: 4 },
      { category: 'world', source: 'vector:world', limit: 3 },
      { category: 'character', source: 'vector:character', limit: 3 },
    ];

    for (const cfg of singleQueryCategories) {
      adapters.push(new VectorSearchAdapter({
        ...cfg,
        rawSearch: deps.rawSearch,
      }));
    }

    // 角色维度聚合
    adapters.push(new CharacterRecapAdapter(deps.rawSearch));
  }

  // 故事状态
  if (deps.storyState) {
    adapters.push(new StoryStateAdapter(deps.storyState));
  }

  // 世界卡片（注入 rawSearch 以预检索世界记忆上下文，提高卡片命中率）
  if (deps.worldCards) {
    adapters.push(new WorldCardAdapter(deps.worldCards, deps.rawSearch));
  }

  // 真相文件（确定性状态视图）
  if (deps.truthFiles) {
    adapters.push(new TruthFileAdapter(deps.truthFiles));
  }

  // 叙事图谱（实时构建）
  if (deps.narrativeGraph) {
    adapters.push(new NarrativeGraphAdapter(deps.narrativeGraph));
  }

  // 知识图谱（信息边界）
  if (deps.knowledgeGraph) {
    adapters.push(new KnowledgeGraphAdapter(deps.knowledgeGraph));
  }

  return new MemoryOrchestrator({
    adapters,
    scoringWeights: deps.scoringWeights,
    budgetChars: deps.budgetChars,
  });
}
