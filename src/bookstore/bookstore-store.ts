/**
 * 书城 SQLite 操作层
 *
 * 替换原 readAllBooks / writeAllBooks 文件 I/O，
 * 提供基于 better-sqlite3 的 CRUD 操作。
 * 所有方法为同步（better-sqlite3 API），供 BookStoreManager 调用。
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  BookStore,
  BookStoreComment,
  BookStoreListQuery,
  PaginatedResponse,
  PublishedChapter,
  BookAutoUpdateConfig,
  PublishStatus,
} from './types.js';

// ==================== 行类型 ====================

interface BookRow {
  id: string;
  novel_id: string;
  user_id: string;
  title: string;
  cover: string;
  description: string;
  category: string;
  tags: string;
  publish_status: string;
  audit_status: string;
  audit_result: string | null;
  audit_time: number | null;
  cover_audit_status: string;
  cover_locked: number;
  cover_audit_reject_reason: string | null;
  offline_reason: string | null;
  offline_time: number | null;
  view_count: number;
  like_count: number;
  favorite_count: number;
  comment_count: number;
  published_chapters: string;
  auto_update: string | null;
  publish_time: number;
  update_time: number;
}

interface CommentRow {
  id: string;
  book_id: string;
  user_id: string;
  content: string;
  avatar_url: string | null;
  username: string;
  author_name: string;
  created_at: number;
  updated_at: number;
}

// ==================== 序列化 / 反序列化 ====================

function toMs(d: Date | undefined | null): number | null {
  return d ? d.getTime() : null;
}

function fromMs(ms: number | null | undefined): Date | undefined {
  return ms != null ? new Date(ms) : undefined;
}

function serializeBook(book: BookStore): Omit<BookRow, 'like_count' | 'favorite_count' | 'comment_count'> & { like_count: number; favorite_count: number; comment_count: number } {
  return {
    id: book.id,
    novel_id: book.novelId,
    user_id: book.userId,
    title: book.title,
    cover: book.cover,
    description: book.description,
    category: book.category,
    tags: JSON.stringify(book.tags ?? []),
    publish_status: book.publishStatus,
    audit_status: book.auditStatus,
    audit_result: book.auditResult ? JSON.stringify(book.auditResult) : null,
    audit_time: toMs(book.auditTime),
    cover_audit_status: book.coverAuditStatus,
    cover_locked: book.coverLocked ? 1 : 0,
    cover_audit_reject_reason: book.coverAuditRejectReason ?? null,
    offline_reason: book.offlineReason ?? null,
    offline_time: toMs(book.offlineTime),
    view_count: book.viewCount,
    like_count: book.likeCount,
    favorite_count: book.favoriteCount,
    comment_count: book.commentCount,
    published_chapters: JSON.stringify(book.publishedChapters ?? []),
    auto_update: book.autoUpdate ? JSON.stringify(book.autoUpdate) : null,
    publish_time: book.publishTime.getTime(),
    update_time: book.updateTime.getTime(),
  };
}

function deserializeBook(row: BookRow, comments: BookStoreComment[], likedBy: string[], favoritedBy: string[]): BookStore {
  const publishedChapters: PublishedChapter[] = JSON.parse(row.published_chapters || '[]').map((c: Record<string, unknown>) => ({
    ...c,
    scheduledAt: c.scheduledAt ? new Date(c.scheduledAt as string) : undefined,
    submittedAt: new Date(c.submittedAt as string),
    publishedAt: c.publishedAt ? new Date(c.publishedAt as string) : undefined,
  }));

  const autoUpdate: BookAutoUpdateConfig | undefined = row.auto_update ? JSON.parse(row.auto_update) : undefined;
  if (autoUpdate) {
    if (autoUpdate.updatedAt) autoUpdate.updatedAt = new Date(autoUpdate.updatedAt as unknown as string) as unknown as typeof autoUpdate.updatedAt;
    if (autoUpdate.lastPlannedAt) autoUpdate.lastPlannedAt = new Date(autoUpdate.lastPlannedAt as unknown as string) as unknown as typeof autoUpdate.lastPlannedAt;
    if (autoUpdate.lastRunAt) autoUpdate.lastRunAt = new Date(autoUpdate.lastRunAt as unknown as string) as unknown as typeof autoUpdate.lastRunAt;
    if (autoUpdate.lastSuccessAt) autoUpdate.lastSuccessAt = new Date(autoUpdate.lastSuccessAt as unknown as string) as unknown as typeof autoUpdate.lastSuccessAt;
    if (autoUpdate.queue) autoUpdate.queue = autoUpdate.queue.map((j: unknown) => { const job = j as Record<string, unknown>; return { ...job, scheduledAt: job.scheduledAt ? new Date(job.scheduledAt as string) : undefined, createdAt: new Date(job.createdAt as string), startedAt: job.startedAt ? new Date(job.startedAt as string) : undefined, finishedAt: job.finishedAt ? new Date(job.finishedAt as string) : undefined } as typeof autoUpdate.queue[number]; });
    if (autoUpdate.history) autoUpdate.history = autoUpdate.history.map((j: unknown) => { const job = j as Record<string, unknown>; return { ...job, scheduledAt: job.scheduledAt ? new Date(job.scheduledAt as string) : undefined, createdAt: new Date(job.createdAt as string), startedAt: job.startedAt ? new Date(job.startedAt as string) : undefined, finishedAt: job.finishedAt ? new Date(job.finishedAt as string) : undefined } as typeof autoUpdate.history[number]; });
  }

  return {
    id: row.id,
    novelId: row.novel_id,
    userId: row.user_id,
    title: row.title,
    cover: row.cover,
    description: row.description,
    category: row.category as BookStore['category'],
    tags: JSON.parse(row.tags || '[]'),
    publishStatus: row.publish_status as BookStore['publishStatus'],
    auditStatus: row.audit_status as BookStore['auditStatus'],
    auditResult: row.audit_result ? JSON.parse(row.audit_result) : undefined,
    auditTime: fromMs(row.audit_time),
    coverAuditStatus: row.cover_audit_status as BookStore['coverAuditStatus'],
    coverLocked: row.cover_locked === 1,
    coverAuditRejectReason: row.cover_audit_reject_reason ?? undefined,
    offlineReason: row.offline_reason ?? undefined,
    offlineTime: fromMs(row.offline_time),
    viewCount: row.view_count,
    likeCount: row.like_count,
    likedBy,
    favoriteCount: row.favorite_count,
    favoritedBy,
    commentCount: row.comment_count,
    comments,
    publishedChapters,
    autoUpdate,
    publishTime: new Date(row.publish_time),
    updateTime: new Date(row.update_time),
  };
}

function deserializeComment(row: CommentRow): BookStoreComment {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    authorName: row.author_name || row.username,
    avatarUrl: row.avatar_url,
    content: row.content,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ==================== 辅助：批量加载点赞/收藏/评论 ====================

function loadBookExtras(db: Database, bookId: string): { likedBy: string[]; favoritedBy: string[]; comments: BookStoreComment[] } {
  const likedBy = (db.prepare('SELECT user_id FROM book_likes WHERE book_id = ?').all(bookId) as Array<{ user_id: string }>).map(r => r.user_id);
  const favoritedBy = (db.prepare('SELECT user_id FROM book_favorites WHERE book_id = ?').all(bookId) as Array<{ user_id: string }>).map(r => r.user_id);
  const commentRows = db.prepare('SELECT * FROM book_comments WHERE book_id = ? ORDER BY created_at DESC').all(bookId) as CommentRow[];
  const comments = commentRows.map(deserializeComment);
  return { likedBy, favoritedBy, comments };
}

function rowToBook(db: Database, row: BookRow): BookStore {
  const extras = loadBookExtras(db, row.id);
  return deserializeBook(row, extras.comments, extras.likedBy, extras.favoritedBy);
}

function rowToBookListItem(row: BookRow): BookStore {
  return deserializeBook(row, [], [], []);
}

export interface BookStorePageQuery {
  page: number;
  pageSize: number;
  status?: PublishStatus;
  keyword?: string;
}

export interface UserBookStorePageQuery {
  page: number;
  pageSize: number;
  userIds: string[];
}

// ==================== CRUD 操作 ====================

export function insertBook(db: Database, book: BookStore): void {
  // 主表写入与 likes/favorites/comments 同步放进同一事务，避免崩溃留下「书已写入但互动数据被清空」的中间态
  db.transaction(() => {
    const row = serializeBook(book);
    db.prepare(`
      INSERT INTO books (id, novel_id, user_id, title, cover, description, category, tags,
        publish_status, audit_status, audit_result, audit_time, cover_audit_status, cover_locked,
        cover_audit_reject_reason, offline_reason, offline_time, view_count, like_count,
        favorite_count, comment_count, published_chapters, auto_update, publish_time, update_time)
      VALUES (@id, @novel_id, @user_id, @title, @cover, @description, @category, @tags,
        @publish_status, @audit_status, @audit_result, @audit_time, @cover_audit_status, @cover_locked,
        @cover_audit_reject_reason, @offline_reason, @offline_time, @view_count, @like_count,
        @favorite_count, @comment_count, @published_chapters, @auto_update, @publish_time, @update_time)
    `).run(row);
    syncLikes(db, book.id, book.likedBy ?? []);
    syncFavorites(db, book.id, book.favoritedBy ?? []);
    syncComments(db, book.id, book.comments ?? []);
  })();
}

export function updateBook(db: Database, book: BookStore): void {
  // 同上：主表更新与三个同步原子化，防止部分失败导致互动数据丢失
  db.transaction(() => {
    const row = serializeBook(book);
    db.prepare(`
      UPDATE books SET novel_id=@novel_id, user_id=@user_id, title=@title, cover=@cover,
        description=@description, category=@category, tags=@tags, publish_status=@publish_status,
        audit_status=@audit_status, audit_result=@audit_result, audit_time=@audit_time,
        cover_audit_status=@cover_audit_status, cover_locked=@cover_locked,
        cover_audit_reject_reason=@cover_audit_reject_reason, offline_reason=@offline_reason,
        offline_time=@offline_time, view_count=@view_count, like_count=@like_count,
        favorite_count=@favorite_count, comment_count=@comment_count,
        published_chapters=@published_chapters, auto_update=@auto_update,
        publish_time=@publish_time, update_time=@update_time
      WHERE id=@id
    `).run(row);
    syncLikes(db, book.id, book.likedBy ?? []);
    syncFavorites(db, book.id, book.favoritedBy ?? []);
    syncComments(db, book.id, book.comments ?? []);
  })();
}
export function deleteBook(db: Database, bookId: string): void {
  // 级联删除放进同一事务，保证一致性
  db.transaction(() => {
    db.prepare('DELETE FROM book_likes WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM book_favorites WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM book_comments WHERE book_id = ?').run(bookId);
    db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
  })();
}

export function getBookById(db: Database, bookId: string): BookStore | null {
  const row = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as BookRow | undefined;
  if (!row) return null;
  return rowToBook(db, row);
}

export function getBookByNovelId(db: Database, novelId: string): BookStore | null {
  const row = db.prepare('SELECT * FROM books WHERE novel_id = ?').get(novelId) as BookRow | undefined;
  if (!row) return null;
  return rowToBook(db, row);
}

export function getBooksByUserId(db: Database, userIds: string[]): BookStore[] {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM books WHERE user_id IN (${placeholders}) ORDER BY update_time DESC`).all(...userIds) as BookRow[];
  return rows.map(r => rowToBook(db, r));
}

export function getApprovedBooksPage(db: Database, query: BookStoreListQuery): PaginatedResponse<BookStore> {
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize)));
  const params: Record<string, unknown> = {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
  const whereClause = buildApprovedBooksPageWhereClause(query, params, 'b');
  const totalRow = db.prepare(`
    SELECT COUNT(*) as total
    FROM books b
    ${whereClause}
  `).get(params) as { total: number };
  const rows = db.prepare(`
    WITH filtered AS (
      SELECT
        b.*,
        COALESCE((
          SELECT MAX(CAST(strftime('%s', json_extract(ch.value, '$.publishedAt')) AS INTEGER) * 1000)
          FROM json_each(b.published_chapters) ch
          WHERE json_extract(ch.value, '$.status') = 'published'
            AND json_type(ch.value, '$.publishedAt') IS NOT NULL
        ), 0) AS latest_published_at
      FROM books b
      ${whereClause}
    )
    SELECT *
    FROM filtered
    ORDER BY ${buildApprovedBooksOrderClause(query.sort ?? 'updated')}
    LIMIT @limit OFFSET @offset
  `).all(params) as BookRow[];

  return {
    items: rows.map(rowToBookListItem),
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(totalRow.total / pageSize),
  };
}

function buildApprovedBooksPageWhereClause(
  query: BookStoreListQuery,
  params: Record<string, unknown>,
  alias: string,
): string {
  // 演示环境无审核流程，pending 状态也展示
  const whereParts = [`(${alias}.publish_status = 'approved' OR ${alias}.publish_status = 'pending')`];

  if (query.category) {
    whereParts.push(`${alias}.category = @category`);
    params.category = query.category;
  }

  const tags = query.tags
    ?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean) ?? [];
  if (tags.length > 0) {
    const placeholders = tags.map((tag, index) => {
      const key = `tag${index}`;
      params[key] = tag;
      return `@${key}`;
    });
    whereParts.push(`EXISTS (
      SELECT 1 FROM json_each(${alias}.tags) tag
      WHERE tag.value IN (${placeholders.join(', ')})
    )`);
  }

  const keyword = query.keyword?.trim().toLowerCase();
  if (keyword) {
    whereParts.push(`(LOWER(${alias}.title) LIKE @keyword OR LOWER(${alias}.description) LIKE @keyword)`);
    params.keyword = `%${keyword}%`;
  }

  return `WHERE ${whereParts.join(' AND ')}`;
}

function buildApprovedBooksOrderClause(sort: NonNullable<BookStoreListQuery['sort']>): string {
  const updatedScore = `CASE
    WHEN latest_published_at > 0 THEN MAX(update_time, latest_published_at)
    WHEN update_time > publish_time THEN update_time
    ELSE 0
  END`;

  if (sort === 'hot') {
    return `(view_count + like_count * 20 + favorite_count * 30 + comment_count * 12) DESC, ${updatedScore} DESC, update_time DESC`;
  }

  if (sort === 'new') {
    return `publish_time DESC, ${updatedScore} DESC, update_time DESC`;
  }

  return `${updatedScore} DESC, update_time DESC`;
}

export function getBooksByUserIdPage(db: Database, query: UserBookStorePageQuery): PaginatedResponse<BookStore> {
  if (query.userIds.length === 0) {
    return { items: [], total: 0, page: 1, pageSize: query.pageSize, totalPages: 0 };
  }
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize)));
  const placeholders = query.userIds.map(() => '?').join(',');
  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM books WHERE user_id IN (${placeholders})`).get(...query.userIds) as { total: number };
  const rows = db.prepare(`
    SELECT * FROM books
    WHERE user_id IN (${placeholders})
    ORDER BY update_time DESC
    LIMIT ? OFFSET ?
  `).all(...query.userIds, pageSize, (page - 1) * pageSize) as BookRow[];

  return {
    items: rows.map(rowToBookListItem),
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(totalRow.total / pageSize),
  };
}

export function getAllBooks(db: Database): BookStore[] {
  const rows = db.prepare('SELECT * FROM books ORDER BY update_time DESC').all() as BookRow[];
  return rows.map(r => rowToBook(db, r));
}

export function getAllBooksPage(db: Database, query: BookStorePageQuery): PaginatedResponse<BookStore> {
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize)));
  const whereParts: string[] = [];
  const params: Record<string, unknown> = {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  if (query.status) {
    whereParts.push('publish_status = @status');
    params.status = query.status;
  }

  const keyword = query.keyword?.trim().toLowerCase();
  if (keyword) {
    whereParts.push('(LOWER(title) LIKE @keyword OR LOWER(description) LIKE @keyword OR LOWER(user_id) LIKE @keyword)');
    params.keyword = `%${keyword}%`;
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM books ${whereClause}`).get(params) as { total: number };
  const rows = db.prepare(`
    SELECT * FROM books
    ${whereClause}
    ORDER BY update_time DESC
    LIMIT @limit OFFSET @offset
  `).all(params) as BookRow[];

  return {
    items: rows.map(rowToBookListItem),
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(totalRow.total / pageSize),
  };
}

export function getCoverPendingBooksPage(
  db: Database,
  query: Pick<BookStorePageQuery, 'page' | 'pageSize'>,
): PaginatedResponse<BookStore> {
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize)));
  const totalRow = db.prepare(`
    SELECT COUNT(*) as total
    FROM books
    WHERE cover_audit_status = 'pending_review'
  `).get() as { total: number };
  const rows = db.prepare(`
    SELECT * FROM books
    WHERE cover_audit_status = 'pending_review'
    ORDER BY update_time DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, (page - 1) * pageSize) as BookRow[];

  return {
    items: rows.map(rowToBookListItem),
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(totalRow.total / pageSize),
  };
}

export function getApprovedBooks(db: Database): BookStore[] {
  const rows = db.prepare("SELECT * FROM books WHERE publish_status = 'approved' ORDER BY update_time DESC").all() as BookRow[];
  return rows.map(r => rowToBook(db, r));
}

/** 原子递增阅读量 */
export function incrementViewCount(db: Database, bookId: string): void {
  db.prepare('UPDATE books SET view_count = view_count + 1 WHERE id = ?').run(bookId);
}

/** 原子切换点赞，返回最新点赞数和状态 */
export function toggleLike(db: Database, bookId: string, userId: string): { likeCount: number; liked: boolean } {
  const existing = db.prepare('SELECT 1 FROM book_likes WHERE book_id = ? AND user_id = ?').get(bookId, userId);
  const toggle = db.transaction(() => {
    if (existing) {
      db.prepare('DELETE FROM book_likes WHERE book_id = ? AND user_id = ?').run(bookId, userId);
      db.prepare('UPDATE books SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(bookId);
      return false;
    } else {
      db.prepare('INSERT OR IGNORE INTO book_likes (book_id, user_id) VALUES (?, ?)').run(bookId, userId);
      db.prepare('UPDATE books SET like_count = like_count + 1 WHERE id = ?').run(bookId);
      return true;
    }
  });
  const liked = toggle() as boolean;
  const row = db.prepare('SELECT like_count FROM books WHERE id = ?').get(bookId) as { like_count: number } | undefined;
  return { likeCount: row?.like_count ?? 0, liked };
}

/** 原子切换收藏 */
export function toggleFavorite(db: Database, bookId: string, userId: string): { favoriteCount: number; favorited: boolean } {
  const existing = db.prepare('SELECT 1 FROM book_favorites WHERE book_id = ? AND user_id = ?').get(bookId, userId);
  const toggle = db.transaction(() => {
    if (existing) {
      db.prepare('DELETE FROM book_favorites WHERE book_id = ? AND user_id = ?').run(bookId, userId);
      db.prepare('UPDATE books SET favorite_count = MAX(0, favorite_count - 1) WHERE id = ?').run(bookId);
      return false;
    } else {
      db.prepare('INSERT OR IGNORE INTO book_favorites (book_id, user_id, created_at) VALUES (?, ?, ?)').run(bookId, userId, Date.now());
      db.prepare('UPDATE books SET favorite_count = favorite_count + 1 WHERE id = ?').run(bookId);
      return true;
    }
  });
  const favorited = toggle() as boolean;
  const row = db.prepare('SELECT favorite_count FROM books WHERE id = ?').get(bookId) as { favorite_count: number } | undefined;
  return { favoriteCount: row?.favorite_count ?? 0, favorited };
}

export function hasFavorited(db: Database, bookId: string, userId: string): boolean {
  return !!db.prepare('SELECT 1 FROM book_favorites WHERE book_id = ? AND user_id = ?').get(bookId, userId);
}

export function hasLiked(db: Database, bookId: string, userId: string): boolean {
  return !!db.prepare('SELECT 1 FROM book_likes WHERE book_id = ? AND user_id = ?').get(bookId, userId);
}

export function getFavoriteBookIds(db: Database, userId: string): string[] {
  return (db.prepare('SELECT book_id FROM book_favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Array<{ book_id: string }>).map(r => r.book_id);
}

export function getFavoriteBooksPage(
  db: Database,
  userId: string,
  query: Pick<BookStorePageQuery, 'page' | 'pageSize'>,
): PaginatedResponse<BookStore> {
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize)));
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM book_favorites WHERE user_id = ?').get(userId) as { total: number };
  const rows = db.prepare(`
    SELECT b.*
    FROM book_favorites f
    JOIN books b ON b.id = f.book_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, pageSize, (page - 1) * pageSize) as BookRow[];

  return {
    items: rows.map(rowToBookListItem),
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(totalRow.total / pageSize),
  };
}

// ==================== 评论操作 ====================

export function insertComment(db: Database, bookId: string, comment: BookStoreComment): void {
  db.prepare(`
    INSERT INTO book_comments (id, book_id, user_id, content, avatar_url, username, author_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(comment.id, bookId, comment.userId, comment.content, comment.avatarUrl ?? null, comment.username, comment.authorName ?? comment.username, comment.createdAt.getTime(), comment.updatedAt.getTime());
  db.prepare('UPDATE books SET comment_count = comment_count + 1, update_time = ? WHERE id = ?').run(Date.now(), bookId);
}

export function deleteComment(db: Database, bookId: string, commentId: string): number {
  db.prepare('DELETE FROM book_comments WHERE id = ? AND book_id = ?').run(commentId, bookId);
  const row = db.prepare('SELECT COUNT(*) as cnt FROM book_comments WHERE book_id = ?').get(bookId) as { cnt: number };
  const count = row.cnt;
  db.prepare('UPDATE books SET comment_count = ?, update_time = ? WHERE id = ?').run(count, Date.now(), bookId);
  return count;
}

export function getCommentsByUser(db: Database, userIds: string[]): Array<CommentRow & { book_title: string; book_cover: string; book_category: string }> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => '?').join(',');
  return db.prepare(`
    SELECT c.*, b.title as book_title, b.cover as book_cover, b.category as book_category
    FROM book_comments c JOIN books b ON c.book_id = b.id
    WHERE c.user_id IN (${placeholders})
    ORDER BY c.created_at DESC
  `).all(...userIds) as Array<CommentRow & { book_title: string; book_cover: string; book_category: string }>;
}

export function getCommentsByBookPage(
  db: Database,
  bookId: string,
  query: Pick<BookStorePageQuery, 'page' | 'pageSize'>,
): PaginatedResponse<BookStoreComment> {
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize)));
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM book_comments WHERE book_id = ?').get(bookId) as { total: number };
  const rows = db.prepare(`
    SELECT * FROM book_comments
    WHERE book_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(bookId, pageSize, (page - 1) * pageSize) as CommentRow[];

  return {
    items: rows.map(deserializeComment),
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(totalRow.total / pageSize),
  };
}

export function getCommentsByUserPage(
  db: Database,
  userIds: string[],
  query: Pick<BookStorePageQuery, 'page' | 'pageSize'>,
): PaginatedResponse<CommentRow & { book_title: string; book_cover: string; book_category: string }> {
  if (userIds.length === 0) {
    return { items: [], total: 0, page: 1, pageSize: query.pageSize, totalPages: 0 };
  }
  const page = Math.max(1, Math.floor(query.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(query.pageSize)));
  const placeholders = userIds.map(() => '?').join(',');
  const totalRow = db.prepare(`SELECT COUNT(*) as total FROM book_comments WHERE user_id IN (${placeholders})`).get(...userIds) as { total: number };
  const rows = db.prepare(`
    SELECT c.*, b.title as book_title, b.cover as book_cover, b.category as book_category
    FROM book_comments c JOIN books b ON c.book_id = b.id
    WHERE c.user_id IN (${placeholders})
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...userIds, pageSize, (page - 1) * pageSize) as Array<CommentRow & { book_title: string; book_cover: string; book_category: string }>;

  return {
    items: rows,
    total: totalRow.total,
    page,
    pageSize,
    totalPages: Math.ceil(totalRow.total / pageSize),
  };
}

// ==================== 同步辅助（用于迁移和完整更新）====================

function syncLikes(db: Database, bookId: string, likedBy: string[]): void {
  db.prepare('DELETE FROM book_likes WHERE book_id = ?').run(bookId);
  const stmt = db.prepare('INSERT OR IGNORE INTO book_likes (book_id, user_id) VALUES (?, ?)');
  for (const uid of likedBy) stmt.run(bookId, uid);
}

function syncFavorites(db: Database, bookId: string, favoritedBy: string[]): void {
  db.prepare('DELETE FROM book_favorites WHERE book_id = ?').run(bookId);
  const stmt = db.prepare('INSERT OR IGNORE INTO book_favorites (book_id, user_id, created_at) VALUES (?, ?, ?)');
  for (const uid of favoritedBy) stmt.run(bookId, uid, Date.now());
}

function syncComments(db: Database, bookId: string, comments: BookStoreComment[]): void {
  db.prepare('DELETE FROM book_comments WHERE book_id = ?').run(bookId);
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO book_comments (id, book_id, user_id, content, avatar_url, username, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of comments) {
    stmt.run(c.id ?? randomUUID(), bookId, c.userId, c.content, c.avatarUrl ?? null, c.username, c.createdAt.getTime(), c.updatedAt.getTime());
  }
}

/** 批量导入（用于从 JSON 迁移），在单个事务中完成 */
export function importBooks(db: Database, books: BookStore[]): void {
  const migrate = db.transaction(() => {
    for (const book of books) {
      const row = serializeBook(book);
      db.prepare(`
        INSERT OR REPLACE INTO books (id, novel_id, user_id, title, cover, description, category, tags,
          publish_status, audit_status, audit_result, audit_time, cover_audit_status, cover_locked,
          cover_audit_reject_reason, offline_reason, offline_time, view_count, like_count,
          favorite_count, comment_count, published_chapters, auto_update, publish_time, update_time)
        VALUES (@id, @novel_id, @user_id, @title, @cover, @description, @category, @tags,
          @publish_status, @audit_status, @audit_result, @audit_time, @cover_audit_status, @cover_locked,
          @cover_audit_reject_reason, @offline_reason, @offline_time, @view_count, @like_count,
          @favorite_count, @comment_count, @published_chapters, @auto_update, @publish_time, @update_time)
      `).run(row);
      syncLikes(db, book.id, book.likedBy ?? []);
      syncFavorites(db, book.id, book.favoritedBy ?? []);
      syncComments(db, book.id, book.comments ?? []);
    }
  });
  migrate();
}
