import { z } from 'zod';

/**
 * 短篇小说专用类型定义
 * 支持 2-3万字、20章内的快节奏爽文创作
 */

// ==================== 付费点配置 ====================

/** 付费点类型 */
export const PaywallType = z.enum([
  'chapter',    // 按章节设置（如第3章开始付费）
  'percentage', // 按全文百分比（如20%后付费）
  'wordCount',  // 按字数（如5000字后付费）
]);
export type PaywallType = z.infer<typeof PaywallType>;

/** 付费点配置 */
export const PaywallConfig = z.object({
  enabled: z.boolean().default(true),
  type: PaywallType.default('chapter'),

  /** 按章节：免费章节数（如前2章免费） */
  freeChapters: z.number().int().min(0).max(10).optional(),

  /** 按百分比：免费阅读百分比（如前20%免费） */
  freePercentage: z.number().min(0).max(100).optional(),

  /** 按字数：免费字数（如前5000字免费） */
  freeWordCount: z.number().int().min(0).optional(),

  /** 付费点提示文案（可选） */
  paywallMessage: z.string().default('精彩内容，解锁继续阅读'),
});
export type PaywallConfig = z.infer<typeof PaywallConfig>;

// ==================== 短篇蓝图 ====================

/** 短篇题材模板 */
export const ShortStoryTemplate = z.enum([
  'son-in-law',      // 都市赘婿逆袭
  'rebirth-revenge', // 重生复仇
  'fast-cultivation',// 玄幻速成
  'ceo-romance',     // 霸总甜宠
  'system-upgrade',  // 系统流升级
  'face-slapping',   // 打脸爽文
  'custom',          // 自定义
]);
export type ShortStoryTemplate = z.infer<typeof ShortStoryTemplate>;

/** 爽点密度 */
export const PayoffDensity = z.enum([
  'high',    // 高密度：每章2个爽点
  'extreme', // 极致密度：每章3+个爽点
]);
export type PayoffDensity = z.infer<typeof PayoffDensity>;

/** 节奏模式 */
export const PaceMode = z.enum([
  'fast',       // 快节奏：正常短篇节奏
  'ultra-fast', // 超快节奏：极速推进，无铺垫
]);
export type PaceMode = z.infer<typeof PaceMode>;

/** 短篇核心钩子 */
export const ShortStoryHook = z.object({
  /** 开局第一爽点（必须在前500字内） */
  openingPunch: z.string().min(10).max(200),

  /** 核心循环公式（如"打脸→升级→再打脸"） */
  coreLoop: z.string().min(10).max(200),

  /** 高潮链设计（最后5章的爽点序列） */
  climaxChain: z.string().min(20).max(300),

  /** 章末钩子策略（如何让读者点下一章） */
  chapterEndStrategy: z.string().min(1).default('悬念型为主，危机型为辅'),
});
export type ShortStoryHook = z.infer<typeof ShortStoryHook>;

/** 短篇主角设定 */
export const ShortStoryProtagonist = z.object({
  name: z.string().min(1).max(20),

  /** 起始状态（如"被羞辱的赘婿"） */
  startState: z.string().min(5).max(100),

  /** 结局状态（如"商业帝国掌控者"） */
  endState: z.string().min(5).max(100),

  /** 金手指/外挂（如"透视眼"、"重生记忆"、"系统"） */
  goldFinger: z.string().min(3).max(100),

  /** 核心目标（如"复仇"、"证明自己"、"守护家人"） */
  coreGoal: z.string().default(''),
});
export type ShortStoryProtagonist = z.infer<typeof ShortStoryProtagonist>;

/** 短篇反派设定 */
export const ShortStoryAntagonist = z.object({
  name: z.string().min(1).max(20),

  /** 角色定位（如"前妻"、"岳母"、"情敌"、"商业对手"） */
  role: z.string().min(2).max(50),

  /** 被打脸的章节号 */
  defeatChapter: z.number().int().min(1).max(20),

  /** 打脸方式（如"身份曝光"、"实力碾压"、"跪求原谅"） */
  defeatMethod: z.string().default(''),
});
export type ShortStoryAntagonist = z.infer<typeof ShortStoryAntagonist>;

/** 短篇蓝图（完整配置） */
export const ShortStoryBlueprint = z.object({
  // ===== 字数与章节规划 =====
  /** 目标总字数（15000-35000） */
  targetWordCount: z.number().int().min(15000).max(35000).default(25000),

  /** 目标章节数（5-20章） */
  targetChapters: z.number().int().min(5).max(20).default(18),

  /** 单章目标字数（自动计算，也可手动覆盖） */
  chapterWordCount: z.number().int().min(1000).max(3500).optional(),

  // ===== 付费点配置 =====
  paywall: PaywallConfig.default({
    enabled: true,
    type: 'chapter',
    freeChapters: 2,
  }),

  // ===== 题材与风格 =====
  /** 题材模板 */
  template: ShortStoryTemplate.default('custom'),

  /** 爽点密度 */
  payoffDensity: PayoffDensity.default('extreme'),

  /** 节奏模式 */
  paceMode: PaceMode.default('ultra-fast'),

  /** 风格指南（如"番茄风格：短句+密集对话"） */
  styleGuide: z.string().default('短句为主，对话占比60%+，密集爽点'),

  // ===== 核心设定 =====
  hook: ShortStoryHook,
  protagonist: ShortStoryProtagonist,
  antagonists: z.array(ShortStoryAntagonist).default([]),

  // ===== 禁忌规则 =====
  /** 禁止的元素（如"支线剧情"、"大段环境描写"） */
  forbidden: z.array(z.string()).default([
    '支线剧情',
    '大段环境描写',
    '冗长心理活动',
    '慢节奏铺垫',
  ]),

  // ===== 元数据 =====
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ShortStoryBlueprint = z.infer<typeof ShortStoryBlueprint>;

// ==================== 短篇章节扩展 ====================

/** 短篇章节元数据（扩展标准 Chapter） */
export const ShortStoryChapterMeta = z.object({
  /** 是否为付费章节 */
  isPaid: z.boolean().default(false),

  /** 爽点计数（本章实际爽点数） */
  payoffCount: z.number().int().min(0).default(0),

  /** 章末钩子类型 */
  endHookType: z.enum(['suspense', 'crisis', 'reversal', 'choice', 'anticipation']).optional(),

  /** 章末钩子强度评分（0-10） */
  endHookStrength: z.number().min(0).max(10).optional(),

  /** 对话占比（0-1） */
  dialogueRatio: z.number().min(0).max(1).optional(),

  /** 字数达标情况 */
  wordCountStatus: z.enum(['under', 'perfect', 'over']).optional(),
});
export type ShortStoryChapterMeta = z.infer<typeof ShortStoryChapterMeta>;

// ==================== 短篇生成结果 ====================

/** 短篇生成进度 */
export const ShortStoryProgress = z.object({
  currentChapter: z.number().int().min(0),
  totalChapters: z.number().int().min(1),
  currentWordCount: z.number().int().min(0),
  targetWordCount: z.number().int().min(1),
  estimatedCompletion: z.number().min(0).max(100), // 百分比
});
export type ShortStoryProgress = z.infer<typeof ShortStoryProgress>;

/** 短篇质量报告 */
export const ShortStoryQualityReport = z.object({
  /** 总体评分（0-10） */
  overallScore: z.number().min(0).max(10),

  /** 爽点密度达标率 */
  payoffDensityScore: z.number().min(0).max(10),

  /** 节奏控制评分 */
  paceScore: z.number().min(0).max(10),

  /** 章末钩子平均强度 */
  avgHookStrength: z.number().min(0).max(10),

  /** 字数控制精度（偏差百分比） */
  wordCountAccuracy: z.number().min(0).max(100),

  /** 故事完整性评分 */
  completenessScore: z.number().min(0).max(10),

  /** 问题列表 */
  issues: z.array(z.object({
    chapter: z.number().int().optional(),
    type: z.string(),
    message: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
  })).default([]),
});
export type ShortStoryQualityReport = z.infer<typeof ShortStoryQualityReport>;
