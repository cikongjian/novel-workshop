import path from 'node:path';
import type { NovelPaths } from './novel-paths.js';
import { readJson } from './fs-helpers.js';
import type { ChapterSummary } from './chapter-repository.js';
import {
  listChapterFileEntries,
  toChapterSummary,
} from './chapter-summary-reader.js';

export type ChapterPageOrder = 'asc' | 'desc';

export type ChapterPageParams = {
  page: number;
  pageSize: number;
  order?: ChapterPageOrder;
};

export type ChapterPageResult = {
  items: ChapterSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function listChapterPage(
  paths: NovelPaths,
  novelId: string,
  params: ChapterPageParams,
): Promise<ChapterPageResult> {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.max(1, Math.min(100, Math.floor(params.pageSize)));
  const order = params.order ?? 'asc';
  const chapDir = paths.chaptersDir(novelId);

  const entries = (await listChapterFileEntries(paths, novelId))
    .sort((left, right) => (
      order === 'desc'
        ? right.chapterNumber - left.chapterNumber
        : left.chapterNumber - right.chapterNumber
    ));

  const total = entries.length;
  const start = (page - 1) * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);
  const results = await Promise.allSettled(
    pageEntries.map((entry) => readJson<Record<string, unknown>>(path.join(chapDir, entry.file), {})),
  );

  const items = results
    .map((result) => (result.status === 'fulfilled' ? toChapterSummary(result.value) : null))
    .filter((item): item is ChapterSummary => item !== null)
    .sort((left, right) => (
      order === 'desc'
        ? right.chapterNumber - left.chapterNumber
        : left.chapterNumber - right.chapterNumber
    ));

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };
}
