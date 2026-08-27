import path from 'node:path';
import { getConfig, getNovelsDir } from '../config/index.js';
import { createModelClient } from '../models/provider.js';
import { NovelManager } from '../novel/novel-manager.js';
import { StoryStateManager } from '../novel/story-state-manager.js';
import { StoryStateSnapshot } from '../novel/story-state-types.js';
import { parseStoryStateSnapshotCandidate } from '../novel/story-state-snapshot-parser.js';
import { normalizeStoryStateSnapshotCandidate } from '../novel/story-state-snapshot-normalizer.js';
import { updateTruthFiles } from '../memory/truth-files/index.js';
import { StoryStateTrackerAgent } from '../agents/story-state-tracker.js';

type CliOptions = {
  novelId: string;
  startChapter: number;
  help?: boolean;
};

export type BackfillStoryStateCliOptions = CliOptions;

export type BackfillStoryStateSummary = {
  novelId: string;
  novelTitle: string;
  requestedStartChapter: number;
  totalChapters: number;
  processedChapters: number;
  skippedExisting: number;
  skippedEmpty: number;
  succeeded: number;
  failed: Array<{ chapterNumber: number; error: string }>;
  snapshots: number;
  compressedArcs: number;
};

function parseBackfillStoryStateArgs(argv: string[]): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      novelId: '',
      startChapter: 1,
      help: true,
    };
  }

  const novelId = argv[0];
  const startChapter = parseInt(argv[1] ?? '1', 10);

  if (!novelId) {
    throw new Error('用法: npx tsx src/scripts/backfill-story-state.ts <novelId> [startChapter]');
  }

  return {
    novelId,
    startChapter: Number.isFinite(startChapter) && startChapter > 0 ? startChapter : 1,
    help: false,
  };
}

function formatBackfillStoryStateHelp(invocation = 'npx tsx src/scripts/backfill-story-state.ts'): string {
  return [
    `用法: ${invocation} <novelId> [startChapter]`,
    '',
    '为已有章节批量补齐 story state snapshot。',
  ].join('\n');
}

function printBackfillStoryStateHelp(invocation?: string): void {
  console.log(formatBackfillStoryStateHelp(invocation));
}

export async function executeBackfillStoryState(options: CliOptions): Promise<BackfillStoryStateSummary> {
  const config = getConfig();
  const novelsDir = getNovelsDir();
  const novelManager = new NovelManager(novelsDir);
  const storyStateManager = new StoryStateManager(novelsDir);
  const modelClient = createModelClient(config);
  const trackerAgent = new StoryStateTrackerAgent();

  const novel = await novelManager.getNovel(options.novelId);
  const chapters = await novelManager.listChapters(options.novelId);
  const sortedChapters = chapters
    .filter((chapter) => chapter.chapterNumber >= options.startChapter)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const characters = await novelManager.getCharacters(options.novelId);
  const characterNames = characters.map((character) => character.name);

  let skippedExisting = 0;
  let skippedEmpty = 0;
  let succeeded = 0;
  const failed: Array<{ chapterNumber: number; error: string }> = [];

  for (const chapterInfo of sortedChapters) {
    const { chapterNumber } = chapterInfo;

    const existing = await storyStateManager.getSnapshotAt(options.novelId, chapterNumber);
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    const chapter = await novelManager.getChapter(options.novelId, chapterNumber);
    if (!chapter?.content?.trim()) {
      skippedEmpty += 1;
      continue;
    }

    try {
      const previousSnapshot = await storyStateManager.getLatestSnapshot(options.novelId);
      const trackerInput = storyStateManager.buildTrackerInput(
        chapterNumber,
        chapter.content,
        previousSnapshot,
        characterNames,
      );

      const result = await trackerAgent.execute(
        {
          novelId: options.novelId,
          novelTitle: novel.title,
          novelSynopsis: novel.synopsis,
          genre: novel.genre,
          chapterNumber,
          inputText: trackerInput,
        },
        modelClient,
      );

      let rawContent = result.content;
      let parsedCandidate = parseStoryStateSnapshotCandidate<Record<string, unknown>>(rawContent);
      if (!parsedCandidate) {
        const retryResult = await trackerAgent.execute(
          {
            novelId: options.novelId,
            novelTitle: novel.title,
            novelSynopsis: novel.synopsis,
            genre: novel.genre,
            chapterNumber,
            inputText: buildStoryStateJsonRepairInput(rawContent, chapterNumber),
          },
          modelClient,
        );
        rawContent = retryResult.content;
        parsedCandidate = parseStoryStateSnapshotCandidate<Record<string, unknown>>(rawContent);
      }

      if (!parsedCandidate) {
        failed.push({
          chapterNumber,
          error: 'story-state JSON parse failed',
        });
        continue;
      }

      const parsed = StoryStateSnapshot.parse({
        ...normalizeStoryStateSnapshotCandidate(parsedCandidate),
        createdAt: new Date().toISOString(),
      });
      await storyStateManager.saveSnapshot(options.novelId, parsed);
      const outline = await novelManager.getOutline(options.novelId);
      await updateTruthFiles({
        novelId: options.novelId,
        novelsDir,
        chapterNumber,
        snapshot: parsed,
        characters,
        outline,
      });
      succeeded += 1;
    } catch (error) {
      failed.push({
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await storyStateManager.compressIfNeeded(options.novelId);
  }

  const finalState = await storyStateManager.getState(options.novelId);
  return {
    novelId: options.novelId,
    novelTitle: novel.title,
    requestedStartChapter: options.startChapter,
    totalChapters: chapters.length,
    processedChapters: sortedChapters.length,
    skippedExisting,
    skippedEmpty,
    succeeded,
    failed,
    snapshots: finalState.snapshots.length,
    compressedArcs: finalState.compressedArcs.length,
  };
}

function buildStoryStateJsonRepairInput(rawContent: string, chapterNumber: number): string {
  return [
    `The previous story-state tracker response for chapter ${chapterNumber} could not be parsed as JSON.`,
    'Repair only the JSON snapshot. Do not add analysis, markdown fences, comments, or prose.',
    'Return exactly one valid JSON object after the marker ---STATE_SNAPSHOT---.',
    'Keep the same facts and chapterNumber. Escape all quotes inside strings. Use normal JSON commas and double quotes.',
    'If the previous response was truncated, regenerate a compact complete snapshot instead of preserving every detail.',
    'Hard caps: characters<=8, factions<=6, activeThreads<=8, pendingForeshadowing<=12, causalChains<=8, nextChapterConstraints<=12.',
    'Summarize each string in <=120 Chinese characters. Omit resolved foreshadowing from pendingForeshadowing.',
    'Previous response:',
    rawContent,
  ].join('\n\n');
}

export async function runBackfillStoryStateCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npx tsx src/scripts/backfill-story-state.ts',
): Promise<number> {
  const options = parseBackfillStoryStateArgs(argv);
  if (options.help) {
    printBackfillStoryStateHelp(invocation);
    return 0;
  }

  const summary = await executeBackfillStoryState(options);
  console.log(`小说: ${summary.novelTitle} (${summary.novelId})`);
  console.log(`章节总数: ${summary.totalChapters}, 起始章节: ${summary.requestedStartChapter}, 处理范围: ${summary.processedChapters}`);
  console.log(`成功: ${summary.succeeded}, 已存在跳过: ${summary.skippedExisting}, 空章跳过: ${summary.skippedEmpty}, 失败: ${summary.failed.length}`);
  console.log(`最终状态: snapshots=${summary.snapshots}, compressedArcs=${summary.compressedArcs}`);
  if (summary.failed.length > 0) {
    summary.failed.forEach((item) => {
      console.error(`- chapter ${item.chapterNumber}: ${item.error}`);
    });
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runBackfillStoryStateCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('backfill-story-state');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('回填失败:', err);
    process.exit(1);
  });
}
