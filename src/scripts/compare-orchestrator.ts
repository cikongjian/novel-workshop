import path from 'node:path';
import { getConfig, getNovelsDir } from '../config/index.js';
import { OpenAICompatibleEmbeddingClient } from '../models/embedding.js';
import { NovelMemory } from '../memory/novel-memory.js';
import { StoryStateManager } from '../novel/story-state-manager.js';
import { NovelManager } from '../novel/novel-manager.js';
import { loadEnhancedMemoryContext } from '../pipeline/chapter-pipeline-memory-context.js';
import {
  createOrchestrator,
  NovelMemorySearchBridge,
  StoryStateBridge,
  WorldCardBridge,
} from '../memory/orchestrator/index.js';

type CliOptions = {
  novelId: string;
  chapter?: number;
  help?: boolean;
};

export type CompareOrchestratorCliOptions = CliOptions;

export type CompareOrchestratorSummary = {
  novelId: string;
  novelTitle: string;
  chapterNumber: number;
  chapterCount: number;
  characterCount: number;
  worldEntryCount: number;
  legacy: {
    durationMs: number;
    totalChars: number;
    memoryWorldCtx: number;
    memoryCharCtx: number;
    mergedPreviousSummary: number;
    arcCtx: number;
    digestCtx: number;
    enhancedChapterCtx: number;
    factCtx: number;
    threadCtx: number;
    characterStateCtx: number;
  };
  orchestrator: {
    durationMs: number;
    totalChars: number;
    budgetChars: number;
    deduplicatedCount: number;
    keptCount: number;
    droppedCount: number;
    retrievedCounts: Record<string, number | undefined>;
    contextPreview: string;
  };
};

function parseCompareOrchestratorArgs(argv: string[]): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      novelId: '',
      help: true,
    };
  }

  let novelId = '';
  let chapter: number | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--novel-id=')) {
      novelId = arg.split('=')[1];
    } else if (arg.startsWith('--chapter=')) {
      chapter = Number(arg.split('=')[1]);
    }
  }

  if (!novelId) {
    throw new Error('用法: npx tsx src/scripts/compare-orchestrator.ts --novel-id=<id> [--chapter=<n>]');
  }

  return { novelId, chapter, help: false };
}

function formatCompareOrchestratorHelp(invocation = 'npx tsx src/scripts/compare-orchestrator.ts'): string {
  return [
    `用法: ${invocation} --novel-id=<id> [--chapter=<n>]`,
    '',
    '对比 legacy loadEnhancedMemoryContext 和新 orchestrator 的输出规模与耗时。',
  ].join('\n');
}

function printCompareOrchestratorHelp(invocation?: string): void {
  console.log(formatCompareOrchestratorHelp(invocation));
}

async function resolveActualDataDir(novelsDir: string, configDataDir: string, novelId: string): Promise<string> {
  const fsNode = await import('node:fs');
  const pathNode = await import('node:path');
  const directNovelJson = pathNode.join(novelsDir, novelId, 'novel.json');
  const nestedNovelJson = pathNode.join(novelsDir, 'novels', novelId, 'novel.json');
  return fsNode.existsSync(directNovelJson)
    ? configDataDir
    : fsNode.existsSync(nestedNovelJson)
      ? novelsDir
      : configDataDir;
}

export async function executeCompareOrchestrator(options: CliOptions): Promise<CompareOrchestratorSummary> {
  const config = getConfig();
  const novelsDir = getNovelsDir();
  const actualDataDir = await resolveActualDataDir(novelsDir, config.dataDir, options.novelId);

  const embeddingClient = new OpenAICompatibleEmbeddingClient(
    config.embedding.apiKey,
    config.embedding.model,
    config.embedding.baseUrl || undefined,
  );

  const novelMemory = new NovelMemory(novelsDir, embeddingClient, {
    hybridSearchEnabled: true,
  });
  const storyStateManager = new StoryStateManager(novelsDir);
  const novelManager = new NovelManager(actualDataDir);

  try {
    const novel = await novelManager.getNovel(options.novelId);
    const chapterNumber = options.chapter ?? (novel.chapterCount || 1);
    const characters = await novelManager.getCharacters(options.novelId);
    const worldEntries = await novelManager.getWorldEntries(options.novelId);

    const userDirection = '继续推进主线剧情';
    const outlineContent = `第${chapterNumber}章大纲`;
    const previousChapterContext = '上一章内容摘要';

    const startLegacy = Date.now();
    const legacy = await loadEnhancedMemoryContext({
      memory: novelMemory,
      novelId: options.novelId,
      userDirection,
      outlineContent,
      chapterNumber,
      previousChapterContext,
      chapterCount: novel.chapterCount || chapterNumber,
      genre: novel.genre,
      memoryPriority: novel.memoryPriority,
    });
    const legacyDuration = Date.now() - startLegacy;

    const orchestrator = createOrchestrator({
      rawSearch: new NovelMemorySearchBridge(novelMemory),
      storyState: new StoryStateBridge(storyStateManager),
      worldCards: new WorldCardBridge((novelId) => novelManager.getWorldEntries(novelId)),
    });

    const orchestrated = await orchestrator.orchestrate({
      novelId: options.novelId,
      userDirection,
      outlineContent,
      chapterNumber,
      chapterCount: novel.chapterCount || chapterNumber,
      previousChapterContext,
      genre: novel.genre,
    });

    const legacyTotal = (legacy.mergedPreviousSummary?.length ?? 0)
      + legacy.memoryWorldCtx.length
      + legacy.memoryCharCtx.length;

    return {
      novelId: options.novelId,
      novelTitle: novel.title,
      chapterNumber,
      chapterCount: novel.chapterCount || chapterNumber,
      characterCount: characters.length,
      worldEntryCount: worldEntries.length,
      legacy: {
        durationMs: legacyDuration,
        totalChars: legacyTotal,
        memoryWorldCtx: legacy.memoryWorldCtx.length,
        memoryCharCtx: legacy.memoryCharCtx.length,
        mergedPreviousSummary: legacy.mergedPreviousSummary?.length ?? 0,
        arcCtx: legacy.arcCtx.length,
        digestCtx: legacy.digestCtx.length,
        enhancedChapterCtx: legacy.enhancedChapterCtx.length,
        factCtx: legacy.factCtx.length,
        threadCtx: legacy.threadCtx.length,
        characterStateCtx: legacy.characterStateCtx.length,
      },
      orchestrator: {
        durationMs: orchestrated.stats.durationMs,
        totalChars: orchestrated.stats.totalChars,
        budgetChars: orchestrated.stats.budgetChars,
        deduplicatedCount: orchestrated.stats.deduplicatedCount,
        keptCount: orchestrated.stats.keptCount,
        droppedCount: orchestrated.stats.droppedCount,
        retrievedCounts: orchestrated.stats.retrievedCounts,
        contextPreview: orchestrated.mergedContext.slice(0, 500),
      },
    };
  } finally {
    novelMemory.close(options.novelId);
    novelMemory.close();
  }
}

export async function runCompareOrchestratorCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npx tsx src/scripts/compare-orchestrator.ts',
): Promise<number> {
  const options = parseCompareOrchestratorArgs(argv);
  if (options.help) {
    printCompareOrchestratorHelp(invocation);
    return 0;
  }

  const summary = await executeCompareOrchestrator(options);
  console.log(`小说: ${summary.novelTitle} (${summary.novelId})`);
  console.log(`章节: ${summary.chapterNumber}/${summary.chapterCount}, 角色=${summary.characterCount}, 世界条目=${summary.worldEntryCount}`);
  console.log(`Legacy: chars=${summary.legacy.totalChars}, duration=${summary.legacy.durationMs}ms`);
  console.log(`Orchestrator: chars=${summary.orchestrator.totalChars}, budget=${summary.orchestrator.budgetChars}, duration=${summary.orchestrator.durationMs}ms`);
  console.log(`检索分布: ${JSON.stringify(summary.orchestrator.retrievedCounts)}`);
  console.log('Context preview:');
  console.log(summary.orchestrator.contextPreview);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runCompareOrchestratorCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('compare-orchestrator');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('对比失败:', err);
    process.exit(1);
  });
}
