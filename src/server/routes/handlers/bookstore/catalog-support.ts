import type { AuthUser } from '../../../../auth/types.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { BookStore, PublishedChapter } from '../../../../bookstore/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { InteractiveConfig } from '../../../../interactive/types.js';

type InternalBookFields =
  | 'auditStatus' | 'auditResult' | 'auditTime'
  | 'offlineReason' | 'offlineTime'
  | 'coverAuditStatus' | 'coverLocked' | 'coverAuditRejectReason'
  | 'likedBy' | 'favoritedBy';

type ListInternalBookFields = InternalBookFields | 'comments';

export type PublicBookDetail = Omit<BookStore, InternalBookFields>;

export type PublicBookStore = Omit<BookStore, ListInternalBookFields>;

export type VisibleBookDetail = BookStore | PublicBookDetail;

export type MyPublishedBookMetrics = {
  totalChapterCount: number;
  publishedChapterCount: number;
  scheduledChapterCount: number;
  pendingAuditChapterCount: number;
  lastPublishedChapterNumber: number;
  nextScheduledAt?: string;
};

type MyPublishedBookSupportDeps = {
  bookStoreManager: Pick<BookStoreManager, 'getPublishedChapters'>;
  novelManager: Pick<NovelManager, 'countChapters'>;
};

export function sanitizePublicBookDetail(book: BookStore): PublicBookDetail {
  const {
    auditStatus: _auditStatus,
    auditResult: _auditResult,
    auditTime: _auditTime,
    offlineReason: _offlineReason,
    offlineTime: _offlineTime,
    coverAuditStatus: _coverAuditStatus,
    coverLocked: _coverLocked,
    coverAuditRejectReason: _coverAuditRejectReason,
    likedBy: _likedBy,
    favoritedBy: _favoritedBy,
    ...publicBook
  } = book;

  return publicBook;
}

export function sanitizePublicBookStore(book: BookStore): PublicBookStore {
  const {
    comments: _comments,
    ...publicBook
  } = sanitizePublicBookDetail(book);

  return publicBook;
}

export function resolveBookDetailVisibility(
  book: BookStore,
  auth?: AuthUser,
): VisibleBookDetail {
  if (auth?.role === 'admin' || (auth?.id && auth.id === book.userId)) {
    return book;
  }

  return sanitizePublicBookDetail(book);
}

export function resolveBookRequestIp(params: {
  forwardedFor?: string | string[];
  remoteAddress?: string | null;
}): string {
  const forwardedFor = Array.isArray(params.forwardedFor)
    ? params.forwardedFor[0]
    : params.forwardedFor;

  return forwardedFor?.split(',')[0]?.trim() || params.remoteAddress || 'unknown';
}

export async function buildMyPublishedBookItems<T extends { id: string; novelId: string }>(
  books: T[],
  deps: MyPublishedBookSupportDeps,
): Promise<Array<T & MyPublishedBookMetrics>> {
  return Promise.all(books.map((book) => buildMyPublishedBookItem(book, deps)));
}

async function buildMyPublishedBookItem<T extends { id: string; novelId: string }>(
  book: T,
  { bookStoreManager, novelManager }: MyPublishedBookSupportDeps,
): Promise<T & MyPublishedBookMetrics> {
  const totalChapterCount = await novelManager.countChapters(book.novelId).catch(() => 0);
  const chapterEntries = await bookStoreManager.getPublishedChapters(book.id);
  const publishedEntries = chapterEntries.filter((entry) => entry.status === 'published');
  const scheduledEntries = chapterEntries.filter((entry) => entry.status === 'scheduled');
  const pendingAuditEntries = chapterEntries.filter((entry) => entry.status === 'pending_audit');

  return {
    ...book,
    totalChapterCount,
    publishedChapterCount: publishedEntries.length,
    scheduledChapterCount: scheduledEntries.length,
    pendingAuditChapterCount: pendingAuditEntries.length,
    lastPublishedChapterNumber: publishedEntries.reduce(
      (max, entry) => Math.max(max, entry.chapterNumber),
      0,
    ),
    nextScheduledAt: resolveNextScheduledAt(scheduledEntries),
  };
}

function resolveNextScheduledAt(entries: PublishedChapter[]): string | undefined {
  return entries
    .map((entry) => entry.scheduledAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0]
    ?.toISOString();
}

/**
 * 判断小说是否已开启互动连载模式。
 * 供书城列表/详情接口注入 `interactive` 标识字段，供前端展示徽章。
 */
export async function resolveInteractiveFlag(
  novelManager: NovelManager,
  novelId: string,
): Promise<boolean> {
  try {
    const novel = await novelManager.getNovel(novelId);
    const cfg = novel.interactiveConfig as InteractiveConfig | undefined;
    return !!cfg?.enabled;
  } catch {
    return false;
  }
}
