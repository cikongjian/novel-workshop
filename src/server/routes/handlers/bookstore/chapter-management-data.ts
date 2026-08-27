import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { BookStore, PublishedChapter } from '../../../../bookstore/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';

export type BookStoreManageChapterItem = {
  chapterNumber: number;
  title: string;
  wordCount: number;
  updatedAt?: string;
  status: 'unpublished' | 'hidden' | 'scheduled' | 'pending_audit' | 'published';
  scheduledAt?: string;
  submittedAt?: string;
  publishedAt?: string;
};

export type BookStoreManageChaptersPayload = {
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
  items: BookStoreManageChapterItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type BuildManageChapterPageDeps = {
  bookStoreManager: Pick<BookStoreManager, 'getPublishedChapters'>;
  novelManager: Pick<NovelManager, 'listChapterPage'>;
};

export async function buildBookStoreManageChapterPage(
  bookId: string,
  book: Pick<BookStore, 'novelId'>,
  deps: BuildManageChapterPageDeps,
  params: { page: number; pageSize: number },
): Promise<BookStoreManageChaptersPayload> {
  const [chapterPage, chapterEntries] = await Promise.all([
    deps.novelManager.listChapterPage(book.novelId, {
      page: params.page,
      pageSize: params.pageSize,
      order: 'asc',
    }),
    deps.bookStoreManager.getPublishedChapters(bookId),
  ]);
  const entryMap = new Map(chapterEntries.map((entry) => [entry.chapterNumber, entry]));
  const publishedEntries = chapterEntries.filter((entry) => entry.status === 'published');
  const scheduledEntries = chapterEntries.filter((entry) => entry.status === 'scheduled');
  const pendingAuditEntries = chapterEntries.filter((entry) => entry.status === 'pending_audit');

  return {
    bookId,
    novelId: book.novelId,
    summary: {
      total: chapterPage.total,
      published: publishedEntries.length,
      scheduled: scheduledEntries.length,
      pendingAudit: pendingAuditEntries.length,
      hidden: chapterEntries.filter((entry) => entry.status === 'hidden').length,
      unpublished: Math.max(0, chapterPage.total - chapterEntries.length),
      lastPublishedChapterNumber: publishedEntries.reduce((max, entry) => Math.max(max, entry.chapterNumber), 0),
      nextScheduledAt: resolveNextScheduledAt(scheduledEntries),
    },
    items: chapterPage.items.map((chapter) => {
      const entry = entryMap.get(chapter.chapterNumber);
      return {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        wordCount: chapter.wordCount ?? 0,
        updatedAt: chapter.updatedAt,
        status: entry?.status ?? 'unpublished',
        scheduledAt: entry?.scheduledAt?.toISOString(),
        submittedAt: entry?.submittedAt?.toISOString(),
        publishedAt: entry?.publishedAt?.toISOString(),
      };
    }),
    page: chapterPage.page,
    pageSize: chapterPage.pageSize,
    hasMore: chapterPage.hasMore,
  };
}

function resolveNextScheduledAt(entries: PublishedChapter[]): string | undefined {
  return entries
    .map((entry) => entry.scheduledAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0]
    ?.toISOString();
}
