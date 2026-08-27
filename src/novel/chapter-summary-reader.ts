import fs from 'node:fs/promises';
import path from 'node:path';
import type { NovelPaths } from './novel-paths.js';
import { pathExists, readJson } from './fs-helpers.js';
import type { ChapterSummary } from './chapter-repository.js';

type ChapterFileEntry = {
  file: string;
  chapterNumber: number;
};

export async function countChapterSummaries(
  paths: NovelPaths,
  novelId: string,
): Promise<number> {
  const entries = await listChapterFileEntries(paths, novelId);
  return entries.length;
}

export async function listChapterSummariesByNumbers(
  paths: NovelPaths,
  novelId: string,
  chapterNumbers: number[],
): Promise<ChapterSummary[]> {
  const uniqueNumbers = [...new Set(
    chapterNumbers
      .map((value) => Math.trunc(value))
      .filter((value) => Number.isFinite(value) && value > 0),
  )].sort((left, right) => left - right);

  const results = await Promise.allSettled(
    uniqueNumbers.map((chapterNumber) => readChapterSummary(paths, novelId, chapterNumber)),
  );

  return results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((item): item is ChapterSummary => item !== null)
    .sort((left, right) => left.chapterNumber - right.chapterNumber);
}

export async function findLatestChapterNumber(
  paths: NovelPaths,
  novelId: string,
  params: { preferWritten?: boolean; batchSize?: number } = {},
): Promise<number> {
  const preferWritten = params.preferWritten !== false;
  const batchSize = Math.max(1, Math.min(100, Math.trunc(params.batchSize ?? 50)));
  const entries = (await listChapterFileEntries(paths, novelId))
    .sort((left, right) => right.chapterNumber - left.chapterNumber);

  if (entries.length === 0) {
    return 0;
  }
  if (!preferWritten) {
    return entries[0].chapterNumber;
  }

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((entry) => readJson<Record<string, unknown>>(
        path.join(paths.chaptersDir(novelId), entry.file),
        {},
      )),
    );
    const written = results
      .map((result) => (result.status === 'fulfilled' ? toChapterSummary(result.value) : null))
      .filter((item): item is ChapterSummary => item !== null)
      .find((chapter) => chapter.wordCount > 0 || chapter.status !== 'outlined');

    if (written) {
      return written.chapterNumber;
    }
  }

  return entries[0].chapterNumber;
}

export async function readChapterSummary(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
): Promise<ChapterSummary | null> {
  const raw = await readJson<Record<string, unknown> | null>(
    paths.chapterMetaPath(novelId, chapterNumber),
    null,
  );
  return raw ? toChapterSummary(raw) : null;
}

export async function listChapterFileEntries(
  paths: NovelPaths,
  novelId: string,
): Promise<ChapterFileEntry[]> {
  const chapDir = paths.chaptersDir(novelId);
  if (!(await pathExists(chapDir))) {
    return [];
  }

  return (await fs.readdir(chapDir))
    .map(toChapterFileEntry)
    .filter((entry): entry is ChapterFileEntry => entry !== null);
}

function toChapterFileEntry(file: string): ChapterFileEntry | null {
  const match = /^(\d+)\.json$/.exec(file);
  if (!match) return null;
  return {
    file,
    chapterNumber: Number(match[1]),
  };
}

export function toChapterSummary(meta: Record<string, unknown>): ChapterSummary | null {
  if (meta.chapterNumber === undefined) return null;

  const diagnosticsRaw = meta.diagnostics as Record<string, unknown> | undefined;
  const startupOpeningRaw = diagnosticsRaw?.startupOpeningReport as Record<string, unknown> | undefined;
  const lengthGuardRaw = diagnosticsRaw?.chapterLengthGuard as Record<string, unknown> | undefined;

  return {
    chapterNumber: Number(meta.chapterNumber),
    title: (meta.title as string) ?? '',
    status: (meta.status as string) ?? 'outlined',
    wordCount: Number(meta.wordCount ?? 0),
    summary: (meta.summary as string) ?? '',
    readerScore: meta.readerScore as number | undefined,
    diagnostics: startupOpeningRaw || lengthGuardRaw
      ? {
          startupOpening: startupOpeningRaw
            ? {
                overallScore: Number(startupOpeningRaw.overallScore ?? 0),
                passed: startupOpeningRaw.passed !== false,
                findingsCount: Array.isArray(startupOpeningRaw.findings) ? startupOpeningRaw.findings.length : 0,
                platformProfile: (startupOpeningRaw.platformProfile as 'auto' | 'fanqie' | 'qidian') ?? 'auto',
              }
            : undefined,
          lengthGuard: lengthGuardRaw
            ? {
                triggered: lengthGuardRaw.triggered === true,
                usedFallbackTrim: lengthGuardRaw.usedFallbackTrim === true,
                finalWordCount: Number(lengthGuardRaw.finalWordCount ?? 0),
              }
            : undefined,
        }
      : undefined,
    updatedAt: (meta.updatedAt as string) ?? '',
  };
}
