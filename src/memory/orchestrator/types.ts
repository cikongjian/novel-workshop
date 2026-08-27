/**
 * 统一记忆编排器 — 类型定义
 *
 * 将所有记忆来源（向量检索、故事状态、世界卡片、文件上下文）
 * 统一为单一 MemoryItem schema，实现跨源排序、去重和预算分配。
 */

// ────────────────────────────── 记忆来源枚举 ──────────────────────────────

/** 记忆条目来源标识 */
export type MemorySource =
  | 'vector:chapter'
  | 'vector:digest'
  | 'vector:arc'
  | 'vector:fact'
  | 'vector:thread'
  | 'vector:character_state'
  | 'vector:world'
  | 'vector:character'
  | 'character_recap'
  | 'story_state:snapshot'
  | 'story_state:arc'
  | 'story_state:mega_arc'
  | 'story_state:constraint'
  | 'world_card'
  | 'file:character'
  | 'file:world'
  | 'file:previous_chapter'
  | 'pipeline_hint'
  | 'truth_file:current_state'
  | 'truth_file:pending_hooks'
  | 'truth_file:character_matrix'
  | 'narrative_graph'
  | 'knowledge_graph';

// ────────────────────────────── 统一记忆条目 ──────────────────────────────

/**
 * 统一记忆条目。所有来源适配器将各自数据转换为此格式。
 *
 * 设计原则：
 * - 每个字段都有明确的打分/排序/去重用途
 * - 所有字段对每个来源都有合理默认值
 * - 保留足够元数据供调试和日志分析
 */
export type MemoryItem = {
  /** 全局唯一标识（来源:类别:实体ID 拼接） */
  id: string;

  /** 来源标识 */
  source: MemorySource;

  /** 实体标识（角色ID、世界条目名、章节号等） */
  entityId: string;

  /** 关联章节号（无章节关联时为 0） */
  chapterNumber: number;

  /** 文本内容（最终注入 prompt 的文本） */
  text: string;

  /** 文本字符数（预计算，避免重复 .length 调用） */
  charCount: number;

  // ──── 排序信号 ────

  /**
   * 基础相关性分数 [0, 1]
   * - 向量搜索：RRF 归一化分数
   * - 故事状态：基于衰减的保留权重
   * - 世界卡片：关键词匹配归一化分数
   * - 文件上下文：固定高分（总是相关）
   */
  relevance: number;

  /**
   * 新鲜度 [0, 1]
   * 基于 chapterNumber 与 currentChapter 的距离计算。
   * 1.0 = 最近章节，0.2 = 最远章节。
   * chapterNumber=0 时固定为 0.5（无时序信息）。
   */
  freshness: number;

  /**
   * 是否为关键事件（死亡、背叛、突破等），关键事件不受衰减影响。
   */
  isCritical: boolean;

  /**
   * 未解决权重 [0, 1]
   * 用于标记未兑现的伏笔、未解决的冲突、待履行的约束。
   * 未解决的条目在排序中获得额外加权。
   * 默认 0（已完结/无需追踪）。
   */
  unresolvedWeight: number;

  /**
   * 溯源信息（用于调试和日志）
   */
  provenance: string;
};

// ────────────────────────────── 编排器配置 ──────────────────────────────

/**
 * 各来源的基础权重。
 * 编排器使用这些权重与 relevance/freshness/criticality 综合计算最终分数。
 */
export type SourceWeights = Partial<Record<MemorySource, number>>;

/**
 * 编排器运行参数
 */
export type OrchestratorParams = {
  /** 小说 ID */
  novelId: string;

  /** 用户写作指引 */
  userDirection: string;

  /** 大纲内容 */
  outlineContent: string;

  /** 当前章节号 */
  chapterNumber: number;

  /** 小说总章节数 */
  chapterCount: number;

  /** 上一章上下文文本 */
  previousChapterContext: string;

  /** 本章重点角色 ID 列表 */
  focusCharacterIds?: string[];

  /** 角色名 → 别名映射 */
  characterAliases?: ReadonlyMap<string, readonly string[]>;

  /** 小说类型（用于选择来源权重预设） */
  genre?: string;

  /** 用户自定义来源权重覆盖 */
  sourceWeightOverrides?: SourceWeights;
};

/**
 * 编排器输出
 */
export type OrchestratorResult = {
  /** 按最终分数排序、预算裁剪后的记忆条目 */
  items: MemoryItem[];

  /** 最终注入 prompt 的合并文本 */
  mergedContext: string;

  /** 各来源的检索统计 */
  stats: OrchestratorStats;
};

/**
 * 编排统计（用于调试和性能监控）
 */
export type OrchestratorStats = {
  /** 各来源检索到的条目数 */
  retrievedCounts: Partial<Record<MemorySource, number>>;

  /** 去重后移除的条目数 */
  deduplicatedCount: number;

  /** 预算裁剪后保留的条目数 */
  keptCount: number;

  /** 预算裁剪后丢弃的条目数 */
  droppedCount: number;

  /** 最终上下文总字符数 */
  totalChars: number;

  /** 预算上限 */
  budgetChars: number;

  /** 耗时（毫秒） */
  durationMs: number;
};

// ────────────────────────────── 来源适配器接口 ──────────────────────────────

/**
 * 来源适配器：将特定记忆来源的数据转换为统一 MemoryItem[]。
 *
 * 每个适配器只负责：
 * 1. 调用原始数据源获取数据
 * 2. 转换为 MemoryItem 格式
 * 3. 填充正确的 relevance / freshness / isCritical / unresolvedWeight
 *
 * 不负责排序、去重、预算裁剪（由编排器统一处理）。
 */
export interface MemorySourceAdapter {
  /** 适配器名称（用于日志） */
  readonly name: string;

  /** 此适配器产出的来源标识列表 */
  readonly sources: readonly MemorySource[];

  /**
   * 从数据源检索并转换为统一格式。
   * 返回的条目应已填充 relevance 和 freshness。
   */
  retrieve(params: OrchestratorParams): Promise<MemoryItem[]>;
}

// ────────────────────────────── 打分配置 ──────────────────────────────

/**
 * 最终打分公式的权重配置。
 *
 * finalScore = relevance × w_relevance
 *            + freshness × w_freshness
 *            + sourceWeight × w_source
 *            + unresolvedWeight × w_unresolved
 *            + (isCritical ? criticalBonus : 0)
 */
export type ScoringWeights = {
  relevance: number;
  freshness: number;
  sourceWeight: number;
  unresolved: number;
  criticalBonus: number;
};

/** 默认打分权重 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  relevance: 0.45,
  freshness: 0.20,
  sourceWeight: 0.20,
  unresolved: 0.10,
  criticalBonus: 0.15,
};

// ────────────────────────────── 预算常量 ──────────────────────────────

/** 编排器总上下文预算（字符数）*/
export const ORCHESTRATOR_BUDGET_CHARS = 12000;

/** 去重相似度阈值：两个条目文本重叠超过此比例视为重复 */
export const DEDUP_SIMILARITY_THRESHOLD = 0.6;

/** 单个条目最大字符数（超长条目截断） */
export const MAX_ITEM_CHARS = 2000;
