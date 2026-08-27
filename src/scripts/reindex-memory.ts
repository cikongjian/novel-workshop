import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getNovelsDir } from '../config/index.js';
import { OpenAICompatibleEmbeddingClient } from '../models/embedding.js';
import { NovelMemory } from '../memory/novel-memory.js';
import {
  CharacterStateSnapshot as CharacterStateSnapshotSchema,
  PlotThreadSnapshot as PlotThreadSnapshotSchema,
  type CharacterProfile,
  type CharacterRole,
  type CharacterStateSnapshot,
  type PlotThreadSnapshot,
  type WorldCategory,
  type WorldEntry,
} from '../novel/types.js';
import {
  FactGraph as FactGraphSchema,
  type FactGraph,
} from '../novel/fact-graph-types.js';

type CliOptions = {
  novelIds: string[];
  clearBeforeRebuild: boolean;
  dryRun: boolean;
  help: boolean;
};

export type ReindexMemoryCliOptions = CliOptions;

export type NovelRebuildStats = {
  novelId: string;
  worldEntries: number;
  characters: number;
  chapters: number;
  indexedChapters: number;
  skippedEmptyChapters: number;
  factChapters: number;
  indexedFactChapters: number;
  plotThreadSnapshots: number;
  indexedPlotThreadSnapshots: number;
  characterStateSnapshots: number;
  indexedCharacterStateSnapshots: number;
  durationMs: number;
};

export type ReindexPhase =
  | 'clearing' | 'world' | 'characters' | 'chapters'
  | 'plots' | 'facts' | 'charStates' | 'verifying' | 'optimizing'
  | 'done' | 'error';

export type ReindexProgress = {
  novelId: string;
  novelIndex: number;
  totalNovels: number;
  phase: ReindexPhase;
  current: number;
  total: number;
  error?: string;
};

export type ReindexMemoryOptions = {
  novelIds?: string[];
  clearBeforeRebuild?: boolean;
  dryRun?: boolean;
  embeddingProvider?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
  embeddingBaseUrl?: string;
  logger?: (message: string) => void;
  onProgress?: (progress: ReindexProgress) => void;
};

export type ReindexMemorySummary = {
  ok: boolean;
  dryRun: boolean;
  totalNovels: number;
  successNovels: number;
  failedNovels: number;
  clearBeforeRebuild: boolean;
  durationMs: number;
  stats: NovelRebuildStats[];
  failed: Array<{ novelId: string; error: string }>;
};

type AnyRecord = Record<string, unknown>;

function isObject(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

function isLocalOllamaBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  const normalized = baseUrl.toLowerCase();
  return normalized.includes('127.0.0.1:11434') || normalized.includes('localhost:11434');
}

function resolveCompatibleApiKey(params: {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}): string {
  if (params.apiKey.trim()) return params.apiKey.trim();
  if (params.provider === 'ollama' || isLocalOllamaBaseUrl(params.baseUrl)) {
    return 'ollama';
  }
  return '';
}

function parseReindexMemoryArgs(argv: string[]): CliOptions {
  const novelIds: string[] = [];
  let clearBeforeRebuild = true;
  let dryRun = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--novel' && argv[i + 1]) {
      novelIds.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--no-clear') {
      clearBeforeRebuild = false;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
  }

  return { novelIds, clearBeforeRebuild, dryRun, help };
}

function formatReindexMemoryHelp(invocation = 'npm run reindex:memory --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --novel <novelId>   仅重建指定小说（可重复多次）',
    '  --no-clear          重建前不删除旧记忆数据（默认会清理）',
    '  --dry-run           仅输出计划，不执行写入',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --novel 123e4567-e89b-12d3-a456-426614174000`,
    `  ${invocation}`,
  ].join('\n');
}

function printReindexMemoryHelp(invocation?: string): void {
  console.log(formatReindexMemoryHelp(invocation));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveNovelsContentRoot(baseDir: string): Promise<string> {
  const nested = path.join(baseDir, 'novels');
  if (await exists(nested)) return nested;
  return baseDir;
}

async function listNovelIds(rootDir: string, specified: string[]): Promise<string[]> {
  if (specified.length > 0) return [...new Set(specified)];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
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
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectFactGraphChapterNumbers(factGraph: FactGraph): number[] {
  const chapterSet = new Set<number>();
  const appendChapter = (value: unknown) => {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) chapterSet.add(num);
  };

  for (const item of factGraph.characterAppearances) appendChapter(item.chapterNumber);
  for (const item of factGraph.itemTimeline) appendChapter(item.chapterNumber);
  for (const item of factGraph.locationVisits) appendChapter(item.chapterNumber);
  for (const item of factGraph.timelineEvents) appendChapter(item.chapterNumber);
  for (const item of factGraph.relationshipChanges) appendChapter(item.chapterNumber);
  for (const item of factGraph.characterStateChanges) appendChapter(item.chapterNumber);
  for (const item of factGraph.factEvents ?? []) appendChapter(item.chapterNumber);

  return [...chapterSet].sort((a, b) => a - b);
}

const WORLD_CATEGORIES = new Set<WorldCategory>([
  'geography', 'history', 'faction', 'power', 'culture', 'rule', 'other',
]);

const CHARACTER_ROLES = new Set<CharacterRole>([
  'protagonist',
  'deuteragonist',
  'antagonist',
  'rival',
  'love_interest',
  'mentor',
  'ally',
  'faction_leader',
  'supporting',
  'family',
  'comic_relief',
  'minor',
]);

function normalizeWorldEntry(raw: unknown, fallbackIndex: number): WorldEntry {
  const data = isObject(raw) ? raw : {};
  const timestamp = new Date().toISOString();
  const details = isObject(data.details)
    ? Object.fromEntries(
      Object.entries(data.details)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([k, v]) => [k, v]),
    )
    : {};
  const categoryRaw = toString(data.category, 'other') as WorldCategory;
  const category = WORLD_CATEGORIES.has(categoryRaw) ? categoryRaw : 'other';
  const idRaw = toString(data.id, '');

  return {
    id: idRaw || randomUUID(),
    name: toString(data.name, `鏈懡鍚嶈瀹?${fallbackIndex}`),
    category,
    description: toString(data.description, ''),
    details,
    relatedEntries: [],
    dependencies: [],
    conflicts: [],
    tags: toStringArray(data.tags),
    createdAt: toString(data.createdAt, timestamp),
    updatedAt: toString(data.updatedAt, timestamp),
  };
}

function normalizeCharacter(raw: unknown, fallbackIndex: number): CharacterProfile {
  const data = isObject(raw) ? raw : {};
  const timestamp = new Date().toISOString();
  const drivesRaw = isObject(data.drives) ? data.drives : {};
  const personalityModelRaw = isObject(data.personalityModel) ? data.personalityModel : {};
  const speechDnaRaw = isObject(data.speechDNA) ? data.speechDNA : {};
  const tempoRaw = toString(speechDnaRaw.tempo, 'mid').toLowerCase();
  const tempo: 'slow' | 'mid' | 'fast' = tempoRaw === 'slow' || tempoRaw === 'fast' ? tempoRaw : 'mid';
  const roleRaw = toString(data.role, 'supporting') as CharacterRole;
  const role: CharacterRole = CHARACTER_ROLES.has(roleRaw) ? roleRaw : 'supporting';
  const idRaw = toString(data.id, '');

  return {
    id: idRaw || randomUUID(),
    name: toString(data.name, `鏈懡鍚嶈鑹?${fallbackIndex}`),
    role,
    position: '',
    aliases: toStringArray(data.aliases),
    age: toString(data.age) || undefined,
    gender: toString(data.gender) || undefined,
    appearance: toString(data.appearance, ''),
    personality: toString(data.personality, ''),
    personalityTraits: toStringArray(data.personalityTraits),
    speechStyle: toString(data.speechStyle, ''),
    speechExamples: toStringArray(data.speechExamples),
    backstory: toString(data.backstory, ''),
    motivation: toString(data.motivation, ''),
    abilities: toStringArray(data.abilities),
    relationships: [],
    drives: {
      want: toString(drivesRaw.want, toString(data.motivation, '')),
      need: toString(drivesRaw.need, ''),
      fear: toString(drivesRaw.fear) || undefined,
      secret: toString(drivesRaw.secret) || undefined,
      taboo: toStringArray(drivesRaw.taboo),
    },
    personalityModel: {
      traits: toStringArray(personalityModelRaw.traits),
      innerContradictions: toStringArray(personalityModelRaw.innerContradictions),
      moralBoundary: toStringArray(personalityModelRaw.moralBoundary),
    },
    speechDNA: {
      lexicon: [],
      tempo,
      tone: toStringArray(speechDnaRaw.tone),
      tics: [],
    },
    ttsProfile: {
      baseVoice: 'default',
      prosodyRange: {
        rate: [0.9, 1.1],
        pitch: [-2, 2],
      },
      emotionMap: {},
    },
    arc: toString(data.arc, ''),
    currentState: toString(data.currentState, ''),
    voiceDesignStatus: 'none',
    tags: toStringArray(data.tags),
    createdAt: toString(data.createdAt, timestamp),
    updatedAt: toString(data.updatedAt, timestamp),
  };
}

async function clearNovelMemoryDb(memoryBaseDir: string, novelId: string): Promise<void> {
  // 清理旧 SQLite 文件（兼容迁移）
  const dbBase = path.join(memoryBaseDir, novelId, 'memory.db');
  const sqliteFiles = [dbBase, `${dbBase}-wal`, `${dbBase}-shm`];
  await Promise.all(sqliteFiles.map(async (filePath) => {
    try { await fs.unlink(filePath); } catch { /* ignore */ }
  }));

  // 清理 LanceDB 目录
  const lanceDir = path.join(memoryBaseDir, novelId, 'memory-lance');
  try {
    await fs.rm(lanceDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

async function rebuildNovel(params: {
  novelId: string;
  contentRoot: string;
  memoryBaseDir: string;
  novelMemory: NovelMemory;
  clearBeforeRebuild: boolean;
  dryRun: boolean;
  onProgress?: (phase: ReindexPhase, current: number, total: number) => void;
}): Promise<NovelRebuildStats> {
  const { novelId, contentRoot, memoryBaseDir, novelMemory, clearBeforeRebuild, dryRun, onProgress } = params;
  const start = Date.now();

  const novelDir = path.join(contentRoot, novelId);
  const worldPath = path.join(novelDir, 'world.json');
  const charactersPath = path.join(novelDir, 'characters.json');
  const characterStatesPath = path.join(novelDir, 'character-states.json');
  const plotThreadSnapshotsPath = path.join(novelDir, 'plot-thread-snapshots.json');
  const factGraphPath = path.join(novelDir, 'fact-graph.json');
  const chaptersDir = path.join(novelDir, 'chapters');

  const [rawWorld, rawCharacters, rawCharacterStates, rawPlotThreadSnapshots, rawFactGraph] = await Promise.all([
    readJsonArray(worldPath),
    readJsonArray(charactersPath),
    readJsonArray(characterStatesPath),
    readJsonArray(plotThreadSnapshotsPath),
    readJsonObject(factGraphPath),
  ]);

  const chapterFiles = await fs.readdir(chaptersDir).catch(() => [] as string[]);
  const chapterNumbers = chapterFiles
    .filter(file => file.endsWith('.md'))
    .map(file => Number.parseInt(path.parse(file).name, 10))
    .filter(num => Number.isFinite(num) && num > 0)
    .sort((a, b) => a - b);

  if (!dryRun && clearBeforeRebuild) {
    onProgress?.('clearing', 0, 1);
    novelMemory.close(novelId);
    await clearNovelMemoryDb(memoryBaseDir, novelId);
  }

  const worldEntries = rawWorld.map((item, idx) => normalizeWorldEntry(item, idx + 1));
  const characters = rawCharacters.map((item, idx) => normalizeCharacter(item, idx + 1));
  const characterNameMap = new Map(characters.map(character => [character.id, character.name]));
  const characterStates: CharacterStateSnapshot[] = rawCharacterStates.flatMap((item) => {
    const parsed = CharacterStateSnapshotSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const plotThreadSnapshots: PlotThreadSnapshot[] = rawPlotThreadSnapshots.flatMap((item) => {
    const parsed = PlotThreadSnapshotSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const parsedFactGraph = rawFactGraph ? FactGraphSchema.safeParse(rawFactGraph) : null;
  const factGraph = parsedFactGraph?.success ? parsedFactGraph.data : null;
  const factChapters = factGraph ? collectFactGraphChapterNumbers(factGraph) : [];

  let indexedChapters = 0;
  let skippedEmptyChapters = 0;
  let indexedFactChapters = 0;
  let indexedPlotThreadSnapshots = 0;
  let indexedCharacterStateSnapshots = 0;

  if (!dryRun) {
    for (let i = 0; i < worldEntries.length; i++) {
      await novelMemory.indexWorldEntry(novelId, worldEntries[i]);
      onProgress?.('world', i + 1, worldEntries.length);
    }

    for (let i = 0; i < characters.length; i++) {
      await novelMemory.indexCharacter(novelId, characters[i]);
      onProgress?.('characters', i + 1, characters.length);
    }

    for (let i = 0; i < chapterNumbers.length; i++) {
      const chapterNumber = chapterNumbers[i];
      const chapterPath = path.join(chaptersDir, `${String(chapterNumber).padStart(3, '0')}.md`);
      const content = await fs.readFile(chapterPath, 'utf-8').catch(() => '');
      if (!content.trim()) {
        skippedEmptyChapters += 1;
        onProgress?.('chapters', i + 1, chapterNumbers.length);
        continue;
      }
      await novelMemory.indexChapter(novelId, chapterNumber, content);
      indexedChapters += 1;
      onProgress?.('chapters', i + 1, chapterNumbers.length);
    }

    for (let i = 0; i < plotThreadSnapshots.length; i++) {
      await novelMemory.indexPlotThreadSnapshot(novelId, plotThreadSnapshots[i]);
      indexedPlotThreadSnapshots += 1;
      onProgress?.('plots', i + 1, plotThreadSnapshots.length);
    }

    for (let i = 0; i < characterStates.length; i++) {
      await novelMemory.indexCharacterStateSnapshot(
        novelId,
        characterStates[i],
        characterNameMap.get(characterStates[i].characterId),
      );
      indexedCharacterStateSnapshots += 1;
      onProgress?.('charStates', i + 1, characterStates.length);
    }

    if (factGraph) {
      for (let i = 0; i < factChapters.length; i++) {
        await novelMemory.indexFactChapter(novelId, factChapters[i], factGraph);
        indexedFactChapters += 1;
        onProgress?.('facts', i + 1, factChapters.length);
      }
    }
  } else {
    indexedChapters = chapterNumbers.length;
    indexedFactChapters = factChapters.length;
    indexedPlotThreadSnapshots = plotThreadSnapshots.length;
    indexedCharacterStateSnapshots = characterStates.length;
  }

  return {
    novelId,
    worldEntries: worldEntries.length,
    characters: characters.length,
    chapters: chapterNumbers.length,
    indexedChapters,
    skippedEmptyChapters,
    factChapters: factChapters.length,
    indexedFactChapters,
    plotThreadSnapshots: plotThreadSnapshots.length,
    indexedPlotThreadSnapshots,
    characterStateSnapshots: characterStates.length,
    indexedCharacterStateSnapshots,
    durationMs: Date.now() - start,
  };
}

export async function executeReindexMemory(options: ReindexMemoryOptions = {}): Promise<ReindexMemorySummary> {
  const config = getConfig();
  const embeddingProvider = options.embeddingProvider ?? config.embedding.provider;
  const embeddingModel = options.embeddingModel ?? config.embedding.model;
  const embeddingBaseUrl = (options.embeddingBaseUrl ?? config.embedding.baseUrl) || undefined;
  const embeddingApiKey = options.embeddingApiKey ?? config.embedding.apiKey;
  const effectiveApiKey = resolveCompatibleApiKey({
    provider: embeddingProvider,
    apiKey: embeddingApiKey,
    baseUrl: embeddingBaseUrl,
  });
  if (!effectiveApiKey) {
    throw new Error('EMBEDDING_API_KEY is not configured');
  }

  const dryRun = options.dryRun ?? false;
  const clearBeforeRebuild = options.clearBeforeRebuild ?? true;
  const logger = options.logger;

  const memoryBaseDir = getNovelsDir();
  const contentRoot = await resolveNovelsContentRoot(memoryBaseDir);
  const novelIds = await listNovelIds(contentRoot, options.novelIds ?? []);

  if (novelIds.length === 0) {
    return {
      ok: true,
      dryRun,
      totalNovels: 0,
      successNovels: 0,
      failedNovels: 0,
      clearBeforeRebuild,
      durationMs: 0,
      stats: [],
      failed: [],
    };
  }

  const embeddingClient = new OpenAICompatibleEmbeddingClient(
    effectiveApiKey,
    embeddingModel,
    embeddingBaseUrl,
  );
  const novelMemory = new NovelMemory(memoryBaseDir, embeddingClient);

  const stats: NovelRebuildStats[] = [];
  const failed: Array<{ novelId: string; error: string }> = [];
  const totalStart = Date.now();
  const onProgress = options.onProgress;

  logger?.(`[reindex-memory] contentRoot=${contentRoot}`);
  logger?.(`[reindex-memory] memoryBaseDir=${memoryBaseDir}`);
  logger?.(`[reindex-memory] novels=${novelIds.length} model=${embeddingModel} dryRun=${dryRun}`);

  for (let novelIndex = 0; novelIndex < novelIds.length; novelIndex++) {
    const novelId = novelIds[novelIndex];
    const emitProgress = (phase: ReindexPhase, current: number, total: number, error?: string) => {
      onProgress?.({ novelId, novelIndex, totalNovels: novelIds.length, phase, current, total, error });
    };

    try {
      logger?.(`[reindex-memory] start novel=${novelId}`);
      const maxAttempts = dryRun ? 1 : 2;
      let result: NovelRebuildStats | null = null;
      let healthFailureReason = '';

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const shouldClearBeforeRebuild = attempt === 1 ? clearBeforeRebuild : true;
        if (attempt > 1) {
          logger?.(`[reindex-memory] retry novel=${novelId} attempt=${attempt}/${maxAttempts} clearBeforeRebuild=true`);
        }

        result = await rebuildNovel({
          novelId,
          contentRoot,
          memoryBaseDir,
          novelMemory,
          clearBeforeRebuild: shouldClearBeforeRebuild,
          dryRun,
          onProgress: (phase, current, total) => emitProgress(phase, current, total),
        });

        if (dryRun) {
          break;
        }

        emitProgress('verifying', 0, 1);
        const health = await novelMemory.verifyStorageHealth(novelId);
        if (!health.ok) {
          healthFailureReason = health.reason ?? 'unknown';
          novelMemory.close(novelId);
          logger?.(
            `[reindex-memory] health-check failed novel=${novelId} `
            + `attempt=${attempt}/${maxAttempts} reason=${healthFailureReason}`,
          );
          if (attempt >= maxAttempts) {
            throw new Error(`memory storage health check failed: ${healthFailureReason}`);
          }
          continue;
        }

        // 覆盖率验证：检查所有 6 类记忆索引完整度
        const coverage = await novelMemory.getMemoryCoverage(novelId);
        const totalSource = coverage.source.worldCount + coverage.source.characterCount
          + coverage.source.chapterCount + coverage.source.characterStateCount
          + coverage.source.factChapterCount + coverage.source.threadSnapshotCount;
        const totalMissing = coverage.missing.worldIds.length + coverage.missing.characterIds.length
          + coverage.missing.chapterNumbers.length + coverage.missing.characterStateIds.length
          + coverage.missing.factChapterNumbers.length + coverage.missing.threadEntityIds.length;

        if (totalSource > 0 && totalMissing > 0) {
          const coverageRatio = 1 - totalMissing / totalSource;
          logger?.(
            `[reindex-memory] coverage novel=${novelId}`
            + ` ratio=${(coverageRatio * 100).toFixed(1)}%`
            + ` missing: chapters=${coverage.missing.chapterNumbers.length}`
            + ` worlds=${coverage.missing.worldIds.length}`
            + ` characters=${coverage.missing.characterIds.length}`
            + ` charStates=${coverage.missing.characterStateIds.length}`
            + ` facts=${coverage.missing.factChapterNumbers.length}`
            + ` threads=${coverage.missing.threadEntityIds.length}`,
          );
          // 覆盖率低于 80% 视为重建失败，触发重试
          const MIN_COVERAGE_RATIO = 0.8;
          if (coverageRatio < MIN_COVERAGE_RATIO) {
            healthFailureReason = `coverage too low: ${(coverageRatio * 100).toFixed(1)}%`;
            novelMemory.close(novelId);
            if (attempt >= maxAttempts) {
              throw new Error(`memory rebuild incomplete: ${healthFailureReason}`);
            }
            continue;
          }
        }

        break;
      }

      if (!result) {
        throw new Error('rebuild returned empty result');
      }
      stats.push(result);

      // ── 存储优化阶段：合并碎片 + 建向量索引 ──
      if (!dryRun) {
        emitProgress('optimizing', 0, 2);
        const compactStats = await novelMemory.optimize(novelId);
        emitProgress('optimizing', 1, 2);
        const indexCreated = await novelMemory.createVectorIndex(novelId);
        emitProgress('optimizing', 2, 2);
        if (compactStats.fragmentsRemoved > 0 || indexCreated) {
          logger?.(
            `[reindex-memory] optimized novel=${novelId}`
            + ` fragments_removed=${compactStats.fragmentsRemoved}`
            + ` bytes_freed=${(compactStats.bytesRemoved / 1024 / 1024).toFixed(1)}MB`
            + ` vector_index=${indexCreated ? 'created' : 'skipped'}`,
          );
        }
      }

      const vectorStatus = dryRun
        ? 'dry-run'
        : (() => {
          const detail = novelMemory.getVectorStatusDetail(novelId);
          if (detail.status !== 'disabled') return detail.status;
          return detail.reason ? `disabled(${detail.reason})` : 'disabled';
        })();
      logger?.(
        `[reindex-memory] done novel=${novelId} world=${result.worldEntries} chars=${result.characters} `
        + `chapters=${result.indexedChapters}/${result.chapters} `
        + `fact=${result.indexedFactChapters}/${result.factChapters} `
        + `threads=${result.indexedPlotThreadSnapshots}/${result.plotThreadSnapshots} `
        + `charStates=${result.indexedCharacterStateSnapshots}/${result.characterStateSnapshots} `
        + `vector=${vectorStatus} ${result.durationMs}ms`,
      );
      emitProgress('done', 1, 1);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      emitProgress('error', 0, 1, errorMsg);
      failed.push({
        novelId,
        error: errorMsg,
      });
      logger?.(`[reindex-memory] failed novel=${novelId}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      novelMemory.close(novelId);
    }
  }

  novelMemory.close();

  return {
    ok: failed.length === 0,
    dryRun,
    totalNovels: novelIds.length,
    successNovels: stats.length,
    failedNovels: failed.length,
    clearBeforeRebuild,
    durationMs: Date.now() - totalStart,
    stats,
    failed,
  };
}

export async function runReindexMemoryCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run reindex:memory --',
): Promise<number> {
  const options = parseReindexMemoryArgs(argv);
  if (options.help) {
    printReindexMemoryHelp(invocation);
    return 0;
  }

  const summary = await executeReindexMemory({
    novelIds: options.novelIds,
    clearBeforeRebuild: options.clearBeforeRebuild,
    dryRun: options.dryRun,
    logger: (message) => console.log(message),
  });

  console.log('[reindex-memory] summary');
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    return 1;
  }

  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runReindexMemoryCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('reindex-memory');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[reindex-memory] fatal:', err);
    process.exit(1);
  });
}

