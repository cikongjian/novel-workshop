// 书城相关类型定义

export type PublishStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'offline';
export type AuditStatus = 'pending' | 'pass' | 'reject' | 'manual_review';
export type ViolationType = 'porn' | 'violence' | 'politics' | 'terrorism' | 'abuse' | 'ad' | 'other';
export type ReportType = 'porn' | 'violence' | 'politics' | 'plagiarism' | 'ad' | 'other';
export type ReportStatus = 'pending' | 'processing' | 'resolved' | 'rejected';
export interface Violation {
  type: ViolationType;
  confidence: number;
  position: {
    chapterId?: string;
    start: number;
    end: number;
  };
  keyword?: string;
  context: string;
}

export interface AuditResultDetail {
  violations: Violation[];
  overallScore: number;
  suggestion: 'pass' | 'review' | 'block';
}

export interface BookStore {
  id: string;
  novelId: string;
  userId: string;
  publishStatus: PublishStatus;
  title: string;
  cover: string;
  coverUrl?: string;
  description: string;
  category: string;
  tags: string[];
  publishTime: Date;
  updateTime: Date;
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  auditStatus: AuditStatus;
  auditResult?: AuditResultDetail;
  auditTime?: Date;
  offlineReason?: string;
  offlineTime?: Date;
  authorName?: string;
  chapterCount?: number;
  wordCount?: number;
  publishedChapterCount?: number;
  publishedWordCount?: number;
  totalChapterCount?: number;
  scheduledChapterCount?: number;
  pendingAuditChapterCount?: number;
  lastPublishedChapterNumber?: number;
  nextScheduledAt?: string;
  coverAuditStatus?: 'pending_review' | 'pass' | 'reject';
  coverLocked?: boolean;
  coverAuditRejectReason?: string;
  autoUpdate?: BookStoreAutoUpdateConfig;
}

export interface BookStoreAutoUpdateJob {
  id: string;
  chapterNumber: number;
  scheduledAt: string;
  status: 'pending' | 'running' | 'submitted' | 'failed';
  generatedChapter: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface BookStoreAutoUpdateConfig {
  enabled: boolean;
  timeOfDay: string;
  timezone: string;
  maxWordCount?: number;
  userDirection: string;
  updatedAt: string;
  updatedBy: string;
  lastPlannedAt?: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  queue: BookStoreAutoUpdateJob[];
  history: BookStoreAutoUpdateJob[];
}

export interface BookStoreComment {
  id: string;
  userId: string;
  username: string;
  authorName: string;
  avatarUrl?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookStoreUserComment {
  bookId: string;
  bookTitle: string;
  bookCover: string;
  bookCategory: string;
  commentId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentAudit {
  id: string;
  novelId: string;
  chapterId?: string;
  content: string;
  auditType: 'auto' | 'manual';
  status: AuditStatus;
  result: AuditResultDetail;
  auditorId?: string;
  auditTime: Date;
  provider: string;
}

export interface Report {
  id: string;
  novelId: string;
  chapterId?: string;
  reporterId: string;
  reportType: ReportType;
  reason: string;
  evidence?: string[];
  violationPosition?: {
    chapterId: string;
    paragraph: number;
  };
  status: ReportStatus;
  handlerId?: string;
  handleResult?: string;
  handleTime?: Date;
  createTime: Date;
}

export interface UpdateBookRequest {
  title?: string;
  description?: string;
  cover?: string;
  tags?: string[];
}

export interface OfflineRequest {
  novelId: string;
  chapterId?: string;
  reason: string;
}

export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export type BookStoreSort = 'updated' | 'hot' | 'new';

export interface BookStoreListQuery extends PaginationQuery {
  category?: string;
  tags?: string;
  sort?: BookStoreSort;
  keyword?: string;
}

export interface BookStoreListResponse<T> extends PaginatedResponse<T> {
  appliedSort: BookStoreSort;
}

export interface BookStoreStorefrontConfig {
  defaultSort: BookStoreSort;
  updatedAt: string;
  updatedBy: string;
}

export interface GuestVisitRecord {
  fingerprint: string;
  userAgent: string;
  firstSeenAt: string;
  lastSeenAt: string;
  hitCount: number;
  sessionCount: number;
  lastPath: string;
  referrer?: string;
}

export interface GuestVisitSummary {
  hasOtherVisitors: boolean;
  totalUniqueVisitors: number;
  uniqueVisitorsLast24Hours: number;
  uniqueVisitorsLast7Days: number;
  activeVisitorsLast30Minutes: number;
  latestVisitAt?: string;
  recentVisitors: GuestVisitRecord[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
