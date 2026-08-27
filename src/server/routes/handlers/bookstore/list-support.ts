import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import type { BookStore, BookStoreListQuery, PaginatedResponse } from '../../../../bookstore/types.js';
import type { BookStoreSort } from '../../../../bookstore/storefront-types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import { resolveBookAuthorName } from './author-name-resolver.js';
import { sanitizePublicBookStore } from './catalog-support.js';
import { listPublicReaderChapters } from './public-reader-data.js';

export type BookStoreListItem = ReturnType<typeof sanitizePublicBookStore> & {
  authorName: string;
  chapterCount: number;
  wordCount: number;
  publishedChapterCount: number;
  publishedWordCount: number;
  interactive: boolean;
};

export type BookStoreListResponse = PaginatedResponse<BookStoreListItem> & {
  appliedSort: BookStoreSort;
};

export async function buildBookStoreListResponse(
  bookStoreManager: BookStoreManager,
  novelManager: NovelManager,
  query: BookStoreListQuery,
  appliedSort: BookStoreSort,
  contentAuditService?: ContentAuditService,
  authDb?: AuthDb,
): Promise<BookStoreListResponse> {
  const result = await bookStoreManager.listBooks(query);
  const items = await enrichBookStoreItems(
    result.items,
    bookStoreManager,
    novelManager,
    contentAuditService,
    authDb,
  );

  return {
    ...result,
    items,
    appliedSort,
  };
}

export async function enrichBookStoreItems(
  books: BookStore[],
  bookStoreManager: BookStoreManager,
  novelManager: NovelManager,
  contentAuditService?: ContentAuditService,
  authDb?: AuthDb,
): Promise<BookStoreListItem[]> {
  // 1. 批量获取所有书的 interactive 标志（原本 N+1 串行 getNovel → 一次并发读 + Map 归并）
  const interactiveFlags = await novelManager.getInteractiveFlagsByNovelIds(
    books.map((book) => book.novelId),
  );

  // 2. 批量处理所有书的作者名（已有 Map 缓存，并发即可）
  const authorNameCache = new Map<string, Promise<string>>();
  return Promise.all(
    books.map((book) => enrichBookStoreListItem(
      book,
      bookStoreManager,
      novelManager,
      contentAuditService,
      authDb,
      authorNameCache,
      interactiveFlags.get(book.novelId) ?? false,
    )),
  );
}

async function enrichBookStoreListItem(
  book: BookStore,
  bookStoreManager: BookStoreManager,
  novelManager: NovelManager,
  contentAuditService?: ContentAuditService,
  authDb?: AuthDb,
  authorNameCache?: Map<string, Promise<string>>,
  interactiveFlag?: boolean,
): Promise<BookStoreListItem> {
  const stats = await resolvePublishedChapterStats(
    book,
    bookStoreManager,
    novelManager,
    contentAuditService,
  );
  const authorName = await resolveBookAuthorName(book, authDb, authorNameCache);
  const publicBook = sanitizePublicBookStore(book);
  // interactive 标志已在 enrichBookStoreItems 批量解析，此处直接复用，避免再次 N+1
  const interactive = interactiveFlag ?? false;

  return {
    ...publicBook,
    authorName,
    chapterCount: stats.chapterCount,
    wordCount: stats.wordCount,
    publishedChapterCount: stats.chapterCount,
    publishedWordCount: stats.wordCount,
    interactive,
  };
}

export async function resolvePublishedChapterStats(
  book: BookStore,
  bookStoreManager: BookStoreManager,
  novelManager: NovelManager,
  contentAuditService?: ContentAuditService,
): Promise<{ chapterCount: number; wordCount: number }> {
  const publishedChapters = (book.publishedChapters ?? []).filter(c => c.status === 'published');
  const cachedStats = {
    chapterCount: publishedChapters.length,
    wordCount: publishedChapters.reduce((sum, c) => sum + normalizeWordCount(c.wordCount), 0),
  };

  if (publishedChapters.length > 0 && publishedChapters.every(hasReliableWordCount)) {
    return cachedStats;
  }

  const resolvedChapters = await listPublicReaderChapters({
    bookId: book.id,
    novelId: book.novelId,
    bookStoreManager,
    novelManager,
    contentAuditService,
  }).catch(() => []);

  if (resolvedChapters.length === 0) {
    return cachedStats;
  }

  return {
    chapterCount: resolvedChapters.length,
    wordCount: resolvedChapters.reduce((sum, chapter) => sum + normalizeWordCount(chapter.wordCount), 0),
  };
}

function hasReliableWordCount(chapter: { wordCount?: number }): boolean {
  return Number.isFinite(chapter.wordCount) && (chapter.wordCount ?? 0) > 0;
}

function normalizeWordCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value ?? 0));
}
