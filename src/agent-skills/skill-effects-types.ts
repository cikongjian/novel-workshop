import { z } from 'zod';

/**
 * 技能效果追踪数据结构
 * 用于记录技能使用情况和效果数据
 */

export const QualityScore = z.object({
  overall: z.number().min(0).max(100),
  structure: z.number().min(0).max(100),
  style: z.number().min(0).max(100),
  emotion: z.number().min(0).max(100),
});
export type QualityScore = z.infer<typeof QualityScore>;

export const UserFeedback = z.enum(['helpful', 'neutral', 'unhelpful']);
export type UserFeedback = z.infer<typeof UserFeedback>;

export const SkillEffectRecord = z.object({
  id: z.string().uuid(),
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  /** 应用的技能 ID 列表 */
  appliedSkills: z.array(z.string().uuid()),
  /** 应用技能前的质量分数（如果有） */
  qualityBefore: QualityScore.optional(),
  /** 应用技能后的质量分数 */
  qualityAfter: QualityScore,
  /** 用户反馈 */
  userFeedback: UserFeedback.optional(),
  /** 生成时的 Agent 角色 */
  agentRole: z.string(),
  /** 记录创建时间 */
  createdAt: z.string().datetime(),
  /** 最后更新时间 */
  updatedAt: z.string().datetime(),
});
export type SkillEffectRecord = z.infer<typeof SkillEffectRecord>;

export const SkillEffectsData = z.object({
  records: z.array(SkillEffectRecord).default([]),
});
export type SkillEffectsData = z.infer<typeof SkillEffectsData>;
