/**
 * 分叉（抱走）API 客户端
 */
import { http } from './http';

export type ForkPermission = 'all' | 'followers' | 'closed';
export type ForkChapterMode = 'all' | 'selected';

export interface ForkRecord {
  id: string;
  originalNovelId: string;
  originalTitle: string;
  forkedNovelId: string;
  fromChapter: number;
  forkedBy: string;
  forkedByName: string;
  isPublic: boolean;
  createdAt: string;
}

export interface ForkConfig {
  novelId: string;
  allowFork: boolean;
  permission: ForkPermission;
  chapterMode: ForkChapterMode;
  allowedChapters: number[];
  authorNote: string;
  updatedAt: string;
}

export interface ForkCheckResult {
  allowed: boolean;
  reason?: string;
  alreadyForked: boolean;
  chapterAllowed: boolean;
  config: {
    allowFork: boolean;
    permission: ForkPermission;
    chapterMode: ForkChapterMode;
    allowedChapters: number[];
    authorNote: string;
  };
}

export interface ForkResult {
  novel: {
    id: string;
    title: string;
    [key: string]: unknown;
  };
  record: ForkRecord;
}

/** 预检：是否允许抱走 */
export async function checkFork(novelId: string, chapter: number): Promise<ForkCheckResult> {
  const { data } = await http.get(`/forks/check/${novelId}/${chapter}`);
  return data as ForkCheckResult;
}

/** 执行抱走 */
export async function createFork(params: {
  novelId: string;
  fromChapter: number;
  newTitle?: string;
  isPublic?: boolean;
}): Promise<ForkResult> {
  const { data } = await http.post('/forks', params, { timeout: 120_000 });
  return data as ForkResult;
}

/** 查询某作品的抱走记录 */
export async function fetchForksByNovel(novelId: string): Promise<{ records: ForkRecord[]; total: number }> {
  const { data } = await http.get(`/forks/by-novel/${novelId}`);
  return data as { records: ForkRecord[]; total: number };
}

/** 查询我的抱走记录 */
export async function fetchMyForks(): Promise<{ records: ForkRecord[]; total: number }> {
  const { data } = await http.get('/forks/my');
  return data as { records: ForkRecord[]; total: number };
}

/** 获取作品分叉配置 */
export async function fetchForkConfig(novelId: string): Promise<ForkConfig> {
  const { data } = await http.get(`/forks/config/${novelId}`);
  return data as ForkConfig;
}

/** 更新作品分叉配置 */
export async function updateForkConfig(
  novelId: string,
  patch: Partial<Pick<ForkConfig, 'allowFork' | 'permission' | 'authorNote'>>,
): Promise<ForkConfig> {
  const { data } = await http.put(`/forks/config/${novelId}`, patch);
  return data as ForkConfig;
}

/** 切换分叉公开/私有 */
export async function setForkVisibility(recordId: string, isPublic: boolean): Promise<ForkRecord> {
  const { data } = await http.patch(`/forks/${recordId}/visibility`, { isPublic });
  return data as ForkRecord;
}

// ── 分叉发布审批 ──

export type ForkPublishStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ForkPublishRequest {
  id: string;
  forkedNovelId: string;
  forkedTitle: string;
  originalNovelId: string;
  originalTitle: string;
  originalCover: string;
  forkedCover: string;
  requesterId: string;
  requesterName: string;
  message: string;
  status: ForkPublishStatus;
  reviewerId: string;
  reviewComment: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ForkPublishCheck {
  isFork: boolean;
  canPublish: boolean;
  checks: {
    titleChanged: boolean;
    coverChanged: boolean;
    hasCover: boolean;
    approvalStatus: ForkPublishStatus | 'none';
  };
  originalTitle?: string;
  originalCover?: string;
  currentRequest?: ForkPublishRequest | null;
}

/** 预检：分叉作品是否可发布 */
export async function checkForkPublish(novelId: string): Promise<ForkPublishCheck> {
  const { data } = await http.get(`/forks/publish-check/${novelId}`);
  return data as ForkPublishCheck;
}

/** 提交发布审批申请 */
export async function submitForkPublishRequest(
  forkedNovelId: string,
  message?: string,
): Promise<ForkPublishRequest> {
  const { data } = await http.post('/forks/publish-request', { forkedNovelId, message });
  return data as ForkPublishRequest;
}

/** 查询某作品的发布申请 */
export async function fetchForkPublishRequest(
  novelId: string,
): Promise<{ request: ForkPublishRequest | null }> {
  const { data } = await http.get(`/forks/publish-request/${novelId}`);
  return data as { request: ForkPublishRequest | null };
}

/** 原作者收到的发布申请列表 */
export async function fetchReceivedForkPublishRequests(
  status?: ForkPublishStatus,
): Promise<{ requests: ForkPublishRequest[] }> {
  const params = status ? { status } : undefined;
  const { data } = await http.get('/forks/publish-requests/received', { params });
  return data as { requests: ForkPublishRequest[] };
}

/** 审批发布申请 */
export async function reviewForkPublishRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  comment?: string,
): Promise<ForkPublishRequest> {
  const { data } = await http.post(`/forks/publish-request/${requestId}/review`, { decision, comment });
  return data as ForkPublishRequest;
}

// ── 分叉统计与清空 ──

export interface ForkChapterStat {
  chapter: number;
  count: number;
}

export interface ForkStats {
  total: number;
  publicCount: number;
  privateCount: number;
  byChapter: ForkChapterStat[];
  latestForkAt: string | null;
}

/** 获取作品分叉统计 */
export async function fetchForkStats(novelId: string): Promise<ForkStats> {
  const { data } = await http.get(`/forks/stats/${novelId}`);
  return data as ForkStats;
}

/** 删除单条分叉记录 */
export async function deleteForkRecord(recordId: string): Promise<void> {
  await http.delete(`/forks/records/${recordId}`);
}

/** 清空某作品全部分叉记录（仅作者） */
export async function clearForksByNovel(novelId: string): Promise<{ removed: number }> {
  const { data } = await http.delete(`/forks/by-novel/${novelId}`);
  return data as { removed: number };
}
