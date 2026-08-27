import fs from 'node:fs/promises';
import { z } from 'zod';
import type { NovelPaths } from './novel-paths.js';
import { readJson } from './fs-helpers.js';

const BindingModelConfig = z.object({
  provider: z.enum([
    'anthropic', 'openai', 'custom-openai', 'ollama', 'deepseek', 'qwen', 'zhipu',
    'moonshot', 'doubao', 'baichuan', 'stepfun', 'minimax', 'siliconflow',
  ]),
  source: z.enum(['platform', 'user-profile']).default('platform'),
  userApiProfileId: z.string().uuid().optional(),
  userApiProfileStorageMode: z.enum(['server', 'local']).optional(),
  userApiProfileName: z.string().max(80).optional(),
  model: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.7),
}).strip();

export const NovelBindingSummary = z.object({
  id: z.string().uuid(),
  syncId: z.string().uuid().optional(),
  title: z.string().min(1),
  genre: z.enum(['fantasy', 'mystery', 'modern', 'scifi', 'historical', 'romance', 'custom']),
  status: z.enum(['planning', 'writing', 'paused', 'completed', 'published']),
  synopsis: z.string().default(''),
  description: z.string().default(''),
  chapterCount: z.number().int().nonnegative().default(0),
  modelConfig: BindingModelConfig.optional(),
  ownerId: z.string().default('dev'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type NovelBindingSummary = z.infer<typeof NovelBindingSummary>;

export async function listNovelBindingSummaries(
  paths: NovelPaths,
): Promise<NovelBindingSummary[]> {
  const novelsDir = paths.novelsDir();
  await fs.mkdir(novelsDir, { recursive: true });
  const legacyNovelsDir = paths.legacyNovelsDir();
  const [directEntries, legacyEntries] = await Promise.all([
    fs.readdir(novelsDir, { withFileTypes: true }),
    fs.readdir(legacyNovelsDir, { withFileTypes: true }).catch(() => [] as Array<{ name: string; isDirectory(): boolean }>),
  ]);

  const ids = new Set<string>();
  for (const entry of [...directEntries, ...legacyEntries]) {
    if (entry.isDirectory()) ids.add(entry.name);
  }

  const summaries: NovelBindingSummary[] = [];
  const batchSize = 10;
  const novelIds = [...ids];
  for (let i = 0; i < novelIds.length; i += batchSize) {
    const batch = novelIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(async (novelId) => {
      const raw = await readJson<Record<string, unknown> | null>(paths.novelMetaPath(novelId), null);
      if (!raw) return null;
      return NovelBindingSummary.parse({
        ...raw,
        chapterCount: await countChapterMetas(paths, novelId, raw.chapterCount),
      });
    }));
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        summaries.push(result.value);
      }
    }
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function countChapterMetas(
  paths: NovelPaths,
  novelId: string,
  fallback: unknown,
): Promise<number> {
  try {
    const files = await fs.readdir(paths.chaptersDir(novelId));
    return files.filter(file => /^\d+\.json$/.test(file)).length;
  } catch {
    return typeof fallback === 'number' && Number.isFinite(fallback)
      ? Math.max(0, Math.trunc(fallback))
      : 0;
  }
}
