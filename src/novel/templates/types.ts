/**
 * 题材模板类型定义
 * 每种题材提供世界观分类、预设条目、Agent 特化提示词和结构建议
 */

/** 题材写作规则（用于 AI 痕迹检测和审计维度的类型特定阈值） */
export type GenreWritingRules = {
  /** 该题材的禁忌套路/短语 */
  prohibitions: string[];
  /** 疲劳词限制：每 3000 字最大出现次数 */
  fatigueWords: Array<{ word: string; maxPer3000Chars: number }>;
  /** 风格强制要求（注入 Writer/Editor prompt） */
  styleImperatives: string[];
  /** 审计维度权重覆盖（Phase 3 使用） */
  auditDimensionWeights?: Record<string, number>;
};

export type GenreTemplate = {
  /** 题材标识（与 NovelGenre 对应） */
  genre: string;
  /** 题材中文名称 */
  name: string;
  /** 该题材常用的世界观分类 */
  worldCategories: string[];
  /** 预设的世界观条目（提示用户需要填写什么） */
  defaultWorldEntries: {
    category: string;
    name: string;
    description: string;
  }[];
  /** 每个 Agent 角色的题材特化提示词（中文） */
  agentAugmentations: Record<string, string>;
  /** 故事结构建议 */
  structureSuggestions: string[];
  /** 题材写作规则（可选，用于 AI 痕迹检测和质量审计） */
  writingRules?: GenreWritingRules;
};
