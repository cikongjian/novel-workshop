/**
 * 结构化真相文件类型定义
 *
 * Truth files 是从 StoryStateSnapshot 构建的压缩确定性视图：
 * - 比完整 snapshot 体积小 80%+，适合直接注入 prompt
 * - 补充 snapshot 缺失的信息边界追踪
 * - 提供伏笔过期预警和紧急度计算
 */

// ==================== 1. 当前状态视图 ====================

/** 角色压缩状态（从 CharacterLiveState 压缩） */
export type CompactCharacterState = {
  name: string;
  location: string;
  goal: string;
  goalProgress: number;
  emotionalState: string;
  physicalCondition: string;
  alive: boolean;
  present: boolean;
  /** 关键物品（仅列出前 5 个） */
  keyItems: string[];
  /** 力量/境界变化（空串=无变化） */
  powerChange: string;
};

/** 世界压缩状态（从 WorldLiveState 压缩） */
export type CompactWorldState = {
  timelineMarker: string;
  environment: string;
  /** 合并 factionChanges + geographyChanges + socialChanges */
  recentChanges: string[];
};

/** 势力压缩状态（从 FactionLiveState 压缩） */
export type CompactFactionState = {
  name: string;
  phase: string;
  powerLevel: number;
  objective: string;
  /** 仅保留非中立的关系 */
  activeRelations: Array<{
    target: string;
    type: string;
  }>;
};

/** 当前状态视图 — 从最新 StoryStateSnapshot 压缩 */
export type CurrentStateView = {
  chapterNumber: number;
  characters: CompactCharacterState[];
  world: CompactWorldState;
  factions: CompactFactionState[];
  tensionLevel: number;
  /** 读者当前应持有的疑问 */
  readerQuestions: string[];
  /** 下一章硬性约束 */
  nextChapterConstraints: string[];
  generatedAt: string;
};

// ==================== 2. 待兑现伏笔视图 ====================

/** 伏笔状态条目 */
export type PendingHookEntry = {
  hint: string;
  plantedInChapter: number;
  scope: 'scene' | 'arc' | 'saga';
  priority: 'high' | 'medium' | 'low';
  /** 已经过的章节数 */
  chaptersElapsed: number;
  /** 距离过期的剩余章节数（负数=已过期） */
  chaptersUntilOverdue: number;
  urgency: 'critical' | 'warning' | 'normal';
  /** 是否已过期 */
  isOverdue: boolean;
};

/** 待兑现伏笔视图 */
export type PendingHooksView = {
  currentChapter: number;
  /** 按紧急度排序的伏笔列表 */
  hooks: PendingHookEntry[];
  /** 统计：各紧急度数量 */
  stats: {
    total: number;
    critical: number;
    warning: number;
    normal: number;
  };
  generatedAt: string;
};

// ==================== 3. 角色信息边界矩阵 ====================

/** 角色对之间的信息关系 */
export type CharacterInfoEdge = {
  /** 源角色名 */
  from: string;
  /** 目标角色名 */
  to: string;
  /** 双方共享的已知信息 */
  sharedKnowledge: string[];
  /** from 知道但 to 不知道的信息 */
  asymmetricKnowledge: string[];
  /** 关系类型 */
  relationType: string;
  /** 表面 vs 真实关系（如有） */
  publicVsPrivate?: string;
};

/** 角色信息边界矩阵视图 */
export type CharacterMatrixView = {
  /** 各角色的已揭示秘密 */
  revealedSecrets: Array<{
    characterName: string;
    secrets: string[];
  }>;
  /** 各角色的隐藏秘密（仅作者知道） */
  hiddenSecrets: Array<{
    characterName: string;
    secrets: string[];
  }>;
  /** 角色间的信息边界关系 */
  infoEdges: CharacterInfoEdge[];
  generatedAt: string;
};

// ==================== 聚合类型 ====================

/** 完整的 Truth File 数据包 */
export type TruthFileBundle = {
  currentState: CurrentStateView | null;
  pendingHooks: PendingHooksView | null;
  characterMatrix: CharacterMatrixView | null;
};
