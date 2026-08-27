/**
 * 书城管理器
 *
 * 内部存储已从 JSON 文件迁移到 SQLite（better-sqlite3）。
 * 公开接口（方法签名/返回类型）与原版完全兼容，调用方无需修改。
 */

import path from 'path';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type { Database } from 'better-sqlite3';
import type {
  BookStore,
  BookAutoUpdateConfig,
  BookAutoUpdateJob,
  BookStoreComment,
  BookStoreUserComment,
  PublishedChapter,
  CreateBookCommentRequest,
  PublishBookRequest,
  UpdateBookRequest,
  BookStoreListQuery,
  PaginatedResponse,
  AuditStatus,
  CoverAuditStatus,
} from './types.js';
import {
  insertBook,
  updateBook,
  deleteBook,
  getBookById,
  getBookByNovelId,
  getBooksByUserId,
  getBooksByUserIdPage,
  getAllBooks,
  getAllBooksPage,
  getCoverPendingBooksPage,
  getApprovedBooksPage,
  incrementViewCount,
  toggleLike,
  toggleFavorite,
  hasFavorited,
  hasLiked,
  getFavoriteBookIds,
  getFavoriteBooksPage,
  insertComment,
  deleteComment,
  getCommentsByUser,
  getCommentsByBookPage,
  getCommentsByUserPage,
  importBooks,
} from './bookstore-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('bookstore-manager');

export type BookApprovedCallback = (book: BookStore) => void;
export type ChapterPublishedCallback = (bookId: string, chapterNumber: number) => void;

export class BookStoreManager {
  private readonly db: Database;
  private readonly dataDir: string;
  private onBookApprovedCallback?: BookApprovedCallback;
  private onChapterPublishedCallback?: ChapterPublishedCallback;

  constructor(dataDir: string, db: Database) {
    this.dataDir = dataDir;
    this.db = db;
  }

  /** 注册书籍审核通过（publishStatus 变为 approved）时的回调 */
  onBookApproved(cb: BookApprovedCallback): void {
    this.onBookApprovedCallback = cb;
  }

  /** 注册章节发布（status 变为 published）时的回调 */
  onChapterPublished(cb: ChapterPublishedCallback): void {
    this.onChapterPublishedCallback = cb;
  }

  private notifyChapterPublished(bookId: string, chapterNumber: number): void {
    try {
      this.onChapterPublishedCallback?.(bookId, chapterNumber);
    } catch (err) {
      log.warn('章节发布回调执行失败', { bookId, chapterNumber, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private notifyBookApproved(book: BookStore): void {
    try {
      this.onBookApprovedCallback?.(book);
    } catch (err) {
      log.warn('书籍审核通过回调执行失败', { bookId: book.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ==================== 辅助 ====================

  private matchesUser(bookUserId: string, userIds: string | readonly string[]): boolean {
    const allowedUserIds = Array.isArray(userIds) ? userIds : [userIds];
    return allowedUserIds.includes(bookUserId);
  }

  private normalizeCoverUrl(rawCover: unknown, novelId: string): string {
    if (typeof rawCover !== 'string' || rawCover.trim().length === 0) {
      return `/api/novels/cover/${novelId}`;
    }
    const cover = rawCover.trim();
    const legacyMatch = cover.match(/^\/api\/novels\/([^/]+)\/cover(\?.*)?$/);
    if (legacyMatch) {
      const legacyNovelId = legacyMatch[1];
      const query = legacyMatch[2] ?? '';
      return `/api/novels/cover/${legacyNovelId}${query}`;
    }
    return cover;
  }

  private _applyDualGate(book: BookStore): void {
    if (book.auditStatus === 'pass' && book.coverAuditStatus === 'pass') {
      const wasAlreadyApproved = book.publishStatus === 'approved';
      book.publishStatus = 'approved';
      if (!wasAlreadyApproved) {
        this.notifyBookApproved(book);
      }
    }
  }

  static hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  // ==================== 迁移辅助（启动时调用）====================

  async migrateFromJson(): Promise<void> {
    const jsonPath = path.join(this.dataDir, 'bookstore.json');
    const bakPath = path.join(this.dataDir, 'bookstore.json.bak');
    const fs = await import('node:fs/promises');

    try {
      await fs.access(jsonPath);
    } catch {
      return; // 文件不存在，无需迁移
    }

    const { createLogger } = await import('../utils/logger.js');
    const log = createLogger('bookstore-migrator');
    log.info('检测到 bookstore.json，开始迁移到 SQLite...');

    const content = await fs.readFile(jsonPath, 'utf-8');
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(content);
    } catch (parseErr) {
      log.error(`bookstore.json 解析失败，跳过迁移：${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      await fs.rename(jsonPath, bakPath);
      log.info(`损坏的 bookstore.json 已备份为 bookstore.json.bak`);
      return;
    }
    const booksArray = Array.isArray(data.books) ? data.books as Record<string, unknown>[] : [];
    const rawBooks = booksArray.map((book: Record<string, unknown>) => ({
      ...book,
      cover: this.normalizeCoverUrl(book.cover, book.novelId as string),
      publishTime: new Date(book.publishTime as string),
      updateTime: new Date(book.updateTime as string),
      auditTime: book.auditTime ? new Date(book.auditTime as string) : undefined,
      offlineTime: book.offlineTime ? new Date(book.offlineTime as string) : undefined,
      likeCount: Math.max(Number(book.likeCount) || 0, Array.isArray(book.likedBy) ? (book.likedBy as string[]).length : 0),
      likedBy: Array.isArray(book.likedBy) ? book.likedBy : [],
      favoriteCount: Math.max(Number(book.favoriteCount) || 0, Array.isArray(book.favoritedBy) ? (book.favoritedBy as string[]).length : 0),
      favoritedBy: Array.isArray(book.favoritedBy) ? book.favoritedBy : [],
      commentCount: Math.max(Number(book.commentCount) || 0, Array.isArray(book.comments) ? (book.comments as unknown[]).length : 0),
      publishedChapters: Array.isArray(book.publishedChapters)
        ? (book.publishedChapters as Record<string, unknown>[]).map(c => ({
            ...c,
            scheduledAt: c.scheduledAt ? new Date(c.scheduledAt as string) : undefined,
            submittedAt: new Date(c.submittedAt as string),
            publishedAt: c.publishedAt ? new Date(c.publishedAt as string) : undefined,
          }))
        : [],
      comments: Array.isArray(book.comments)
        ? (book.comments as Record<string, unknown>[]).map(c => ({
            ...c,
            avatarUrl: (c.avatarUrl as string | null) ?? null,
            createdAt: new Date(c.createdAt as string),
            updatedAt: new Date(c.updatedAt as string),
          }))
        : [],
    }));

    const existing = this.db.prepare('SELECT COUNT(*) as cnt FROM books').get() as { cnt: number };
    if (existing.cnt === 0) {
      importBooks(this.db, rawBooks as BookStore[]);
      log.info(`已迁移 ${rawBooks.length} 条书城记录到 SQLite`);
    } else {
      log.info('SQLite 中已有数据，跳过迁移');
    }

    await fs.rename(jsonPath, bakPath);
    log.info(`原 bookstore.json 已备份为 bookstore.json.bak`);
  }

  // ==================== 发布 / 更新 / 删除 ====================

  async publishBook(userId: string, request: PublishBookRequest, title: string, cover: string): Promise<BookStore> {
    const existing = getBookByNovelId(this.db, request.novelId);
    if (existing) throw new Error('该作品已发布到书城');

    const now = new Date();
    const book: BookStore = {
      id: randomUUID(),
      novelId: request.novelId,
      userId,
      publishStatus: 'approved',
      title,
      cover,
      description: request.description || '',
      category: request.category,
      tags: request.tags,
      publishTime: now,
      updateTime: now,
      viewCount: 0,
      likeCount: 0,
      likedBy: [],
      favoriteCount: 0,
      favoritedBy: [],
      commentCount: 0,
      comments: [],
      auditStatus: 'pass',
      coverAuditStatus: 'pass',
      coverLocked: false,
      publishedChapters: [],
    };
    insertBook(this.db, book);
    return book;
  }

  async updateBook(bookId: string, userId: string | readonly string[], request: UpdateBookRequest): Promise<BookStore> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    if (!this.matchesUser(book.userId, userId)) throw new Error('无权限修改此作品');

    if (request.cover !== undefined && !request.cover.startsWith('/api/novels/cover/')) {
      throw new Error('封面地址格式不合法，只允许使用平台内封面');
    }

    const isContentChanged =
      (request.title !== undefined && request.title !== book.title) ||
      (request.description !== undefined && request.description !== book.description) ||
      (request.tags !== undefined && JSON.stringify(request.tags) !== JSON.stringify(book.tags));
    const isCoverChanged = request.cover !== undefined && request.cover !== book.cover;

    const updated: BookStore = { ...book, ...request, updateTime: new Date() };
    const isLive = book.publishStatus === 'approved' || book.publishStatus === 'pending';
    if (isContentChanged && isLive) { updated.auditStatus = 'pending'; updated.publishStatus = 'pending'; }
    if (isCoverChanged && isLive) { updated.coverLocked = false; updated.coverAuditStatus = 'reject'; updated.coverAuditRejectReason = undefined; updated.publishStatus = 'pending'; }

    updateBook(this.db, updated);
    return updated;
  }

  async deleteBook(bookId: string, userId: string | readonly string[]): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    if (!this.matchesUser(book.userId, userId)) throw new Error('无权限删除此作品');
    deleteBook(this.db, bookId);
  }

  async getBook(bookId: string): Promise<BookStore | null> {
    return getBookById(this.db, bookId);
  }

  async getBookByNovelId(novelId: string): Promise<BookStore | null> {
    return getBookByNovelId(this.db, novelId);
  }

  async getUserBooks(userId: string | readonly string[]): Promise<BookStore[]> {
    const ids = Array.isArray(userId) ? [...userId] : [userId];
    return getBooksByUserId(this.db, ids);
  }

  async getUserBooksPage(
    userId: string | readonly string[],
    query: { page: number; pageSize: number },
  ): Promise<PaginatedResponse<BookStore>> {
    const ids = Array.isArray(userId) ? [...userId] : [userId];
    return getBooksByUserIdPage(this.db, { ...query, userIds: ids });
  }

  async listBooks(query: BookStoreListQuery): Promise<PaginatedResponse<BookStore>> {
    return getApprovedBooksPage(this.db, query);
  }

  async adminListBooks(): Promise<BookStore[]> {
    return getAllBooks(this.db);
  }

  async adminListBooksPage(query: {
    page: number;
    pageSize: number;
    status?: BookStore['publishStatus'];
    keyword?: string;
  }): Promise<PaginatedResponse<BookStore>> {
    return getAllBooksPage(this.db, query);
  }

  // ==================== 审核 ====================

  async updateAuditStatus(bookId: string, auditStatus: AuditStatus, auditResult?: unknown): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    book.auditStatus = auditStatus;
    book.auditTime = new Date();
    if (auditResult) book.auditResult = auditResult as BookStore['auditResult'];
    if (auditStatus === 'reject') book.publishStatus = 'rejected';
    else if (auditStatus === 'pass') this._applyDualGate(book);
    updateBook(this.db, book);
  }

  async updateCoverAuditStatus(bookId: string, coverAuditStatus: CoverAuditStatus, rejectReason?: string): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    book.coverAuditStatus = coverAuditStatus;
    if (rejectReason !== undefined) book.coverAuditRejectReason = rejectReason;
    if (coverAuditStatus === 'pass') {
      book.coverLocked = true;
      this._applyDualGate(book);
    } else if (coverAuditStatus === 'reject') {
      book.publishStatus = 'rejected';
    }
    updateBook(this.db, book);
  }

  async resubmitCoverForAudit(bookId: string, userId: string | readonly string[], newCoverUrl: string): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    if (!this.matchesUser(book.userId, userId)) throw new Error('无权限操作此作品');
    book.cover = newCoverUrl;
    book.coverAuditStatus = 'pending_review';
    book.coverLocked = false;
    book.coverAuditRejectReason = undefined;
    book.publishStatus = 'pending';
    book.updateTime = new Date();
    updateBook(this.db, book);
  }

  async unlockCover(bookId: string, userId: string | readonly string[]): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    if (!this.matchesUser(book.userId, userId)) throw new Error('无权限操作此作品');
    book.coverLocked = false;
    book.publishStatus = 'pending';
    updateBook(this.db, book);
  }

  async unlockCoverAndUnpublish(bookId: string, userId: string | readonly string[]): Promise<void> {
    return this.unlockCover(bookId, userId);
  }

  async getCoverPendingBooks(): Promise<BookStore[]> {
    const all = getAllBooks(this.db);
    return all.filter(b => b.coverAuditStatus === 'pending_review');
  }

  async getCoverPendingBooksPage(query: {
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<BookStore>> {
    return getCoverPendingBooksPage(this.db, query);
  }

  async reOnlineBook(bookId: string): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    book.publishStatus = 'approved';
    book.offlineReason = undefined;
    book.offlineTime = undefined;
    book.updateTime = new Date();
    updateBook(this.db, book);
    this.notifyBookApproved(book);
  }

  async forceHideChapter(novelId: string, chapterNumber: number): Promise<void> {
    const book = getBookByNovelId(this.db, novelId);
    if (!book) return;
    this.updatePublishedChapters(book.id, chapters => {
      const c = chapters.find(ch => ch.chapterNumber === chapterNumber);
      if (c) { c.status = 'hidden'; c.scheduledAt = undefined; }
      return chapters;
    });
  }

  async offlineBook(bookId: string, reason: string): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    book.publishStatus = 'offline';
    book.offlineReason = reason;
    book.offlineTime = new Date();
    book.updateTime = new Date();
    updateBook(this.db, book);
  }

  async unpublishBook(bookId: string, userId: string | readonly string[]): Promise<void> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    if (!this.matchesUser(book.userId, userId)) throw new Error('无权限操作此作品');
    deleteBook(this.db, bookId);
  }

  async onAuthorProfileChanged(userId: string): Promise<number> {
    // 作者信息变更时，书城数据无需更新（作者名通过 authDb 实时查询）
    return 0;
  }

  async onNovelCoverChanged(novelId: string): Promise<boolean> {
    const book = getBookByNovelId(this.db, novelId);
    if (!book) return false;
    book.cover = this.normalizeCoverUrl(book.cover, novelId);
    book.updateTime = new Date();
    updateBook(this.db, book);
    return true;
  }

  // ==================== 互动 ====================

  async incrementViewCount(bookId: string): Promise<void> {
    incrementViewCount(this.db, bookId);
  }

  async toggleLike(bookId: string, userId: string): Promise<{ likeCount: number; liked: boolean }> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    if (book.userId === userId) throw new Error('不能给自己的作品点赞');
    return toggleLike(this.db, bookId, userId);
  }

  async toggleFavorite(bookId: string, userId: string): Promise<{ favoriteCount: number; favorited: boolean }> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    return toggleFavorite(this.db, bookId, userId);
  }

  async hasFavorited(bookId: string, userId: string): Promise<boolean> {
    return hasFavorited(this.db, bookId, userId);
  }

  async hasLiked(bookId: string, userId: string): Promise<boolean> {
    return hasLiked(this.db, bookId, userId);
  }

  async getUserFavoriteBooks(userId: string): Promise<BookStore[]> {
    const bookIds = getFavoriteBookIds(this.db, userId);
    return bookIds.map(id => getBookById(this.db, id)).filter((b): b is BookStore => b !== null);
  }

  async getUserFavoriteBooksPage(
    userId: string,
    query: { page: number; pageSize: number },
  ): Promise<PaginatedResponse<BookStore>> {
    return getFavoriteBooksPage(this.db, userId, query);
  }

  async getLikeStatus(bookId: string, userId: string): Promise<{ liked: boolean }> {
    return { liked: hasLiked(this.db, bookId, userId) };
  }

  async getFavoriteStatus(bookId: string, userId: string): Promise<{ favorited: boolean }> {
    return { favorited: hasFavorited(this.db, bookId, userId) };
  }

  // ==================== 评论 ====================

  async getComments(bookId: string): Promise<BookStoreComment[]> {
    const book = getBookById(this.db, bookId);
    return book?.comments ?? [];
  }

  async getCommentsPage(
    bookId: string,
    query: { page: number; pageSize: number },
  ): Promise<PaginatedResponse<BookStoreComment>> {
    return getCommentsByBookPage(this.db, bookId, query);
  }

  async getUserComments(userId: string | string[]): Promise<BookStoreUserComment[]> {
    const userIds = Array.isArray(userId) ? userId : [userId];
    const rows = getCommentsByUser(this.db, userIds);
    return rows.map(r => ({
      bookId: r.book_id,
      bookTitle: r.book_title,
      bookCover: r.book_cover,
      bookCategory: r.book_category,
      commentId: r.id,
      content: r.content,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    }));
  }

  async getUserCommentsPage(
    userId: string | string[],
    query: { page: number; pageSize: number },
  ): Promise<PaginatedResponse<BookStoreUserComment>> {
    const userIds = Array.isArray(userId) ? userId : [userId];
    const result = getCommentsByUserPage(this.db, userIds, query);
    return {
      ...result,
      items: result.items.map(r => ({
        bookId: r.book_id,
        bookTitle: r.book_title,
        bookCover: r.book_cover,
        bookCategory: r.book_category,
        commentId: r.id,
        content: r.content,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
      })),
    };
  }

  async addComment(
    bookId: string,
    request: CreateBookCommentRequest,
    author: Pick<BookStoreComment, 'userId' | 'username' | 'authorName' | 'avatarUrl'>,
  ): Promise<BookStoreComment> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    const now = new Date();
    const comment: BookStoreComment = {
      id: randomUUID(),
      userId: author.userId,
      username: author.username,
      authorName: author.authorName,
      avatarUrl: author.avatarUrl ?? null,
      content: request.content.trim(),
      createdAt: now,
      updatedAt: now,
    };
    insertComment(this.db, bookId, comment);
    return comment;
  }

  async removeComment(bookId: string, commentId: string, userId: string, isAdmin = false): Promise<{ commentCount: number }> {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('作品不存在');
    const target = book.comments.find(c => c.id === commentId);
    if (!target) throw new Error('评论不存在');
    if (!isAdmin && target.userId !== userId) throw new Error('无权限删除这条评论');
    const commentCount = deleteComment(this.db, bookId, commentId);
    return { commentCount };
  }

  // ==================== 章节发布管理（publishedChapters 存为 JSON 列）====================

  private updatePublishedChapters(bookId: string, updater: (chapters: PublishedChapter[]) => PublishedChapter[]): void {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('book not found');
    const updated: BookStore = {
      ...book,
      publishedChapters: updater(book.publishedChapters ?? []),
      updateTime: new Date(),
    };
    updateBook(this.db, updated);
  }

  async scheduleChapterPublication(bookId: string, chapterNumber: number, contentHash: string, scheduledAt: Date): Promise<void> {
    this.updatePublishedChapters(bookId, chapters => {
      const existing = chapters.find(c => c.chapterNumber === chapterNumber);
      if (existing) {
        Object.assign(existing, { contentHash, status: 'scheduled', scheduledAt, submittedAt: new Date(), publishedAt: undefined });
      } else {
        chapters.push({ chapterNumber, contentHash, status: 'scheduled', scheduledAt, submittedAt: new Date() });
      }
      return chapters;
    });
  }

  async cancelScheduledChapter(bookId: string, chapterNumber: number): Promise<void> {
    this.updatePublishedChapters(bookId, chapters => {
      const c = chapters.find(ch => ch.chapterNumber === chapterNumber);
      if (c) { c.status = 'hidden'; c.scheduledAt = undefined; }
      return chapters;
    });
  }

  async listDueScheduledPublications(now = new Date()): Promise<Array<{ bookId: string; novelId: string; chapterNumber: number }>> {
    const books = getAllBooks(this.db);
    return books.flatMap(book => {
      if (book.publishStatus !== 'approved') return [];
      return (book.publishedChapters ?? [])
        .filter(c => c.status === 'scheduled' && c.scheduledAt && c.scheduledAt <= now)
        .map(c => ({ bookId: book.id, novelId: book.novelId, chapterNumber: c.chapterNumber }));
    });
  }

  async submitChapterForAudit(bookId: string, chapterNumber: number, contentHash: string, meta?: { wordCount?: number; title?: string }): Promise<void> {
    this.updatePublishedChapters(bookId, chapters => {
      const existing = chapters.find(c => c.chapterNumber === chapterNumber);
      if (existing) {
        Object.assign(existing, { contentHash, status: 'pending_audit', scheduledAt: undefined, submittedAt: new Date(), publishedAt: undefined });
        if (meta?.wordCount !== undefined) existing.wordCount = meta.wordCount;
        if (meta?.title !== undefined) existing.title = meta.title;
      } else {
        chapters.push({ chapterNumber, contentHash, status: 'pending_audit', submittedAt: new Date(), wordCount: meta?.wordCount, title: meta?.title });
      }
      return chapters;
    });
  }

  async submitChaptersForAuditBatch(bookId: string, items: Array<{ chapterNumber: number; contentHash: string }>): Promise<void> {
    if (items.length === 0) return;
    this.updatePublishedChapters(bookId, chapters => {
      const now = new Date();
      for (const item of items) {
        const existing = chapters.find(c => c.chapterNumber === item.chapterNumber);
        if (existing) {
          Object.assign(existing, { contentHash: item.contentHash, status: 'pending_audit', scheduledAt: undefined, submittedAt: now, publishedAt: undefined });
        } else {
          chapters.push({ chapterNumber: item.chapterNumber, contentHash: item.contentHash, status: 'pending_audit', submittedAt: now });
        }
      }
      return chapters;
    });
  }

  async scheduleChaptersPublicationBatch(bookId: string, items: Array<{ chapterNumber: number; contentHash: string; scheduledAt: Date }>): Promise<void> {
    if (items.length === 0) return;
    this.updatePublishedChapters(bookId, chapters => {
      const now = new Date();
      for (const item of items) {
        const existing = chapters.find(c => c.chapterNumber === item.chapterNumber);
        if (existing) {
          Object.assign(existing, { contentHash: item.contentHash, status: 'scheduled', scheduledAt: item.scheduledAt, submittedAt: now, publishedAt: undefined });
        } else {
          chapters.push({ chapterNumber: item.chapterNumber, contentHash: item.contentHash, status: 'scheduled', scheduledAt: item.scheduledAt, submittedAt: now });
        }
      }
      return chapters;
    });
  }

  async cancelScheduledChaptersBatch(bookId: string, chapterNumbers: number[]): Promise<void> {
    if (chapterNumbers.length === 0) return;
    const targetSet = new Set(chapterNumbers);
    this.updatePublishedChapters(bookId, chapters => {
      for (const c of chapters) {
        if (targetSet.has(c.chapterNumber)) { c.status = 'hidden'; c.scheduledAt = undefined; }
      }
      return chapters;
    });
  }

  async markChapterPublished(bookId: string, chapterNumber: number): Promise<void> {
    this.updatePublishedChapters(bookId, chapters => {
      const c = chapters.find(ch => ch.chapterNumber === chapterNumber);
      if (c) { c.status = 'published'; c.scheduledAt = undefined; c.publishedAt = new Date(); }
      return chapters;
    });
    this.notifyChapterPublished(bookId, chapterNumber);
  }

  async hideChapterIfModified(novelId: string, chapterNumber: number, newContentHash: string): Promise<boolean> {
    const book = getBookByNovelId(this.db, novelId);
    if (!book) return false;
    const chapter = (book.publishedChapters ?? []).find(
      c => c.chapterNumber === chapterNumber && (c.status === 'published' || c.status === 'pending_audit')
    );
    if (!chapter || chapter.contentHash === newContentHash) return false;
    chapter.status = 'hidden';
    chapter.scheduledAt = undefined;
    const updated: BookStore = { ...book, publishedChapters: book.publishedChapters, updateTime: new Date() };
    updateBook(this.db, updated);
    return true;
  }

  async revertChapterToHidden(bookId: string, chapterNumber: number): Promise<void> {
    this.updatePublishedChapters(bookId, chapters => {
      const c = chapters.find(ch => ch.chapterNumber === chapterNumber);
      if (c) { c.status = 'hidden'; c.scheduledAt = undefined; }
      return chapters;
    });
  }

  async getPublishedChapters(bookId: string): Promise<PublishedChapter[]> {
    const book = getBookById(this.db, bookId);
    return book?.publishedChapters ?? [];
  }

  // ==================== 自动更新（autoUpdate 存为 JSON 列）====================

  private updateAutoUpdateConfig(bookId: string, updater: (cfg: BookAutoUpdateConfig | undefined) => BookAutoUpdateConfig): void {
    const book = getBookById(this.db, bookId);
    if (!book) throw new Error('book not found');
    const updated: BookStore = { ...book, autoUpdate: updater(book.autoUpdate), updateTime: new Date() };
    updateBook(this.db, updated);
  }

  async getAutoUpdateConfig(bookId: string): Promise<BookAutoUpdateConfig | undefined> {
    const book = getBookById(this.db, bookId);
    return book?.autoUpdate;
  }

  async saveAutoUpdateConfig(bookId: string, config: BookAutoUpdateConfig): Promise<void> {
    this.updateAutoUpdateConfig(bookId, () => config);
  }

  async addAutoUpdateJob(bookId: string, job: BookAutoUpdateJob): Promise<void> {
    this.updateAutoUpdateConfig(bookId, cfg => {
      if (!cfg) throw new Error('自动更新未配置');
      cfg.queue = [...(cfg.queue ?? []), job];
      return cfg;
    });
  }

  async updateAutoUpdateJob(bookId: string, jobId: string, patch: Partial<BookAutoUpdateJob>): Promise<void> {
    this.updateAutoUpdateConfig(bookId, cfg => {
      if (!cfg) throw new Error('自动更新未配置');
      cfg.queue = (cfg.queue ?? []).map(j => j.id === jobId ? { ...j, ...patch } : j);
      return cfg;
    });
  }

  async markJobSubmitted(bookId: string, jobId: string, generatedChapter: boolean): Promise<void> {
    this.updateAutoUpdateConfig(bookId, cfg => {
      if (!cfg) throw new Error('自动更新未配置');
      cfg.queue = (cfg.queue ?? []).map(j => j.id === jobId ? { ...j, status: 'submitted' as const, generatedChapter } : j);
      return cfg;
    });
  }

  async markJobRunning(bookId: string, jobId: string, chapterNumber: number): Promise<void> {
    this.updateAutoUpdateConfig(bookId, cfg => {
      if (!cfg) throw new Error('自动更新未配置');
      cfg.queue = (cfg.queue ?? []).map(j => j.id === jobId ? { ...j, status: 'running' as const, chapterNumber, startedAt: new Date() } : j);
      return cfg;
    });
  }

  async finishAutoUpdateJob(bookId: string, jobId: string, success: boolean, error?: string): Promise<void> {
    this.updateAutoUpdateConfig(bookId, cfg => {
      if (!cfg) throw new Error('自动更新未配置');
      const job = (cfg.queue ?? []).find(j => j.id === jobId);
      if (job) {
        const finished = { ...job, status: (success ? 'submitted' : 'failed') as BookAutoUpdateJob['status'], finishedAt: new Date(), error };
        cfg.queue = (cfg.queue ?? []).filter(j => j.id !== jobId);
        cfg.history = [finished, ...(cfg.history ?? [])].slice(0, 20);
        if (success) cfg.lastSuccessAt = new Date();
        cfg.lastRunAt = new Date();
        if (error) cfg.lastError = error;
      }
      return cfg;
    });
  }

  async getAutoUpdateStatus(bookId: string): Promise<{ config: BookAutoUpdateConfig | undefined }> {
    const book = getBookById(this.db, bookId);
    return { config: book?.autoUpdate };
  }
}
