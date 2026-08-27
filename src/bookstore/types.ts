import { z } from 'zod';
import { sanitizeTextField } from '../utils/sanitize-input.js';
import {
  BookStoreSortSchema,
  normalizeBookStoreSort,
} from './storefront-types.js';

const PublishStatusSchema = z.enum(['draft', 'pending', 'approved', 'rejected', 'offline']);
export type PublishStatus = z.infer<typeof PublishStatusSchema>;

const AuditStatusSchema = z.enum(['pending', 'pass', 'reject', 'manual_review']);
export type AuditStatus = z.infer<typeof AuditStatusSchema>;

const CoverAuditStatusSchema = z.enum(['pending_review', 'pass', 'reject']);
export type CoverAuditStatus = z.infer<typeof CoverAuditStatusSchema>;

const ViolationTypeSchema = z.enum(['porn', 'violence', 'politics', 'terrorism', 'abuse', 'ad', 'other']);
export type ViolationType = z.infer<typeof ViolationTypeSchema>;

const ReportTypeSchema = z.enum(['porn', 'violence', 'politics', 'plagiarism', 'ad', 'other']);
export type ReportType = z.infer<typeof ReportTypeSchema>;

const ReportStatusSchema = z.enum(['pending', 'processing', 'resolved', 'rejected']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

const BanTypeSchema = z.enum(['warning', 'temp_ban', 'permanent_ban']);
export type BanType = z.infer<typeof BanTypeSchema>;

const ViolationSchema = z.object({
  type: ViolationTypeSchema,
  confidence: z.number().min(0).max(100),
  position: z.object({
    chapterId: z.string().optional(),
    start: z.number(),
    end: z.number(),
  }),
  keyword: z.string().optional(),
  context: z.string(),
});
export type Violation = z.infer<typeof ViolationSchema>;

const AuditResultDetailSchema = z.object({
  violations: z.array(ViolationSchema),
  overallScore: z.number().min(0).max(100),
  suggestion: z.enum(['pass', 'review', 'block']),
});
export type AuditResultDetail = z.infer<typeof AuditResultDetailSchema>;

const PublishedChapterStatusSchema = z.enum([
  'scheduled',
  'pending_audit',
  'published',
  'hidden',
]);
export type PublishedChapterStatus = z.infer<typeof PublishedChapterStatusSchema>;

const PublishedChapterSchema = z.object({
  chapterNumber: z.number(),
  contentHash: z.string(),
  status: PublishedChapterStatusSchema,
  scheduledAt: z.date().optional(),
  submittedAt: z.date(),
  publishedAt: z.date().optional(),
  wordCount: z.number().optional(), // 存入以便书城列表免 listChapters 调用
  title: z.string().optional(),     // 同上
});
export type PublishedChapter = z.infer<typeof PublishedChapterSchema>;

const BookAutoUpdateJobStatusSchema = z.enum([
  'pending',
  'running',
  'submitted',
  'failed',
]);
export type BookAutoUpdateJobStatus = z.infer<typeof BookAutoUpdateJobStatusSchema>;

const BookAutoUpdateJobSchema = z.object({
  id: z.string(),
  chapterNumber: z.number().int().positive(),
  scheduledAt: z.date(),
  status: BookAutoUpdateJobStatusSchema,
  generatedChapter: z.boolean().default(false),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
  error: z.string().optional(),
});
export type BookAutoUpdateJob = z.infer<typeof BookAutoUpdateJobSchema>;

const BookAutoUpdateConfigSchema = z.object({
  enabled: z.boolean().default(false),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  timezone: z.string().default('Asia/Shanghai'),
  maxWordCount: z.number().int().min(800).max(20000).optional(),
  userDirection: z.string().default(''),
  updatedAt: z.date(),
  updatedBy: z.string(),
  lastPlannedAt: z.date().optional(),
  lastRunAt: z.date().optional(),
  lastSuccessAt: z.date().optional(),
  lastError: z.string().optional(),
  queue: z.array(BookAutoUpdateJobSchema).default([]),
  history: z.array(BookAutoUpdateJobSchema).default([]),
});
export type BookAutoUpdateConfig = z.infer<typeof BookAutoUpdateConfigSchema>;

const BookStoreCommentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  username: z.string(),
  authorName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BookStoreComment = z.infer<typeof BookStoreCommentSchema>;

const BookStoreUserCommentSchema = z.object({
  bookId: z.string(),
  bookTitle: z.string(),
  bookCover: z.string(),
  bookCategory: z.string(),
  commentId: z.string(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BookStoreUserComment = z.infer<typeof BookStoreUserCommentSchema>;

const BookStoreSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  userId: z.string(),
  publishStatus: PublishStatusSchema,
  title: z.string(),
  cover: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  publishTime: z.date(),
  updateTime: z.date(),
  viewCount: z.number().default(0),
  likeCount: z.number().default(0),
  likedBy: z.array(z.string()).default([]),
  favoriteCount: z.number().default(0),
  favoritedBy: z.array(z.string()).default([]),
  commentCount: z.number().default(0),
  comments: z.array(BookStoreCommentSchema).default([]),
  auditStatus: AuditStatusSchema,
  auditResult: AuditResultDetailSchema.optional(),
  auditTime: z.date().optional(),
  offlineReason: z.string().optional(),
  offlineTime: z.date().optional(),
  coverAuditStatus: CoverAuditStatusSchema.default('pending_review'),
  coverLocked: z.boolean().default(false),
  coverAuditRejectReason: z.string().optional(),
  publishedChapters: z.array(PublishedChapterSchema).default([]),
  autoUpdate: BookAutoUpdateConfigSchema.optional(),
});
export type BookStore = z.infer<typeof BookStoreSchema>;

const ContentAuditSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string().optional(),
  content: z.string(),
  auditType: z.enum(['auto', 'manual']),
  status: AuditStatusSchema,
  result: AuditResultDetailSchema,
  auditorId: z.string().optional(),
  auditTime: z.date(),
  provider: z.string(),
});
export type ContentAudit = z.infer<typeof ContentAuditSchema>;

const ReportSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string().optional(),
  reporterId: z.string(),
  reportType: ReportTypeSchema,
  reason: z.string(),
  evidence: z.array(z.string()).optional(),
  violationPosition: z.object({
    chapterId: z.string(),
    paragraph: z.number(),
  }).optional(),
  status: ReportStatusSchema,
  handlerId: z.string().optional(),
  handleResult: z.string().optional(),
  handleTime: z.date().optional(),
  createTime: z.date(),
});
export type Report = z.infer<typeof ReportSchema>;

const UserBanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  banType: BanTypeSchema,
  reason: z.string(),
  relatedNovelId: z.string().optional(),
  relatedReportId: z.string().optional(),
  operatorId: z.string(),
  startTime: z.date(),
  endTime: z.date().optional(),
  isActive: z.boolean(),
});
export type UserBan = z.infer<typeof UserBanSchema>;

const AuditLogSchema = z.object({
  id: z.string(),
  operatorId: z.string(),
  action: z.string(),
  targetType: z.enum(['novel', 'chapter', 'user']),
  targetId: z.string(),
  reason: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const PublishBookRequestSchema = z.object({
  novelId: z.string(),
  category: z.string().transform(sanitizeTextField),
  tags: z.array(z.string().transform(sanitizeTextField)),
  description: z.string().transform(sanitizeTextField).optional(),
});
export type PublishBookRequest = z.infer<typeof PublishBookRequestSchema>;

export const UpdateBookRequestSchema = z.object({
  title: z.string().transform(sanitizeTextField).optional(),
  description: z.string().transform(sanitizeTextField).optional(),
  cover: z.string().optional(),
  tags: z.array(z.string().transform(sanitizeTextField)).optional(),
});
export type UpdateBookRequest = z.infer<typeof UpdateBookRequestSchema>;

export const ScheduleChapterPublishRequestSchema = z.object({
  scheduledAt: z.string().datetime(),
});
export type ScheduleChapterPublishRequest = z.infer<typeof ScheduleChapterPublishRequestSchema>;

export const BatchPublishChaptersRequestSchema = z.object({
  chapterNumbers: z.array(z.number().int().min(1)).min(1).max(200),
});
export type BatchPublishChaptersRequest = z.infer<typeof BatchPublishChaptersRequestSchema>;

export const BatchScheduleChaptersRequestSchema = z.object({
  items: z.array(z.object({
    chapterNumber: z.number().int().min(1),
    scheduledAt: z.string().datetime(),
  })).min(1).max(200),
});
export type BatchScheduleChaptersRequest = z.infer<typeof BatchScheduleChaptersRequestSchema>;

export const BookAutoUpdateConfigRequestSchema = z.object({
  enabled: z.boolean(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, '更新时间必须使用 HH:mm 格式'),
  timezone: z.string().default('Asia/Shanghai'),
  maxWordCount: z.number().int().min(800).max(20000).optional(),
  userDirection: z.string().max(500, '更新指令不能超过 500 字').default(''),
});
export type BookAutoUpdateConfigRequest = z.infer<typeof BookAutoUpdateConfigRequestSchema>;

export const CreateBookCommentRequestSchema = z.object({
  content: z.string().trim().min(2, '评论至少 2 个字').max(300, '评论不能超过 300 个字').transform(sanitizeTextField),
});
export type CreateBookCommentRequest = z.infer<typeof CreateBookCommentRequestSchema>;

const SubmitAuditRequestSchema = z.object({
  novelId: z.string(),
  chapterIds: z.array(z.string()).optional(),
});
export type SubmitAuditRequest = z.infer<typeof SubmitAuditRequestSchema>;

export const SubmitReportRequestSchema = z.object({
  novelId: z.string(),
  chapterId: z.string().optional(),
  reportType: ReportTypeSchema,
  reason: z.string().min(10),
  evidence: z.array(z.string()).optional(),
  violationPosition: z.object({
    chapterId: z.string(),
    paragraph: z.number(),
  }).optional(),
  // 实名信息（防机器人）
  reporterName: z.string().min(2),
  reporterPhone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号'),
  reporterEmail: z.string().email('请输入正确的邮箱地址'),
  // 滑动验证码
  sliderCaptcha: z.object({
    challengeId: z.string(),
    position: z.number(),
    duration: z.number(),
  }),
});
export type SubmitReportRequest = z.infer<typeof SubmitReportRequestSchema>;

export const HandleReportRequestSchema = z.object({
  action: z.enum(['offline_book', 'ban_user', 'warning', 'reject']),
  reason: z.string(),
  banDuration: z.number().optional(),
});
export type HandleReportRequest = z.infer<typeof HandleReportRequestSchema>;

export const BanUserRequestSchema = z.object({
  userId: z.string(),
  banType: BanTypeSchema,
  reason: z.string(),
  duration: z.number().optional(),
  relatedNovelId: z.string().optional(),
  relatedReportId: z.string().optional(),
});
export type BanUserRequest = z.infer<typeof BanUserRequestSchema>;

export const OfflineRequestSchema = z.object({
  novelId: z.string(),
  chapterId: z.string().optional(),
  reason: z.string(),
});
export type OfflineRequest = z.infer<typeof OfflineRequestSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const BookStoreListQuerySchema = PaginationQuerySchema.extend({
  category: z.string().optional(),
  tags: z.string().optional(),
  sort: z.preprocess((value) => normalizeBookStoreSort(value), BookStoreSortSchema.optional()),
  keyword: z.string().optional(),
});
export type BookStoreListQuery = z.infer<typeof BookStoreListQuerySchema>;

export const ReportListQuerySchema = PaginationQuerySchema.extend({
  status: ReportStatusSchema.optional(),
  reportType: ReportTypeSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ReportListQuery = z.infer<typeof ReportListQuerySchema>;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
