import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getNovelsDir } from '../../../../config/index.js';
import { resolveNovelStorageDir } from '../../../../novel/data-root.js';

export const AudiobookCatalogQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type AudiobookCatalogQueryParams = z.infer<typeof AudiobookCatalogQuery>;

type AudiobookFileEntry = {
  file: string;
  chapterNumber: number;
};

export type AudiobookEntry = {
  chapterNumber: number;
  title: string;
  segmentCount: number;
  totalDuration: number;
  synthesizedAt: string;
  fileSize: number;
};

export type AudiobookCatalogResult = {
  entries: AudiobookEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function listAudiobookCatalog(
  novelId: string,
  query: AudiobookCatalogQueryParams = {},
): Promise<AudiobookCatalogResult> {
  const novelDir = resolveNovelStorageDir(getNovelsDir(), novelId);
  const ttsDir = path.join(novelDir, 'tts');
  const order = query.order ?? 'asc';
  const page = query.page ?? 1;
  const requestedPageSize = query.pageSize;

  let files: string[];
  try {
    files = await fs.readdir(ttsDir);
  } catch {
    return emptyCatalog(page, requestedPageSize ?? 0);
  }

  const allEntries = files
    .map(toAudiobookFileEntry)
    .filter((entry): entry is AudiobookFileEntry => entry !== null)
    .sort((left, right) => (
      order === 'desc'
        ? right.chapterNumber - left.chapterNumber
        : left.chapterNumber - right.chapterNumber
    ));

  const total = allEntries.length;
  const pageSize = requestedPageSize ?? total;
  const start = requestedPageSize ? (page - 1) * pageSize : 0;
  const selectedEntries = requestedPageSize
    ? allEntries.slice(start, start + pageSize)
    : allEntries;

  const results = await Promise.allSettled(
    selectedEntries.map(entry => readAudiobookEntry(novelDir, ttsDir, entry)),
  );
  const entries = results
    .map(result => (result.status === 'fulfilled' ? result.value : null))
    .filter((entry): entry is AudiobookEntry => entry !== null);

  return {
    entries,
    total,
    page,
    pageSize,
    hasMore: requestedPageSize ? start + pageSize < total : false,
  };
}

function emptyCatalog(page: number, pageSize: number): AudiobookCatalogResult {
  return { entries: [], total: 0, page, pageSize, hasMore: false };
}

function toAudiobookFileEntry(file: string): AudiobookFileEntry | null {
  const match = /^chapter-(\d+)\.json$/.exec(file);
  if (!match) return null;
  return {
    file,
    chapterNumber: Number(match[1]),
  };
}

async function readAudiobookEntry(
  novelDir: string,
  ttsDir: string,
  entry: AudiobookFileEntry,
): Promise<AudiobookEntry | null> {
  const filePath = path.join(ttsDir, entry.file);
  try {
    const [stat, raw, title] = await Promise.all([
      fs.stat(filePath),
      fs.readFile(filePath, 'utf-8'),
      readChapterTitle(novelDir, entry.chapterNumber),
    ]);
    const segments = JSON.parse(raw) as Array<{ duration?: number }>;
    const totalDuration = segments.reduce((sum, segment) => sum + (segment.duration ?? 0), 0);
    return {
      chapterNumber: entry.chapterNumber,
      title: title || `第 ${entry.chapterNumber} 章`,
      segmentCount: segments.length,
      totalDuration,
      synthesizedAt: stat.mtime.toISOString(),
      fileSize: stat.size,
    };
  } catch {
    return null;
  }
}

async function readChapterTitle(novelDir: string, chapterNumber: number): Promise<string> {
  const fileName = `${String(chapterNumber).padStart(3, '0')}.json`;
  const metaPath = path.join(novelDir, 'chapters', fileName);
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(raw) as { title?: unknown };
    return typeof meta.title === 'string' ? meta.title : '';
  } catch {
    return '';
  }
}
