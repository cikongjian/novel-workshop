import { z } from 'zod';

// ==================== 宪章条款类别 ====================

export const CONSTITUTION_CLAUSE_CATEGORIES = [
  'core-promise',     // 核心承诺（这本书卖什么）
  'payoff-rhythm',    // 爽点节奏（多久给一次回报、什么类型的回报）
  'scene-mandate',    // 必写场景（题材标志性场景）
  'anti-drift',       // 防偏约束（禁止偏向什么方向）
  'tone-guide',       // 基调指南（情绪基调、文风倾向）
  'pacing-rule',      // 节奏规则（场景切换频率、对话/叙述比例）
] as const;

export type ConstitutionClauseCategory = typeof CONSTITUTION_CLAUSE_CATEGORIES[number];

export const CONSTITUTION_CLAUSE_CATEGORY_LABELS: Record<ConstitutionClauseCategory, string> = {
  'core-promise': '核心承诺',
  'payoff-rhythm': '爽点节奏',
  'scene-mandate': '必写场景',
  'anti-drift': '防偏约束',
  'tone-guide': '基调指南',
  'pacing-rule': '节奏规则',
};

// ==================== 宪章条款 ====================

export const ConstitutionClause = z.object({
  /** 条款唯一标识 */
  id: z.string().uuid(),
  /** 条款类别 */
  category: z.enum(CONSTITUTION_CLAUSE_CATEGORIES),
  /** 条款标题（简短，如"每章至少一次职场反杀"） */
  title: z.string().min(1).max(80),
  /** 条款正文（详细描述，注入 Agent 提示词） */
  content: z.string().min(1).max(600),
  /** AI 生成时的建议依据（告诉用户为什么建议这条） */
  rationale: z.string().max(300).default(''),
  /** 优先级：high 条款必须执行，medium 建议执行，low 可选参考 */
  priority: z.enum(['high', 'medium', 'low']).default('high'),
  /** 是否由用户手动修改过 */
  userEdited: z.boolean().default(false),
});
export type ConstitutionClause = z.infer<typeof ConstitutionClause>;

// ==================== 宪章关键词（门禁检测共用） ====================

export const ConstitutionKeywords = z.object({
  /** 题材回报关键词（命中越多说明越对路） */
  payoffKeywords: z.array(z.string()).default([]),
  /** 题材场景关键词 */
  sceneKeywords: z.array(z.string()).default([]),
  /** 悬疑漂移关键词（命中越多说明越偏） */
  suspenseDriftKeywords: z.array(z.string()).default([]),
  /** 悬念占比上限（0-1），超过此值门禁判定为漂移 */
  maxSuspenseShare: z.number().min(0).max(1).default(0.5),
});
export type ConstitutionKeywords = z.infer<typeof ConstitutionKeywords>;

// ==================== 完整小说宪章 ====================

export const NovelConstitution = z.object({
  /** 宪章版本号（每次重新生成 +1） */
  version: z.number().int().positive().default(1),
  /** 生成此宪章时的输入摘要哈希（用于判断是否需要重新生成） */
  sourceDigest: z.string().default(''),
  /** 核心承诺（一句话概括这本书卖什么） */
  mainPromise: z.string().min(1).max(200),
  /** 副承诺列表 */
  secondaryPromises: z.array(z.string()).default([]),
  /** 所有条款 */
  clauses: z.array(ConstitutionClause).default([]),
  /** 关键词配置（门禁检测 + Agent 提示词共用同一份） */
  keywords: ConstitutionKeywords.default({}),
  /** 生成时间 */
  generatedAt: z.string().datetime(),
  /** 最后修改时间 */
  updatedAt: z.string().datetime(),
});
export type NovelConstitution = z.infer<typeof NovelConstitution>;
