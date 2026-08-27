import { z } from 'zod';
import type { AgentRole } from '../agents/types.js';

export const AGENT_SKILL_STORE_VERSION = 1 as const;
export const AGENT_SKILL_MAX_INSTRUCTION_CHARS = 12000;
export const AGENT_SKILL_DEFAULT_PROMPT_BUDGET = 5000;
export const AGENT_SKILL_EFFECT_MAX_RECORDS = 8000;

export const AgentSkillStatusSchema = z.enum(['draft', 'active', 'archived']);
export type AgentSkillStatus = z.infer<typeof AgentSkillStatusSchema>;

export const AgentSkillActivationSchema = z.enum(['manual', 'auto']);
export type AgentSkillActivation = z.infer<typeof AgentSkillActivationSchema>;

export type AgentSkillRole = AgentRole | '*';

/**
 * 技能触发条件 - 支持复杂的布尔表达式
 *
 * 示例：
 * - { type: 'chapter-range', min: 1, max: 3 } // 第1-3章触发
 * - { type: 'chapter-type', values: ['action', 'climax'] } // 动作或高潮章节触发
 * - { type: 'plot-thread', values: ['thread-uuid-1'] } // 特定情节线推进时触发
 * - { type: 'and', conditions: [...] } // 所有条件都满足
 * - { type: 'or', conditions: [...] } // 任一条件满足
 * - { type: 'not', condition: {...} } // 条件不满足时触发
 */
export const AgentSkillTriggerConditionSchema: z.ZodType<AgentSkillTriggerCondition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    // 章节号范围条件
    z.object({
      type: z.literal('chapter-range'),
      min: z.number().int().positive().optional(),
      max: z.number().int().positive().optional(),
    }),
    // 章节类型条件（开篇/高潮/转折/日常等）
    z.object({
      type: z.literal('chapter-type'),
      values: z.array(z.string().min(1)),
    }),
    // 情节线条件（当特定情节线推进时触发）
    z.object({
      type: z.literal('plot-thread'),
      values: z.array(z.string().uuid()),
    }),
    // 张力目标条件
    z.object({
      type: z.literal('tension-range'),
      min: z.number().min(0).max(10).optional(),
      max: z.number().min(0).max(10).optional(),
    }),
    // 平台配置条件（番茄/起点等）
    z.object({
      type: z.literal('platform'),
      values: z.array(z.enum(['fanqie', 'qidian', 'auto'])),
    }),
    // 字数范围条件
    z.object({
      type: z.literal('word-count-range'),
      min: z.number().int().positive().optional(),
      max: z.number().int().positive().optional(),
    }),
    // AND 逻辑（所有子条件都满足）
    z.object({
      type: z.literal('and'),
      conditions: z.array(z.lazy(() => AgentSkillTriggerConditionSchema)),
    }),
    // OR 逻辑（任一子条件满足）
    z.object({
      type: z.literal('or'),
      conditions: z.array(z.lazy(() => AgentSkillTriggerConditionSchema)),
    }),
    // NOT 逻辑（条件不满足时触发）
    z.object({
      type: z.literal('not'),
      condition: z.lazy(() => AgentSkillTriggerConditionSchema),
    }),
  ]),
);

export type AgentSkillTriggerCondition =
  | { type: 'chapter-range'; min?: number; max?: number }
  | { type: 'chapter-type'; values: string[] }
  | { type: 'plot-thread'; values: string[] }
  | { type: 'tension-range'; min?: number; max?: number }
  | { type: 'platform'; values: ('fanqie' | 'qidian' | 'auto')[] }
  | { type: 'word-count-range'; min?: number; max?: number }
  | { type: 'and'; conditions: AgentSkillTriggerCondition[] }
  | { type: 'or'; conditions: AgentSkillTriggerCondition[] }
  | { type: 'not'; condition: AgentSkillTriggerCondition };

export const AgentSkillDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(''),
  instruction: z.string().min(1).max(AGENT_SKILL_MAX_INSTRUCTION_CHARS),
  targetRoles: z.array(z.string().min(1)).min(1),
  targetGenres: z.array(z.string().min(1)).default([]),
  priority: z.number().int().min(0).max(100).default(50),
  status: AgentSkillStatusSchema.default('draft'),
  activation: AgentSkillActivationSchema.default('manual'),
  /** 触发条件（仅当 activation='auto' 时生效） */
  triggerCondition: AgentSkillTriggerConditionSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().max(80).optional(),
  updatedBy: z.string().max(80).optional(),
});
export type AgentSkillDefinition = z.infer<typeof AgentSkillDefinitionSchema>;

export const AgentSkillCatalogSchema = z.object({
  version: z.literal(AGENT_SKILL_STORE_VERSION).default(AGENT_SKILL_STORE_VERSION),
  skills: z.array(AgentSkillDefinitionSchema).default([]),
  updatedAt: z.string().datetime(),
});
export type AgentSkillCatalog = z.infer<typeof AgentSkillCatalogSchema>;

export const AgentSkillPolicyScopeSchema = z.object({
  enabledSkillIds: z.array(z.string().uuid()).default([]),
  disabledSkillIds: z.array(z.string().uuid()).default([]),
  roleEnabledSkillIds: z.record(z.string(), z.array(z.string().uuid())).default({}),
  roleDisabledSkillIds: z.record(z.string(), z.array(z.string().uuid())).default({}),
});
export type AgentSkillPolicyScope = z.infer<typeof AgentSkillPolicyScopeSchema>;

export const AgentSkillPolicyStoreSchema = z.object({
  version: z.literal(AGENT_SKILL_STORE_VERSION).default(AGENT_SKILL_STORE_VERSION),
  global: AgentSkillPolicyScopeSchema.default({
    enabledSkillIds: [],
    disabledSkillIds: [],
    roleEnabledSkillIds: {},
    roleDisabledSkillIds: {},
  }),
  novels: z.record(z.string(), AgentSkillPolicyScopeSchema).default({}),
  updatedAt: z.string().datetime(),
});
export type AgentSkillPolicyStore = z.infer<typeof AgentSkillPolicyStoreSchema>;

export type ResolveAgentSkillsParams = {
  novelId: string;
  genre: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
  role: AgentRole;
  chapterNumber?: number;
  promptBudgetChars?: number;
  /** 触发条件评估上下文（用于 auto 技能的条件判断） */
  triggerContext?: {
    chapterType?: string;
    plotThreadsAdvanced?: string[];
    tensionTarget?: number;
    platformProfile?: 'auto' | 'fanqie' | 'qidian';
    maxWordCount?: number;
  };
};

export type ResolvedAgentSkills = {
  role: AgentRole;
  novelId: string;
  genre: string;
  matchedSkills: AgentSkillDefinition[];
  selectedSkills: AgentSkillDefinition[];
  systemPromptAppendix: string;
  droppedByBudget: number;
};

export const AgentSkillExecutionRecordSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  novelId: z.string().min(1),
  genre: z.string().min(1),
  role: z.string().min(1),
  chapterNumber: z.number().int().positive().optional(),
  skillIds: z.array(z.string().uuid()).default([]),
  droppedByBudget: z.number().int().min(0).default(0),
  inputChars: z.number().int().min(0).default(0),
  outputChars: z.number().int().min(0).default(0),
  latencyMs: z.number().int().min(0).optional(),
  modelProvider: z.string().optional(),
  modelName: z.string().optional(),
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  totalTokens: z.number().int().min(0).optional(),
  success: z.boolean().default(true),
  errorMessage: z.string().optional(),
});
export type AgentSkillExecutionRecord = z.infer<typeof AgentSkillExecutionRecordSchema>;

export const AgentSkillEffectStoreSchema = z.object({
  version: z.literal(AGENT_SKILL_STORE_VERSION).default(AGENT_SKILL_STORE_VERSION),
  records: z.array(AgentSkillExecutionRecordSchema).default([]),
  updatedAt: z.string().datetime(),
});
export type AgentSkillEffectStore = z.infer<typeof AgentSkillEffectStoreSchema>;

export type AgentSkillEffectsSummary = {
  rangeDays: number;
  totalRuns: number;
  runsWithSkills: number;
  adoptionRate: number;
  avgInputChars: number;
  avgOutputChars: number;
  avgLatencyMs: number;
  avgSkillsPerRun: number;
  byRole: Array<{
    role: string;
    runs: number;
    runsWithSkills: number;
    adoptionRate: number;
    avgOutputChars: number;
    avgLatencyMs: number;
  }>;
  topSkills: Array<{
    skillId: string;
    skillName: string;
    runs: number;
    share: number;
  }>;
};

export type AgentSkillTrendDataPoint = {
  date: string;
  totalRuns: number;
  runsWithSkills: number;
  adoptionRate: number;
  avgOutputChars: number;
  avgLatencyMs: number;
  avgSkillsPerRun: number;
};

export type AgentSkillEffectsTrend = {
  rangeDays: number;
  dataPoints: AgentSkillTrendDataPoint[];
};

export type AgentSkillComparisonMetrics = {
  runs: number;
  adoptionRate: number;
  avgOutputChars: number;
  avgLatencyMs: number;
  avgSkillsPerRun: number;
};

export type AgentSkillComparison = {
  skillAId: string;
  skillAName: string;
  skillBId: string;
  skillBName: string;
  rangeDays: number;
  skillA: AgentSkillComparisonMetrics;
  skillB: AgentSkillComparisonMetrics;
  delta: {
    runs: number;
    adoptionRate: number;
    avgOutputChars: number;
    avgLatencyMs: number;
    avgSkillsPerRun: number;
  };
};

export type QualityCorrelationDataPoint = {
  skillCount: number;
  chapterCount: number;
  avgQualityScore: number;
  avgStructureScore: number;
  avgStyleScore: number;
  avgEmotionScore: number;
};

export type AgentSkillQualityCorrelation = {
  rangeDays: number;
  totalChapters: number;
  dataPoints: QualityCorrelationDataPoint[];
  correlation: {
    overall: number;
    structure: number;
    style: number;
    emotion: number;
  };
  summary: string;
};

export type AgentSkillVersion = {
  versionId: string;
  skillId: string;
  name: string;
  description: string;
  instruction: string;
  targetRoles: string[];
  targetGenres: string[];
  priority: number;
  status: AgentSkillStatus;
  activation: AgentSkillActivation;
  tags: string[];
  triggerCondition?: AgentSkillTriggerCondition;
  createdAt: string;
  createdBy?: string;
  changeNote?: string;
};

export type AgentSkillVersionHistory = {
  skillId: string;
  currentVersion: string;
  versions: AgentSkillVersion[];
};

export type AgentSkillVersionDiff = {
  versionAId: string;
  versionBId: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
    changeType: 'added' | 'removed' | 'modified';
  }[];
};

export function createDefaultAgentSkillCatalog(): AgentSkillCatalog {
  return {
    version: AGENT_SKILL_STORE_VERSION,
    skills: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyPolicyScope(): AgentSkillPolicyScope {
  return {
    enabledSkillIds: [],
    disabledSkillIds: [],
    roleEnabledSkillIds: {},
    roleDisabledSkillIds: {},
  };
}

export function createDefaultAgentSkillPolicyStore(): AgentSkillPolicyStore {
  return {
    version: AGENT_SKILL_STORE_VERSION,
    global: createEmptyPolicyScope(),
    novels: {},
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultAgentSkillEffectStore(): AgentSkillEffectStore {
  return {
    version: AGENT_SKILL_STORE_VERSION,
    records: [],
    updatedAt: new Date().toISOString(),
  };
}
