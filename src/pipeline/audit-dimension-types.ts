/**
 * 结构化审计维度类型定义
 *
 * 12 个审计维度用于将 Reader Agent 的评价从自由文本
 * 升级为结构化多维度评分，支持类型特定激活和权重。
 */

// ==================== 维度枚举 ====================

/** 审计维度标识 */
export type AuditDimensionId =
  | 'character_consistency'
  | 'timeline_continuity'
  | 'setting_coherence'
  | 'information_boundary'
  | 'power_system_logic'
  | 'pacing_rhythm'
  | 'emotional_authenticity'
  | 'dialogue_quality'
  | 'prose_quality'
  | 'hook_effectiveness'
  | 'commercial_appeal'
  | 'ai_trace_score';

// ==================== 维度结果 ====================

/** 单个维度的评审结果 */
export type AuditDimensionResult = {
  /** 维度标识 */
  dimensionId: AuditDimensionId;
  /** 分数 (0-10) */
  score: number;
  /** 具体发现/评语 */
  findings: string[];
  /** 是否通过（score >= passThreshold） */
  passed: boolean;
};

// ==================== 维度定义 ====================

/** 维度定义（含默认权重和通过阈值） */
export type AuditDimensionDef = {
  id: AuditDimensionId;
  label: string;
  description: string;
  /** 默认权重 (0-2)，用于计算加权总分 */
  defaultWeight: number;
  /** 通过阈值 (0-10) */
  passThreshold: number;
};

/** 全部 12 个维度定义 */
export const AUDIT_DIMENSIONS: readonly AuditDimensionDef[] = [
  {
    id: 'character_consistency',
    label: '角色一致性',
    description: '角色性格、行为、说话方式是否保持一致',
    defaultWeight: 1.0,
    passThreshold: 6,
  },
  {
    id: 'timeline_continuity',
    label: '时间线连续性',
    description: '时间线索、事件先后顺序是否逻辑自洽',
    defaultWeight: 1.0,
    passThreshold: 6,
  },
  {
    id: 'setting_coherence',
    label: '设定一致性',
    description: '世界观、地理、规则是否前后统一',
    defaultWeight: 0.8,
    passThreshold: 5,
  },
  {
    id: 'information_boundary',
    label: '信息边界',
    description: '角色是否只知道其应知的信息（无上帝视角泄露）',
    defaultWeight: 0.6,
    passThreshold: 5,
  },
  {
    id: 'power_system_logic',
    label: '力量体系逻辑',
    description: '力量/魔法/科技体系是否遵循已建立的规则',
    defaultWeight: 0.4,
    passThreshold: 5,
  },
  {
    id: 'pacing_rhythm',
    label: '节奏韵律',
    description: '叙事节奏是否张弛有度、不拖沓不突兀',
    defaultWeight: 1.0,
    passThreshold: 5,
  },
  {
    id: 'emotional_authenticity',
    label: '情感真实性',
    description: '情感表达是否自然真实、不刻意煽情',
    defaultWeight: 1.0,
    passThreshold: 5,
  },
  {
    id: 'dialogue_quality',
    label: '对话质量',
    description: '对话是否自然、有辨识度、推动情节',
    defaultWeight: 0.8,
    passThreshold: 5,
  },
  {
    id: 'prose_quality',
    label: '文笔质量',
    description: '语言是否优美流畅、修辞恰当',
    defaultWeight: 0.8,
    passThreshold: 5,
  },
  {
    id: 'hook_effectiveness',
    label: '钩子效果',
    description: '章末悬念、伏笔是否有效吸引继续阅读',
    defaultWeight: 0.7,
    passThreshold: 4,
  },
  {
    id: 'commercial_appeal',
    label: '商业吸引力',
    description: '是否有网文读者喜欢的爽感、节奏和代入感',
    defaultWeight: 0.5,
    passThreshold: 4,
  },
  {
    id: 'ai_trace_score',
    label: 'AI 痕迹评分',
    description: '文本是否有明显的 AI 生成痕迹',
    defaultWeight: 0.6,
    passThreshold: 5,
  },
];

// ==================== 类型权重调整 ====================

/**
 * 类型特定的维度权重增量。
 * 正值表示加强该维度，负值表示降低。
 */
export const GENRE_DIMENSION_ADJUSTMENTS: Record<string, Partial<Record<AuditDimensionId, number>>> = {
  mystery: {
    information_boundary: 1.5,
    character_consistency: 0.3,
    timeline_continuity: 0.5,
  },
  romance: {
    emotional_authenticity: 0.5,
    dialogue_quality: 0.3,
  },
  fantasy: {
    setting_coherence: 0.4,
    power_system_logic: 1.0,
  },
  scifi: {
    setting_coherence: 0.3,
    power_system_logic: 0.6,
    timeline_continuity: 0.3,
  },
  historical: {
    timeline_continuity: 0.5,
    setting_coherence: 0.5,
  },
};

// ==================== 审计报告 ====================

/** 完整审计报告 */
export type AuditReport = {
  /** 各维度结果 */
  dimensions: AuditDimensionResult[];
  /** 加权总分 (0-10) */
  weightedTotal: number;
  /** 旧版 Reader 分数（保持兼容） */
  legacyReaderScore: number;
  /** 维度通过数 / 总数 */
  passedCount: number;
  totalCount: number;
  /** 小说类型 */
  genre: string;
};
