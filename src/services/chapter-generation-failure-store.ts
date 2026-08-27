import path from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from '../novel/fs-helpers.js';
import { NovelPaths } from '../novel/novel-paths.js';
import type { NovelManager } from '../novel/novel-manager.js';

const ChapterGenerationFailure = z.object({
  chapterNumber: z.number().int().positive(),
  errorCode: z.string().min(1).max(160),
  errorMessage: z.string().max(2_000),
  retryable: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type ChapterGenerationFailure = z.infer<typeof ChapterGenerationFailure>;

function failureStorePath(novelManager: NovelManager, novelId: string): string {
  const paths = new NovelPaths(novelManager.getDataDir());
  return path.join(paths.novelDir(novelId), 'chapter-generation-failures.json');
}

export async function listChapterGenerationFailures(
  novelManager: NovelManager,
  novelId: string,
): Promise<ChapterGenerationFailure[]> {
  const raw = await readJson<unknown[]>(failureStorePath(novelManager, novelId), []);
  return raw.flatMap((entry) => {
    const parsed = ChapterGenerationFailure.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function recordChapterGenerationFailure(
  novelManager: NovelManager,
  novelId: string,
  failure: ChapterGenerationFailure,
): Promise<void> {
  const parsed = ChapterGenerationFailure.parse(failure);
  const existing = await listChapterGenerationFailures(novelManager, novelId);
  const next = [parsed, ...existing.filter(item => item.chapterNumber !== parsed.chapterNumber)]
    .sort((left, right) => left.chapterNumber - right.chapterNumber);
  await writeJson(failureStorePath(novelManager, novelId), next);
}

export async function clearChapterGenerationFailure(
  novelManager: NovelManager,
  novelId: string,
  chapterNumber: number,
): Promise<void> {
  const existing = await listChapterGenerationFailures(novelManager, novelId);
  const next = existing.filter(item => item.chapterNumber !== chapterNumber);
  if (next.length === existing.length) return;
  await writeJson(failureStorePath(novelManager, novelId), next);
}
