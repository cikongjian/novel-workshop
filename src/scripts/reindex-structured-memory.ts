import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getNovelsDir } from '../config/index.js';
import { createEmbeddingClient } from '../models/provider.js';
import { NovelMemory } from '../memory/novel-memory.js';
import {
  CharacterStateSnapshot as CharacterStateSnapshotSchema,
  PlotThreadSnapshot as PlotThreadSnapshotSchema,
  type CharacterStateSnapshot,
  type PlotThreadSnapshot,
} from '../novel/types.js';
import { FactGraph as FactGraphSchema } from '../novel/fact-graph-types.js';

type CliOptions = {
  novelId: string;
  clearFirst: boolean;
  help?: boolean;
};

export type ReindexStructuredMemoryCliOptions = CliOptions;

export type ReindexStructuredMemorySummary = {
  novelId: string;
  contentDir: string;
  clearFirst: boolean;
  indexedStates: number;
  indexedThreads: number;
  indexedFacts: number;
  totalChunks: number;
  categories: Awaited<ReturnType<NovelMemory['getMemoryStats']>>['categories'];
  complete: boolean;
  durationMs: number;
};

function parseReindexStructuredMemoryArgs(argv: string[]): CliOptions {
  let novelId = '';
  let clearFirst = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--novel' && argv[i + 1]) {
      novelId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--clear-first') {
      clearFirst = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
  }

  if (!help && !novelId) {
    throw new Error('缺少 --novel <novelId>');
  }

  return { novelId, clearFirst, help };
}

function formatReindexStructuredMemoryHelp(invocation = 'node dist/scripts/reindex-structured-memory.js'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --novel <novelId>   必填，目标小说 ID',
    '  --clear-first       建索引前先清空 fact/thread/character_state 分类',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --novel <novelId>`,
    `  ${invocation} --novel <novelId> --clear-first`,
  ].join('\n');
}

function printReindexStructuredMemoryHelp(invocation?: string): void {
  console.log(formatReindexStructuredMemoryHelp(invocation));
}

async function readJsonArray(filePath: string): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveContentDir(novelsDir: string, novelId: string): Promise<string> {
  const nested = path.join(novelsDir, 'novels', novelId);
  try {
    await fs.access(nested);
    return nested;
  } catch {
    return path.join(novelsDir, novelId);
  }
}

export async function executeReindexStructuredMemory(options: CliOptions): Promise<ReindexStructuredMemorySummary> {
  const config = getConfig();
  const embeddingClient = createEmbeddingClient(config);
  const novelsDir = getNovelsDir();
  const contentDir = await resolveContentDir(novelsDir, options.novelId);
  const memory = new NovelMemory(novelsDir, embeddingClient, {
    hybridSearchEnabled: config.memory.hybridSearchEnabled,
  });

  const startedAt = Date.now();

  if (options.clearFirst) {
    await memory.clearCategory(options.novelId, 'fact');
    await memory.clearCategory(options.novelId, 'thread');
    await memory.clearCategory(options.novelId, 'character_state');
  }

  const [rawCharacters, rawStates, rawThreads, rawFactGraph] = await Promise.all([
    readJsonArray(path.join(contentDir, 'characters.json')),
    readJsonArray(path.join(contentDir, 'character-states.json')),
    readJsonArray(path.join(contentDir, 'plot-thread-snapshots.json')),
    readJsonObject(path.join(contentDir, 'fact-graph.json')),
  ]);

  const characterNameMap = new Map<string, string>();
  for (const item of rawCharacters) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = String((item as Record<string, unknown>).id ?? '').trim();
    const name = String((item as Record<string, unknown>).name ?? '').trim();
    if (id && name) characterNameMap.set(id, name);
  }

  const states: CharacterStateSnapshot[] = rawStates.flatMap((item) => {
    const parsed = CharacterStateSnapshotSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const threads: PlotThreadSnapshot[] = rawThreads.flatMap((item) => {
    const parsed = PlotThreadSnapshotSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const factGraph = rawFactGraph ? FactGraphSchema.safeParse(rawFactGraph) : null;

  let indexedStates = 0;
  for (const snapshot of states) {
    await memory.indexCharacterStateSnapshot(
      options.novelId,
      snapshot,
      characterNameMap.get(snapshot.characterId),
    );
    indexedStates += 1;
  }

  let indexedThreads = 0;
  for (const snapshot of threads) {
    await memory.indexPlotThreadSnapshot(options.novelId, snapshot);
    indexedThreads += 1;
  }

  let indexedFacts = 0;
  if (factGraph?.success) {
    const chapterNumbers = new Set<number>();
    for (const item of factGraph.data.characterAppearances) chapterNumbers.add(item.chapterNumber);
    for (const item of factGraph.data.itemTimeline) chapterNumbers.add(item.chapterNumber);
    for (const item of factGraph.data.locationVisits) chapterNumbers.add(item.chapterNumber);
    for (const item of factGraph.data.timelineEvents) chapterNumbers.add(item.chapterNumber);
    for (const item of factGraph.data.relationshipChanges) chapterNumbers.add(item.chapterNumber);
    for (const item of factGraph.data.characterStateChanges) chapterNumbers.add(item.chapterNumber);
    for (const item of factGraph.data.factEvents ?? []) chapterNumbers.add(item.chapterNumber);

    const chapters = [...chapterNumbers].filter(num => Number.isFinite(num) && num > 0).sort((a, b) => a - b);
    for (const chapterNumber of chapters) {
      await memory.indexFactChapter(options.novelId, chapterNumber, factGraph.data);
      indexedFacts += 1;
    }
  }

  const stats = await memory.getMemoryStats(options.novelId);
  const coverage = await memory.getMemoryCoverage(options.novelId);
  memory.close(options.novelId);
  memory.close();

  return {
    novelId: options.novelId,
    contentDir,
    clearFirst: options.clearFirst,
    indexedStates,
    indexedThreads,
    indexedFacts,
    totalChunks: stats.totalChunks,
    categories: stats.categories,
    complete: coverage.complete,
    durationMs: Date.now() - startedAt,
  };
}

export async function runReindexStructuredMemoryCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'node dist/scripts/reindex-structured-memory.js',
): Promise<number> {
  const options = parseReindexStructuredMemoryArgs(argv);
  if (options.help) {
    printReindexStructuredMemoryHelp(invocation);
    return 0;
  }

  console.log(`[structured-reindex] novel=${options.novelId}`);
  const summary = await executeReindexStructuredMemory(options);
  console.log(`[structured-reindex] contentDir=${summary.contentDir}`);
  if (options.clearFirst) {
    console.log('[structured-reindex] 已清空分类: fact/thread/character_state');
  }
  console.log('[structured-reindex] 完成', {
    indexedStates: summary.indexedStates,
    indexedThreads: summary.indexedThreads,
    indexedFacts: summary.indexedFacts,
    totalChunks: summary.totalChunks,
    categories: summary.categories,
    complete: summary.complete,
    durationMs: summary.durationMs,
  });
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runReindexStructuredMemoryCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('reindex-structured-memory');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[structured-reindex] 执行失败:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
