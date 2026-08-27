/**
 * 分叉（抱走）记录类型与配置。
 * 与 NovelMetadata.forkedFrom 不同，ForkRecord 是平台级的、可反向查询的记录。
 */
import { z } from 'zod';

/** 抱走权限模式 */
export const ForkPermission = z.enum(['all', 'followers', 'closed']);
export type ForkPermission = z.infer<typeof ForkPermission>;

/** 单条分叉记录 */
export const ForkRecord = z.object({
  id: z.string(),
  /** 源作品 ID */
  originalNovelId: z.string(),
  /** 源作品标题（冗余存储，避免源作删除后无法展示） */
  originalTitle: z.string().default(''),
  /** 分叉出来的新作品 ID */
  forkedNovelId: z.string(),
  /** 分叉点章节号 */
  fromChapter: z.number().int().positive(),
  /** 发起分叉的用户 ID */
  forkedBy: z.string(),
  /** 发起分叉的用户名（冗余存储） */
  forkedByName: z.string().default(''),
  /** 是否公开（公开的分叉会出现在原作的故事树中） */
  isPublic: z.boolean().default(true),
  createdAt: z.string().datetime(),
});
export type ForkRecord = z.infer<typeof ForkRecord>;

/** 作品级分叉配置 */
export const ForkConfig = z.object({
  novelId: z.string(),
  /** 是否允许抱走 */
  allowFork: z.boolean().default(true),
  /** 权限模式：all=任何人 / followers=仅关注者 / closed=关闭 */
  permission: ForkPermission.default('all'),
  /** 章节模式：all=全部章节 / selected=仅指定章节 */
  chapterMode: z.enum(['all', 'selected']).default('all'),
  /** 允许抱走的章节号列表（仅 chapterMode=selected 时生效） */
  allowedChapters: z.array(z.number().int().positive()).default([]),
  /** 作者寄语（分叉时展示给读者） */
  authorNote: z.string().default(''),
  updatedAt: z.string().datetime(),
});
export type ForkConfig = z.infer<typeof ForkConfig>;

/** 分叉作品发布审批状态 */
export const ForkPublishStatus = z.enum(['pending', 'approved', 'rejected', 'expired']);
export type ForkPublishStatus = z.infer<typeof ForkPublishStatus>;

/** 分叉作品发布审批申请 */
export const ForkPublishRequest = z.object({
  id: z.string(),
  /** 分叉出来的新作品 ID */
  forkedNovelId: z.string(),
  /** 分叉作品当前标题（申请时快照） */
  forkedTitle: z.string(),
  /** 源作品 ID */
  originalNovelId: z.string(),
  /** 源作品标题 */
  originalTitle: z.string(),
  /** 源作品封面（用于校验是否更换） */
  originalCover: z.string().default(''),
  /** 分叉作品封面（申请时快照） */
  forkedCover: z.string().default(''),
  /** 申请人 ID */
  requesterId: z.string(),
  /** 申请人昵称 */
  requesterName: z.string().default(''),
  /** 申请理由 */
  message: z.string().default(''),
  /** 审批状态 */
  status: ForkPublishStatus.default('pending'),
  /** 审批人 ID（原作者） */
  reviewerId: z.string().default(''),
  /** 审批意见 */
  reviewComment: z.string().default(''),
  /** 申请时间 */
  createdAt: z.string().datetime(),
  /** 审批时间 */
  reviewedAt: z.string().datetime().optional(),
});

/** 分叉统计 */
export const ForkStats = z.object({
  total: z.number().int(),
  publicCount: z.number().int(),
  privateCount: z.number().int(),
  /** 各章节抱走数 */
  byChapter: z.array(z.object({
    chapter: z.number().int(),
    count: z.number().int(),
  })),
  /** 最近一次抱走时间 */
  latestForkAt: z.string().nullable(),
});
export type ForkStats = z.infer<typeof ForkStats>;
export type ForkPublishRequest = z.infer<typeof ForkPublishRequest>;
