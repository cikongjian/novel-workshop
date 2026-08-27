import type {
  BookStore,
  BookStoreAutoUpdateConfig,
  BookStoreAutoUpdateJob,
  BookStoreComment,
  BookStoreListQuery,
  BookStoreListResponse,
  PaginatedResponse,
  BookStoreStorefrontConfig,
  BookStoreUserComment,
  UpdateBookRequest,
} from './types';
import { http } from './http';

const BASE_URL = '/bookstore';

/**
 * 获取书城作品列表
 */
export async function getBookStoreList(
  query: BookStoreListQuery,
  options?: { signal?: AbortSignal },
): Promise<BookStoreListResponse<BookStore>> {
  const response = await http.get(`${BASE_URL}/list`, { params: query, signal: options?.signal });
  return response.data;
}

/**
 * 获取作品详情
 */
export async function getBookStoreDetail(id: string): Promise<BookStore> {
  const response = await http.get(`${BASE_URL}/${id}`);
  return response.data;
}

export interface PublishToBookstoreRequest {
  novelId: string;
  category: string;
  tags: string[];
  description?: string;
}

export interface PublishToBookstoreResponse {
  bookstoreId: string;
  auditStatus: string;
  queue: { jobId: string; position: number };
}

export interface BookStoreManageChapter {
  chapterNumber: number;
  title: string;
  wordCount: number;
  updatedAt?: string;
  status: 'unpublished' | 'hidden' | 'scheduled' | 'pending_audit' | 'published';
  scheduledAt?: string;
  submittedAt?: string;
  publishedAt?: string;
}

export interface BookStoreManageChaptersResponse {
  bookId: string;
  novelId: string;
  summary: {
    total: number;
    published: number;
    scheduled: number;
    pendingAudit: number;
    hidden: number;
    unpublished: number;
    lastPublishedChapterNumber: number;
    nextScheduledAt?: string;
  };
  items: BookStoreManageChapter[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface BatchPublishBookStoreChapterResult {
  chapterNumber: number;
  success: boolean;
  auditStatus?: 'pending_audit';
  queue?: { jobId: string; position: number };
  error?: string;
}

export interface BatchScheduleBookStoreChapterResult {
  chapterNumber: number;
  success: boolean;
  status?: 'scheduled';
  scheduledAt?: string;
  error?: string;
}

export interface BatchCancelScheduleBookStoreChapterResult {
  chapterNumber: number;
  success: boolean;
  status?: 'hidden';
  error?: string;
}

export interface BatchBookStoreChapterMutationResponse<T> {
  successCount: number;
  failureCount: number;
  results: T[];
}

export interface BookStoreLikeResponse {
  success: boolean;
  likeCount: number;
  liked: boolean;
}

export interface BookStoreFavoriteResponse {
  success: boolean;
  favoriteCount: number;
  favorited: boolean;
}

export interface BookStoreCommentResponse {
  success: boolean;
  comment: BookStoreComment;
}

/**
 * 发布作品到书城
 */
export async function publishToBookstore(
  request: PublishToBookstoreRequest
): Promise<PublishToBookstoreResponse> {
  const response = await http.post(`${BASE_URL}/publish`, request);
  return response.data;
}

/**
 * 管理员：获取全部书城作品（含下架/待审）
 */
export async function getAdminBooks(): Promise<BookStore[]> {
  const response = await http.get(`${BASE_URL}/admin/books`);
  return response.data;
}

export interface AdminBookStoreListQuery {
  page?: number;
  pageSize?: number;
  status?: BookStore['publishStatus'];
  keyword?: string;
}

export async function getAdminBookPage(
  query: AdminBookStoreListQuery,
): Promise<PaginatedResponse<BookStore>> {
  const response = await http.get(`${BASE_URL}/admin/books-page`, { params: query });
  return response.data;
}

/**
 * 更新作品信息
 */
export async function updateBookStore(id: string, request: UpdateBookRequest): Promise<BookStore> {
  const response = await http.put(`${BASE_URL}/${id}/update`, request);
  return response.data;
}

/**
 * 取消发布
 */
export async function unpublishBook(id: string): Promise<{ success: boolean }> {
  const response = await http.delete(`${BASE_URL}/${id}/unpublish`);
  return response.data;
}

/**
 * 解锁封面并自动下架
 */
export async function unlockBookCover(id: string): Promise<{ success: boolean }> {
  const response = await http.post(`${BASE_URL}/${id}/unlock-cover`);
  return response.data;
}

/**
 * 重新提交封面审核
 */
export async function resubmitBookCover(id: string): Promise<{ success: boolean }> {
  const response = await http.post(`${BASE_URL}/${id}/resubmit-cover`);
  return response.data;
}

/**
 * 点赞作品
 */
export async function likeBook(id: string): Promise<BookStoreLikeResponse> {
  const response = await http.post(`${BASE_URL}/${id}/like`);
  return response.data;
}

/**
 * 查询点赞状态
 */
export async function getBookLikeStatus(id: string): Promise<{ liked: boolean }> {
  const response = await http.get(`${BASE_URL}/${id}/like-status`);
  return response.data;
}

/**
 * 收藏作品
 */
export async function favoriteBook(id: string): Promise<BookStoreFavoriteResponse> {
  const response = await http.post(`${BASE_URL}/${id}/favorite`);
  return response.data;
}

/**
 * 查询收藏状态
 */
export async function getBookFavoriteStatus(id: string): Promise<{ favorited: boolean }> {
  const response = await http.get(`${BASE_URL}/${id}/favorite-status`);
  return response.data;
}

export async function getBookStoreManageChapters(
  id: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<BookStoreManageChaptersResponse> {
  const response = await http.get(`${BASE_URL}/${id}/manage/chapters`, { params });
  return response.data;
}

export async function publishBookStoreChapter(
  id: string,
  chapterNumber: number,
): Promise<{ chapterNumber: number; auditStatus: string; queue: { jobId: string; position: number } }> {
  const response = await http.post(`${BASE_URL}/${id}/chapters/${chapterNumber}/publish`);
  return response.data;
}

export async function scheduleBookStoreChapter(
  id: string,
  chapterNumber: number,
  scheduledAt: string,
): Promise<{ chapterNumber: number; status: 'scheduled'; scheduledAt: string }> {
  const response = await http.post(`${BASE_URL}/${id}/chapters/${chapterNumber}/schedule`, { scheduledAt });
  return response.data;
}

export async function publishBookStoreChaptersBatch(
  id: string,
  chapterNumbers: number[],
): Promise<BatchBookStoreChapterMutationResponse<BatchPublishBookStoreChapterResult>> {
  const response = await http.post(`${BASE_URL}/${id}/chapters/publish-batch`, { chapterNumbers });
  return response.data;
}

export async function scheduleBookStoreChaptersBatch(
  id: string,
  items: Array<{ chapterNumber: number; scheduledAt: string }>,
): Promise<BatchBookStoreChapterMutationResponse<BatchScheduleBookStoreChapterResult>> {
  const response = await http.post(`${BASE_URL}/${id}/chapters/schedule-batch`, { items });
  return response.data;
}

export async function cancelScheduledBookStoreChaptersBatch(
  id: string,
  chapterNumbers: number[],
): Promise<BatchBookStoreChapterMutationResponse<BatchCancelScheduleBookStoreChapterResult>> {
  const response = await http.post(`${BASE_URL}/${id}/chapters/cancel-schedule-batch`, { chapterNumbers });
  return response.data;
}

export async function cancelScheduledBookStoreChapter(
  id: string,
  chapterNumber: number,
): Promise<{ success: boolean; chapterNumber: number; status: 'hidden' }> {
  const response = await http.delete(`${BASE_URL}/${id}/chapters/${chapterNumber}/schedule`);
  return response.data;
}

/**
 * 获取我的发布
 */
export async function getMyPublishedBooks(): Promise<BookStore[]> {
  const response = await http.get(`${BASE_URL}/my/published`);
  return response.data;
}

export async function getMyPublishedBookPage(
  params: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResponse<BookStore>> {
  const response = await http.get(`${BASE_URL}/my/published-page`, { params });
  return response.data;
}

/**
 * 获取我的收藏
 */
export async function getMyFavoriteBooks(): Promise<BookStore[]> {
  const response = await http.get(`${BASE_URL}/my/favorites`);
  return response.data;
}

export async function getMyFavoriteBookPage(
  params: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResponse<BookStore>> {
  const response = await http.get(`${BASE_URL}/my/favorites-page`, { params });
  return response.data;
}

/**
 * 获取我的评论
 */
export async function getMyBookComments(): Promise<BookStoreUserComment[]> {
  const response = await http.get(`${BASE_URL}/my/comments`);
  return response.data;
}

export async function getMyBookCommentPage(
  params: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResponse<BookStoreUserComment>> {
  const response = await http.get(`${BASE_URL}/my/comments-page`, { params });
  return response.data;
}

/**
 * 获取作品评论列表
 */
export async function getBookComments(id: string): Promise<BookStoreComment[]> {
  const response = await http.get(`${BASE_URL}/${id}/comments`);
  return response.data;
}

export async function getBookCommentPage(
  id: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResponse<BookStoreComment>> {
  const response = await http.get(`${BASE_URL}/${id}/comments-page`, { params });
  return response.data;
}

/**
 * 发表评论
 */
export async function createBookComment(id: string, content: string): Promise<BookStoreCommentResponse> {
  const response = await http.post(`${BASE_URL}/${id}/comments`, { content });
  return response.data;
}

/**
 * 删除评论
 */
export async function deleteBookComment(
  id: string,
  commentId: string,
): Promise<{ success: boolean; commentCount: number }> {
  const response = await http.delete(`${BASE_URL}/${id}/comments/${commentId}`);
  return response.data;
}

export interface BookStorePublicChapter {
  chapterNumber: number;
  title: string;
  wordCount: number;
  updatedAt?: string;
}

export interface BookStorePublicChapterContent {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface BookStorePublicComicPanel {
  panelIndex: number;
  imagePath: string;
  narration?: string;
  dialogue?: string;
  textRenderMode?: 'embedded' | 'overlay';
  pageIndex?: number;
  panelIndexInPage?: number;
  panelRole?: string;
  layoutTemplate?: string;
  bubblePlacement?: string;
  sfx?: string;
  emotion?: string;
}

export interface BookStorePublicComicManifest {
  chapterNumber: number;
  generatedAt: string;
  size: string;
  status: 'published';
  panels: BookStorePublicComicPanel[];
}

export interface BookStorePublicChapterPage {
  items: BookStorePublicChapter[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AdminBookAutoUpdateResponse {
  bookId: string;
  novelId: string;
  title: string;
  publishStatus: string;
  autoUpdate: BookStoreAutoUpdateConfig | null;
}

/**
 * 获取书城作品已发布章节列表（含元数据），供阅读页使用，无需小说所有权
 */
export async function getBookStorePublicChapters(id: string): Promise<BookStorePublicChapter[]> {
  const response = await http.get(`${BASE_URL}/${id}/reader/chapters`);
  return response.data;
}

export async function getBookStorePublicChapterPage(
  id: string,
  params: { page?: number; pageSize?: number; order?: 'asc' | 'desc' } = {},
): Promise<BookStorePublicChapterPage> {
  const response = await http.get(`${BASE_URL}/${id}/reader/chapter-page`, { params });
  return response.data;
}

/**
 * 获取书城作品单章正文，供阅读页使用，无需小说所有权
 */
export async function getBookStorePublicChapterContent(
  id: string,
  chapterNumber: number,
): Promise<BookStorePublicChapterContent> {
  const response = await http.get(`${BASE_URL}/${id}/reader/chapters/${chapterNumber}`);
  return response.data;
}

export async function getBookStorePublicComic(
  id: string,
  chapterNumber: number,
): Promise<BookStorePublicComicManifest | null> {
  try {
    const response = await http.get<BookStorePublicComicManifest>(`${BASE_URL}/${id}/reader/comics/${chapterNumber}`);
    return response.data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export function bookStorePublicComicPanelUrl(id: string, chapterNumber: number, imagePath: string): string {
  const file = imagePath.split('/').pop() || imagePath;
  return `/api${BASE_URL}/${encodeURIComponent(id)}/reader/comics/${chapterNumber}/panels/${encodeURIComponent(file)}`;
}

export async function getAdminBookAutoUpdate(id: string): Promise<AdminBookAutoUpdateResponse> {
  const response = await http.get(`${BASE_URL}/admin/books/${id}/auto-update`);
  return response.data;
}

export async function updateAdminBookAutoUpdate(
  id: string,
  payload: {
    enabled: boolean;
    timeOfDay: string;
    timezone: string;
    maxWordCount?: number;
    userDirection?: string;
  },
): Promise<AdminBookAutoUpdateResponse> {
  const response = await http.put(`${BASE_URL}/admin/books/${id}/auto-update`, payload);
  return response.data;
}

export async function runAdminBookAutoUpdateNow(
  id: string,
): Promise<{
  bookId: string;
  novelId: string;
  title: string;
  publishStatus: string;
  job: Pick<BookStoreAutoUpdateJob, 'id' | 'chapterNumber' | 'status' | 'scheduledAt'>;
}> {
  const response = await http.post(`${BASE_URL}/admin/books/${id}/auto-update/run-now`);
  return response.data;
}

export async function getAdminBookStorefrontConfig(): Promise<BookStoreStorefrontConfig> {
  const response = await http.get(`${BASE_URL}/admin/storefront-config`);
  return response.data;
}

export async function updateAdminBookStorefrontConfig(
  payload: Pick<BookStoreStorefrontConfig, 'defaultSort'>,
): Promise<BookStoreStorefrontConfig> {
  const response = await http.put(`${BASE_URL}/admin/storefront-config`, payload);
  return response.data;
}
