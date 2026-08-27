import { z } from 'zod';

// ==================== 故事状态机：统一快照 ====================

/** 角色在某一章结束时的状态 */
export const CharacterLiveState = z.object({
  characterId: z.string(),
  name: z.string(),
  location: z.string().default(''),
  /** 当前情绪基调 */
  emotionalState: z.string().default('neutral'),
  /** 当前持有的关键物品 */
  inventory: z.array(z.string()).default([]),
  /** 已揭示的秘密（对读者而言） */
  revealedSecrets: z.array(z.string()).default([]),
  /** 尚未揭示的秘密（仅作者知道） */
  hiddenSecrets: z.array(z.string()).default([]),
  /** 当前目标/意图 */
  currentGoal: z.string().default(''),
  /** 目标完成度 0-100 */
  goalProgress: z.number().min(0).max(100).default(0),
  /** 与其他角色的关系变化摘要 */
  relationshipChanges: z.array(z.object({
    targetName: z.string(),
    change: z.string(),
    /** 量化关系向量（由 LLM 提取，不存在时用关键词推断） */
    vector: z.object({
      trust: z.number().min(-100).max(100).default(0),
      affection: z.number().min(-100).max(100).default(0),
      respect: z.number().min(-100).max(100).default(0),
      obligation: z.number().min(0).max(100).default(0),
      fear: z.number().min(0).max(100).default(0),
      rivalry: z.number().min(0).max(100).default(0),
    }).optional(),
  })).default([]),
  /** 身体状态（受伤、疲劳等） */
  physicalCondition: z.string().default('normal'),
  /** 能力/实力变化 */
  powerChange: z.string().default(''),
  /** 当前核心信念（可能随故事演变） */
  currentBelief: z.string().default(''),
  /** 本章信念是否动摇（空=无变化） */
  beliefShift: z.string().default(''),
  /** 存活状态 */
  alive: z.boolean().default(true),
  /** 是否在场（未离场/失踪） */
  present: z.boolean().default(true),
});
export type CharacterLiveState = z.infer<typeof CharacterLiveState>;

/** 世界/环境在某一章结束时的状态 */
export const WorldLiveState = z.object({
  /** 当前时间线标记（如"第三天黄昏"、"大战后第二年"） */
  timelineMarker: z.string().default(''),
  /** 季节/天气 */
  environment: z.string().default(''),
  /** 势力格局变化 */
  factionChanges: z.array(z.object({
    factionName: z.string(),
    change: z.string(),
  })).default([]),
  /** 地理/场景变化（如城市被毁、新地点发现） */
  geographyChanges: z.array(z.string()).default([]),
  /** 力量体系变化（如新规则揭示、禁术解封） */
  powerSystemChanges: z.array(z.string()).default([]),
  /** 社会/政治变化 */
  socialChanges: z.array(z.string()).default([]),
});
export type WorldLiveState = z.infer<typeof WorldLiveState>;

/** 情节线实时状态 */
export const PlotLiveState = z.object({
  /** 活跃情节线 */
  activeThreads: z.array(z.object({
    threadName: z.string(),
    status: z.enum(['active', 'climax', 'cooling']),
    summary: z.string(),
    /** 已持续章数 */
    activeForChapters: z.number().int().default(0),
    /** Dependencies from outline PlotThread (optional enrichment) */
    prerequisites: z.array(z.string()).default([]),
    mergeTarget: z.string().optional(),
  })).default([]),


  /** 未兑现的伏笔 */
  pendingForeshadowing: z.array(z.object({
    hint: z.string(),
    plantedInChapter: z.number().int(),
    urgency: z.enum(['low', 'medium', 'high', 'overdue']),
    scope: z.enum(['scene', 'arc', 'saga']).optional(),
  })).default([]),
  /** 当前整体张力水平 0-10 */
  tensionLevel: z.number().min(0).max(10).default(5),
  /** 读者此刻应有的核心悬念 */
  readerQuestions: z.array(z.string()).default([]),
});
export type PlotLiveState = z.infer<typeof PlotLiveState>;

/** 因果链条目 */
export const CausalChainEntry = z.object({
  /** 触发事件 */
  cause: z.string(),
  /** 发生章节 */
  causeChapter: z.number().int(),
  /** 已产生的后果 */
  resolvedEffects: z.array(z.string()).default([]),
  /** 尚未兑现的后果（必须在后续章节体现） */
  pendingEffects: z.array(z.string()).default([]),
});
export type CausalChainEntry = z.infer<typeof CausalChainEntry>;

/** 势力在某一章结束时的状态 */
export const FactionLiveState = z.object({
  factionName: z.string(),
  /** 势力阶段: dormant=蛰伏, rising=崛起, peak=鼎盛, declining=衰落, collapsed=覆灭 */
  phase: z.enum(['dormant', 'rising', 'peak', 'declining', 'collapsed']),
  /** 综合实力 0-100 */
  powerLevel: z.number().min(0).max(100),
  /** 控制的关键资源 */
  controlledResources: z.array(z.string()).default([]),
  /** 当前核心目标 */
  currentObjective: z.string().default(''),
  /** 目标进度 0-100 */
  objectiveProgress: z.number().min(0).max(100).default(0),
  /** 内部稳定度 0-100 (低=内乱风险) */
  internalStability: z.number().min(0).max(100).default(50),
  /** 与其他势力的关系 */
  relations: z.array(z.object({
    targetFaction: z.string(),
    type: z.enum(['ally', 'neutral', 'rival', 'enemy', 'vassal', 'overlord']),
    description: z.string().default(''),
  })).default([]),
  /** 本章变化描述 */
  changeThisChapter: z.string().default(''),
});
export type FactionLiveState = z.infer<typeof FactionLiveState>;

/** 单章故事状态快照 */
export const StoryStateSnapshot = z.object({
  /** 快照对应的章节号 */
  chapterNumber: z.number().int().positive(),
  /** 角色实时状态 */
  characters: z.array(CharacterLiveState).default([]),
  /** 世界实时状态 */
  world: WorldLiveState.default({}),
  /** 势力状态 */
  factions: z.array(FactionLiveState).default([]),
  /** 情节实时状态 */
  plot: PlotLiveState.default({}),
  /** 因果链 */
  causalChains: z.array(CausalChainEntry).default([]),
  /** 本章关键事件摘要（一句话） */
  chapterSummary: z.string().default(''),
  /** 下一章应注意的硬约束 */
  nextChapterConstraints: z.array(z.string()).default([]),
  /** 生成时间 */
  createdAt: z.string().datetime(),
});
export type StoryStateSnapshot = z.infer<typeof StoryStateSnapshot>;

// ==================== 资源账本系统 ====================

/** 资源类别 */
export const ResourceCategory = z.enum(['item', 'money', 'material', 'skill', 'power']);
export type ResourceCategory = z.infer<typeof ResourceCategory>;

/** 资源条目 */
export const ResourceEntry = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: ResourceCategory,
  quantity: z.number(),
  acquiredAt: z.number().int().positive(), // 章节号
  lastUsedAt: z.number().int().positive().optional(),
  durability: z.number().min(0).max(100).optional(), // 耐久度
  notes: z.string().default(''),
  ownerId: z.string().optional(), // 角色ID（可选）
});
export type ResourceEntry = z.infer<typeof ResourceEntry>;

/** 资源交易类型 */
export const ResourceTransactionType = z.enum(['acquire', 'consume', 'decay', 'transfer']);
export type ResourceTransactionType = z.infer<typeof ResourceTransactionType>;

/** 资源交易记录 */
export const ResourceTransaction = z.object({
  chapterNumber: z.number().int().positive(),
  type: ResourceTransactionType,
  resourceId: z.string().uuid(),
  amount: z.number(),
  reason: z.string(),
  timestamp: z.string().datetime(),
});
export type ResourceTransaction = z.infer<typeof ResourceTransaction>;

/** 资源账本 */
export const ResourceLedger = z.object({
  novelId: z.string().uuid(),
  entries: z.array(ResourceEntry).default([]),
  transactions: z.array(ResourceTransaction).default([]),
  updatedAt: z.string().datetime(),
});
export type ResourceLedger = z.infer<typeof ResourceLedger>;

// ==================== 角色交互矩阵 ====================

/** 角色间的交互记录 */
export const CharacterInteraction = z.object({
  characterA: z.string(),
  characterB: z.string(),
  /** 首次相遇章节 */
  firstMetAt: z.number().int().positive().optional(),
  /** 最后交互章节 */
  lastInteractionAt: z.number().int().positive().optional(),
  /** 关系类型 */
  relationshipType: z.enum(['ally', 'enemy', 'neutral', 'unknown']).default('unknown'),
  /** 双方都知道的信息 */
  sharedKnowledge: z.array(z.string()).default([]),
  /** 非对称信息（一方知道另一方不知道） */
  asymmetricKnowledge: z.array(z.object({
    /** 知道者 */
    knower: z.string(),
    /** 秘密内容 */
    secret: z.string(),
  })).default([]),
});
export type CharacterInteraction = z.infer<typeof CharacterInteraction>;

/** 角色交互矩阵 */
export const CharacterMatrix = z.object({
  novelId: z.string().uuid(),
  /** 角色间的交互记录 */
  interactions: z.array(CharacterInteraction).default([]),
  /** 信息边界：每个角色已知的信息列表 */
  informationBoundaries: z.record(z.string(), z.array(z.string())).default({}),
  updatedAt: z.string().datetime(),
});
export type CharacterMatrix = z.infer<typeof CharacterMatrix>;

/** 弧线摘要条目（单个 arc） */
export const CompressedArc = z.object({
  chapterRange: z.object({ start: z.number().int(), end: z.number().int() }),
  summary: z.string(),
  keyStateChanges: z.array(z.string()).default([]),
});
export type CompressedArc = z.infer<typeof CompressedArc>;

/** 完整故事状态（包含所有章节快照 + 全局摘要） */
export const StoryState = z.object({
  novelId: z.string(),
  /** 最新快照章节号 */
  latestChapter: z.number().int().nonnegative().default(0),
  /** 每章快照（按章节号索引） */
  snapshots: z.array(StoryStateSnapshot).default([]),
  /** 全局故事弧线摘要（每 N 章压缩一次，避免上下文爆炸） */
  compressedArcs: z.array(CompressedArc).default([]),
  /** 二级压缩：每 3 个 arc 合并为 1 个 mega-arc，支撑超长篇 */
  megaArcs: z.array(CompressedArc).default([]),
  updatedAt: z.string().datetime(),
});
export type StoryState = z.infer<typeof StoryState>;

// ==================== 系列作品 ====================

/** 系列中单本书的引用 */
export const SeriesNovelRef = z.object({
  novelId: z.string(),
  title: z.string(),
  /** 在系列中的顺序 */
  order: z.number().int().positive(),
  /** 本书的时间线范围描述 */
  timelineSpan: z.string().default(''),
  /** 本书结束时的关键遗产（传递给下一本的核心信息） */
  legacy: z.array(z.string()).default([]),
  status: z.enum(['planning', 'writing', 'completed']).default('planning'),
});
export type SeriesNovelRef = z.infer<typeof SeriesNovelRef>;

/** 系列级别的持久状态（跨书传递） */
export const SeriesLegacy = z.object({
  /** 跨书存活的角色 */
  persistentCharacters: z.array(z.object({
    name: z.string(),
    /** 在系列中的角色定位变化 */
    roleAcrossBooks: z.string().default(''),
    /** 最后已知状态 */
    lastKnownState: z.string().default(''),
  })).default([]),
  /** 跨书的世界观演变 */
  worldEvolution: z.array(z.object({
    aspect: z.string(),
    evolution: z.string(),
  })).default([]),
  /** 系列级伏笔（跨书的悬念） */
  seriesForeshadowing: z.array(z.object({
    hint: z.string(),
    plantedInBook: z.number().int(),
    resolved: z.boolean().default(false),
  })).default([]),
  /** 系列主题演变 */
  thematicProgression: z.string().default(''),
});
export type SeriesLegacy = z.infer<typeof SeriesLegacy>;

// ==================== 宇宙锚点（跨书共享宇宙） ====================

/** 锚点与衍生小说之间的时间关系 */
export const AnchorTimeRelation = z.enum([
  'prequel',   // 衍生书是锚点的前传
  'parallel',  // 同一时代、不同地点/视角
  'sequel',    // 衍生书是锚点的续作
]);
export type AnchorTimeRelation = z.infer<typeof AnchorTimeRelation>;

/** AI 策展的候选角色（等待用户确认入池） */
export const CharacterPoolCandidate = z.object({
  /** 原始角色 ID（来自锚点小说的 characters.json） */
  characterId: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  role: z.string(),
  /** AI 评估的跨书价值：boss / mysterious / transitional / recurring */
  crossBookValue: z.enum(['boss', 'mysterious', 'transitional', 'recurring']),
  /** AI 给出的入池理由 */
  reason: z.string(),
  /** 核心能力摘要 */
  abilitySummary: z.string().default(''),
  /** 最后已知状态（锚点小说结束时） */
  lastKnownState: z.string().default(''),
  /** 可延展的叙事钩子 */
  narrativeHooks: z.array(z.string()).default([]),
  /** 用户是否确认入池 */
  confirmed: z.boolean().default(false),
});
export type CharacterPoolCandidate = z.infer<typeof CharacterPoolCandidate>;

/** 锚点中冻结的世界基底快照 */
export const AnchorWorldSnapshot = z.object({
  /** 按类别分组的世界条目（冻结副本） */
  entries: z.array(z.object({
    id: z.string(),
    category: z.string(),
    name: z.string(),
    description: z.string(),
    aliases: z.array(z.string()).default([]),
    constraints: z.array(z.string()).default([]),
    details: z.record(z.string(), z.string()).default({}),
    tags: z.array(z.string()).default([]),
  })).default([]),
  /** 势力终态 */
  factionEndStates: z.array(z.object({
    factionName: z.string(),
    phase: z.string(),
    powerLevel: z.number().min(0).max(100),
    description: z.string().default(''),
  })).default([]),
  /** 时间线终点标记 */
  timelineEndMarker: z.string().default(''),
});
export type AnchorWorldSnapshot = z.infer<typeof AnchorWorldSnapshot>;

/** 跨书伏笔（saga 级别） */
export const AnchorForeshadowing = z.object({
  hint: z.string(),
  plantedInChapter: z.number().int(),
  /** 是否已在锚点小说内解决 */
  resolvedInAnchor: z.boolean().default(false),
  /** 可在衍生书中兑现的方向提示 */
  resolutionHint: z.string().default(''),
});
export type AnchorForeshadowing = z.infer<typeof AnchorForeshadowing>;

/** 宇宙锚点：完结小说的不可变冻结快照 */
export const UniverseAnchor = z.object({
  id: z.string(),
  /** 锚点来源小说 ID */
  sourceNovelId: z.string(),
  /** 锚点来源小说标题 */
  sourceNovelTitle: z.string(),
  /** 世界基底快照 */
  world: AnchorWorldSnapshot,
  /** 角色池候选（AI 策展 + 用户确认） */
  characterPool: z.array(CharacterPoolCandidate).default([]),
  /** 跨书伏笔 */
  foreshadowing: z.array(AnchorForeshadowing).default([]),
  /** 锚点小说的故事摘要（供衍生书参考） */
  storySummary: z.string().default(''),
  /** 锚点冻结时间 */
  frozenAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UniverseAnchor = z.infer<typeof UniverseAnchor>;

/** 衍生小说与锚点的关联配置 */
export const AnchorLink = z.object({
  /** 锚点 ID */
  anchorId: z.string(),
  /** 锚点来源小说标题（冗余，方便展示） */
  anchorNovelTitle: z.string(),
  /** 时间关系 */
  timeRelation: AnchorTimeRelation,
  /** 优先级（数字越小越优先，多锚点冲突时按此排序） */
  priority: z.number().int().positive().default(1),
});
export type AnchorLink = z.infer<typeof AnchorLink>;

/** 系列整理结果（多锚点合并后的精华） */
export const SeriesConsolidation = z.object({
  seriesId: z.string(),
  /** 合并后的精华世界条目 */
  consolidatedWorld: AnchorWorldSnapshot,
  /** 合并后的角色池 */
  consolidatedCharacters: z.array(CharacterPoolCandidate).default([]),
  /** 仍未兑现的跨书伏笔 */
  unresolvedForeshadowing: z.array(AnchorForeshadowing).default([]),
  /** 系列主题演变摘要 */
  thematicSummary: z.string().default(''),
  /** 整理时间 */
  consolidatedAt: z.string().datetime(),
});
export type SeriesConsolidation = z.infer<typeof SeriesConsolidation>;

/** 单本书蓝图 */
export const BookBlueprint = z.object({
  bookOrder: z.number().int().positive(),
  novelId: z.string().default(''),
  title: z.string().default(''),
  protagonist: z.string().default(''),
  origin: z.string().default(''),        // 本源
  positioning: z.string().default(''),    // 定位
  fate: z.string().default(''),           // 宿命
  crossRefs: z.array(z.object({
    targetBook: z.number().int().positive(),
    targetProtagonist: z.string(),
    relationship: z.string(),             // 关系描述
    foreshadowingHint: z.string().default(''), // 需要在本书中埋的伏笔
  })).default([]),
  keyThemes: z.array(z.string()).default([]),
  notes: z.string().default(''),
});
export type BookBlueprint = z.infer<typeof BookBlueprint>;

/** 系列蓝图 */
export const SeriesBlueprint = z.object({
  books: z.array(BookBlueprint).default([]),
  sharedWorldRules: z.string().default(''),   // 共享世界观规则
  overarchingTheme: z.string().default(''),   // 系列总主题
  timelineOverview: z.string().default(''),   // 时间线概览
});
export type SeriesBlueprint = z.infer<typeof SeriesBlueprint>;

/** 系列元数据 */
export const SeriesMetadata = z.object({
  id: z.string(),
  ownerId: z.string().optional(),
  title: z.string(),
  description: z.string().default(''),
  genre: z.string().default(''),
  /** 系列总体构想 */
  masterPlan: z.string().default(''),
  /** 结构化蓝图 */
  blueprint: SeriesBlueprint.default({}),
  novels: z.array(SeriesNovelRef).default([]),
  legacy: SeriesLegacy.default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SeriesMetadata = z.infer<typeof SeriesMetadata>;
