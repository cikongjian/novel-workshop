import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { cleanPublicFacingContent } from '../../../../utils/public-facing-content.js';
import { countWords } from '../../../../utils/text.js';

export type PublicReaderResolvedChapter = {
  chapterNumber: number;
  title: string;
  wordCount: number;
  updatedAt?: string;
  content?: string;
  source: 'novel' | 'audit-fallback';
};

export type PublicReaderChapterPage = {
  items: PublicReaderResolvedChapter[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

type ReaderDataDeps = {
  bookId: string;
  novelId: string;
  bookStoreManager: BookStoreManager;
  novelManager: Pick<NovelManager, 'getChapter' | 'listChapterSummariesByNumbers'>;
  contentAuditService?: ContentAuditService;
};

function normalizeChapterTitle(chapterNumber: number, title?: string): string {
  return title?.trim() || `第${chapterNumber}章`;
}

function stripSpeakerMarkers(content: string): string {
  return cleanPublicFacingContent(content);
}

async function getPublishedChapterSet(
  bookId: string,
  bookStoreManager: BookStoreManager,
): Promise<Set<number>> {
  const publishedEntries = await bookStoreManager.getPublishedChapters(bookId);
  return new Set(
    publishedEntries
      .filter((entry) => entry.status === 'published')
      .map((entry) => entry.chapterNumber),
  );
}

async function getAuditFallbackChapterMap(
  novelId: string,
  contentAuditService?: ContentAuditService,
): Promise<Map<number, PublicReaderResolvedChapter>> {
  if (!contentAuditService) return new Map();

  const audits = await contentAuditService.getNovelAudits(novelId);
  const latestPassedAuditByChapter = new Map<number, (typeof audits)[number]>();

  for (const audit of audits) {
    if (audit.status !== 'pass') continue;
    const chapterNumber = Number.parseInt(audit.chapterId ?? '', 10);
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) continue;

    const existing = latestPassedAuditByChapter.get(chapterNumber);
    if (!existing || audit.auditTime.getTime() > existing.auditTime.getTime()) {
      latestPassedAuditByChapter.set(chapterNumber, audit);
    }
  }

  const resolved = new Map<number, PublicReaderResolvedChapter>();
  for (const [chapterNumber, audit] of latestPassedAuditByChapter.entries()) {
    const content = stripSpeakerMarkers(audit.content ?? '');
    resolved.set(chapterNumber, {
      chapterNumber,
      title: normalizeChapterTitle(chapterNumber),
      wordCount: countWords(content),
      updatedAt: audit.auditTime.toISOString(),
      content,
      source: 'audit-fallback',
    });
  }

  return resolved;
}

export async function listPublicReaderChapters(
  deps: ReaderDataDeps,
): Promise<PublicReaderResolvedChapter[]> {
  const publishedChapterSet = await getPublishedChapterSet(deps.bookId, deps.bookStoreManager);
  if (publishedChapterSet.size === 0) {
    return [];
  }

  const publishedChapterNumbers = [...publishedChapterSet].sort((left, right) => left - right);
  return resolvePublicReaderChaptersForNumbers(deps, publishedChapterNumbers);
}

export async function listPublicReaderChapterPage(
  deps: ReaderDataDeps & { page?: number; pageSize?: number; order?: 'asc' | 'desc' },
): Promise<PublicReaderChapterPage> {
  const page = Math.max(1, Math.trunc(deps.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(deps.pageSize ?? 80)));
  const publishedChapterSet = await getPublishedChapterSet(deps.bookId, deps.bookStoreManager);
  const publishedChapterNumbers = [...publishedChapterSet].sort((left, right) => (
    deps.order === 'desc' ? right - left : left - right
  ));
  const total = publishedChapterNumbers.length;
  const start = (page - 1) * pageSize;
  const pageChapterNumbers = publishedChapterNumbers.slice(start, start + pageSize);
  const items = await resolvePublicReaderChaptersForNumbers(deps, pageChapterNumbers);

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };
}

async function resolvePublicReaderChaptersForNumbers(
  deps: ReaderDataDeps,
  publishedChapterNumbers: number[],
): Promise<PublicReaderResolvedChapter[]> {
  if (publishedChapterNumbers.length === 0) {
    return [];
  }

  const visibleNovelChapters = await deps.novelManager
    .listChapterSummariesByNumbers(deps.novelId, publishedChapterNumbers)
    .catch(() => []);
  const visibleNovelChapterMap = new Map(
    visibleNovelChapters.map((chapter) => [
      chapter.chapterNumber,
      {
        chapterNumber: chapter.chapterNumber,
        title: normalizeChapterTitle(chapter.chapterNumber, chapter.title),
        wordCount: chapter.wordCount ?? 0,
        updatedAt: chapter.updatedAt,
        source: 'novel' as const,
      },
    ]),
  );
  const missingChapterNumbers = publishedChapterNumbers.filter(
    (chapterNumber) => !visibleNovelChapterMap.has(chapterNumber),
  );
  const fallbackChapterMap = missingChapterNumbers.length > 0
    ? await getAuditFallbackChapterMap(deps.novelId, deps.contentAuditService)
    : new Map<number, PublicReaderResolvedChapter>();

  return publishedChapterNumbers
    .flatMap((chapterNumber) => {
      const chapter = visibleNovelChapterMap.get(chapterNumber)
        ?? fallbackChapterMap.get(chapterNumber);
      if (!chapter) return [];
      return [{
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        wordCount: chapter.wordCount,
        updatedAt: chapter.updatedAt,
        source: chapter.source,
      }];
    });
}

export async function getPublicReaderChapterContent(
  deps: ReaderDataDeps & { chapterNumber: number },
): Promise<PublicReaderResolvedChapter | null> {
  const publishedChapterSet = await getPublishedChapterSet(deps.bookId, deps.bookStoreManager);
  if (!publishedChapterSet.has(deps.chapterNumber)) {
    return null;
  }

  const chapter = await deps.novelManager.getChapter(deps.novelId, deps.chapterNumber).catch(() => null);
  if (chapter) {
    const content = stripSpeakerMarkers(chapter.content ?? '');
    return {
      chapterNumber: chapter.chapterNumber,
      title: normalizeChapterTitle(chapter.chapterNumber, chapter.title),
      content,
      wordCount: chapter.wordCount ?? countWords(content),
      updatedAt: chapter.updatedAt,
      source: 'novel',
    };
  }

  const fallbackChapterMap = await getAuditFallbackChapterMap(deps.novelId, deps.contentAuditService);
  return fallbackChapterMap.get(deps.chapterNumber) ?? null;
}
