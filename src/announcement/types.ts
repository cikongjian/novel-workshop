import { z } from 'zod';

// ==================== 公告类型 ====================

export const AnnouncementType = z.enum([
  'info',      // 普通信息
  'warning',   // 警告
  'success',   // 成功/好消息
  'error',     // 错误/紧急
  'feature',   // 新功能
  'maintenance', // 维护通知
]);
export type AnnouncementType = z.infer<typeof AnnouncementType>;

export const AnnouncementStatus = z.enum([
  'draft',     // 草稿
  'published', // 已发布
  'archived',  // 已归档
]);
export type AnnouncementStatus = z.infer<typeof AnnouncementStatus>;

export const AnnouncementPriority = z.enum([
  'low',       // 低优先级
  'normal',    // 普通
  'high',      // 高优先级（置顶）
  'urgent',    // 紧急（强制弹窗）
]);
export type AnnouncementPriority = z.infer<typeof AnnouncementPriority>;

// ==================== 公告数据模型 ====================

export const Announcement = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  type: AnnouncementType,
  priority: AnnouncementPriority,
  status: AnnouncementStatus,

  /** 是否在顶部横幅显示 */
  showInBanner: z.boolean().default(false),
  /** 是否弹窗显示（仅 urgent 优先级生效） */
  showInModal: z.boolean().default(false),
  /** 是否在仪表盘显示 */
  showInDashboard: z.boolean().default(true),

  /** 目标用户角色（空数组表示所有用户） */
  targetRoles: z.array(z.enum(['admin', 'user'])).default([]),

  /** 发布时间（ISO 8601） */
  publishedAt: z.string().datetime().optional(),
  /** 过期时间（ISO 8601，过期后自动归档） */
  expiresAt: z.string().datetime().optional(),

  /** 创建者用户 ID */
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Announcement = z.infer<typeof Announcement>;

// ==================== 用户已读记录 ====================

export const AnnouncementReadRecord = z.object({
  announcementId: z.string().uuid(),
  userId: z.string(),
  readAt: z.string().datetime(),
});
export type AnnouncementReadRecord = z.infer<typeof AnnouncementReadRecord>;

// ==================== API 请求/响应类型 ====================

export const CreateAnnouncementRequest = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  type: AnnouncementType,
  priority: AnnouncementPriority,
  showInBanner: z.boolean().default(false),
  showInModal: z.boolean().default(false),
  showInDashboard: z.boolean().default(true),
  targetRoles: z.array(z.enum(['admin', 'user'])).default([]),
  expiresAt: z.string().datetime().optional(),
});
export type CreateAnnouncementRequest = z.infer<typeof CreateAnnouncementRequest>;

export const UpdateAnnouncementRequest = CreateAnnouncementRequest.partial();
export type UpdateAnnouncementRequest = z.infer<typeof UpdateAnnouncementRequest>;

export const ListAnnouncementsQuery = z.object({
  status: AnnouncementStatus.optional(),
  type: AnnouncementType.optional(),
  priority: AnnouncementPriority.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type ListAnnouncementsQuery = z.infer<typeof ListAnnouncementsQuery>;

export const AnnouncementWithReadStatus = Announcement.extend({
  isRead: z.boolean(),
});
export type AnnouncementWithReadStatus = z.infer<typeof AnnouncementWithReadStatus>;
