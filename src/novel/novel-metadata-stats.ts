import type { ChapterSummary } from './chapter-repository.js';

export type NovelMetadataStats = {
  chapterCount: number;
  finalizedChapterCount: number;
  wordCount: number;
};

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

export function calculateNovelMetadataStats(chapters: ChapterSummary[]): NovelMetadataStats {
  return {
    chapterCount: chapters.length,
    finalizedChapterCount: chapters.filter((chapter) => chapter.status === 'finalized').length,
    wordCount: chapters.reduce((sum, chapter) => sum + normalizeCount(chapter.wordCount), 0),
  };
}

export function shouldHydrateNovelMetadataStats(raw: Record<string, unknown>, chapterCount: number): boolean {
  const wordCount = normalizeCount(raw.wordCount);
  const hasWordCount = typeof raw.wordCount === 'number' && Number.isFinite(raw.wordCount) && raw.wordCount >= 0;
  const hasFinalizedChapterCount = typeof raw.finalizedChapterCount === 'number'
    && Number.isFinite(raw.finalizedChapterCount)
    && raw.finalizedChapterCount >= 0;

  if (!hasWordCount || !hasFinalizedChapterCount) {
    return chapterCount > 0;
  }

  return chapterCount > 0 && wordCount === 0;
}
