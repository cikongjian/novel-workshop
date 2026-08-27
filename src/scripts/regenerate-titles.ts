import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfig, getNovelsDir } from '../config/index.js';
import { createModelClient } from '../models/provider.js';
import { NovelManager } from '../novel/novel-manager.js';
import { NovelPaths } from '../novel/novel-paths.js';
import { TitleGeneratorAgent } from '../agents/title-generator.js';
import {
  DEFAULT_TITLE_REWRITE_SCORE,
  evaluateChapterTitle,
  isPlaceholderChapterTitle,
  shouldAdoptGeneratedChapterTitle,
} from '../agents/title-audit.js';
import { generateTitleWithRetry } from '../server/routes/handlers/shared/chapter-title-generation.js';
import { resolveNovelModelOverride } from '../server/routes/handlers/utils.js';

type CliOptions = {
  novelId?: string;
  from?: number;
  to?: number;
  limit: number;
  maxScore: number;
  apply: boolean;
  help?: boolean;
};

type RawChapterMeta = {
  chapterNumber?: number;
  title?: string;
  summary?: string;
  outline?: { summary?: string };
  updatedAt?: string;
  [key: string]: unknown;
};

type ChapterRegenerationResult = {
  novelId: string;
  novelTitle: string;
  chapterNumber: number;
  oldTitle: string;
  oldScore: number;
  newTitle: string;
  newScore: number;
  improved: boolean;
  saved: boolean;
  oldIssues: string[];
  newIssues: string[];
  decisionReasons: string[];
};

type RegenerateTitlesSummary = {
  mode: 'preview' | 'apply';
  novelCount: number;
  attempted: number;
  improved: number;
  saved: number;
  results: ChapterRegenerationResult[];
};

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseScore(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(100, parsed));
}

function parseRegenerateTitlesArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      limit: 5,
      maxScore: DEFAULT_TITLE_REWRITE_SCORE,
      apply: false,
      help: true,
    };
  }

  const options: CliOptions = {
    limit: 5,
    maxScore: DEFAULT_TITLE_REWRITE_SCORE,
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--novel' && argv[i + 1]) {
      options.novelId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--from' && argv[i + 1]) {
      options.from = parsePositiveInt(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--to' && argv[i + 1]) {
      options.to = parsePositiveInt(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      options.limit = parsePositiveInt(argv[i + 1]) ?? options.limit;
      i += 1;
      continue;
    }
    if (arg === '--max-score' && argv[i + 1]) {
      options.maxScore = parseScore(argv[i + 1]) ?? options.maxScore;
      i += 1;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg.startsWith('--novel=')) {
      options.novelId = arg.slice('--novel='.length);
      continue;
    }
    if (arg.startsWith('--from=')) {
      options.from = parsePositiveInt(arg.slice('--from='.length));
      continue;
    }
    if (arg.startsWith('--to=')) {
      options.to = parsePositiveInt(arg.slice('--to='.length));
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInt(arg.slice('--limit='.length)) ?? options.limit;
      continue;
    }
    if (arg.startsWith('--max-score=')) {
      options.maxScore = parseScore(arg.slice('--max-score='.length)) ?? options.maxScore;
    }
  }

  return options;
}

function formatRegenerateTitlesHelp(invocation = 'npx tsx src/scripts/regenerate-titles.ts'): string {
  return [
    `用法: ${invocation} [--novel <novelId>] [--from <n>] [--to <n>] [--limit <n>] [--max-score <n>] [--apply]`,
    '',
    '默认只做预览，不落库；加 --apply 才会写回标题。',
    `默认仅处理标题分数 <= ${DEFAULT_TITLE_REWRITE_SCORE} 的章节。`,
  ].join('\n');
}

function printRegenerateTitlesHelp(invocation?: string): void {
  console.log(formatRegenerateTitlesHelp(invocation));
}

async function readRawChapterMeta(paths: NovelPaths, novelId: string, chapterNumber: number): Promise<RawChapterMeta | null> {
  const metaPath = paths.chapterMetaPath(novelId, chapterNumber);
  try {
    return JSON.parse(await fs.readFile(metaPath, 'utf8')) as RawChapterMeta;
  } catch {
    return null;
  }
}

async function readChapterContent(paths: NovelPaths, novelId: string, chapterNumber: number): Promise<string> {
  try {
    return await fs.readFile(paths.chapterContentPath(novelId, chapterNumber), 'utf8');
  } catch {
    return '';
  }
}

export async function executeRegenerateTitles(options: CliOptions): Promise<RegenerateTitlesSummary> {
  const config = getConfig();
  const novelsDir = getNovelsDir();
  const novelManager = new NovelManager(novelsDir);
  const paths = new NovelPaths(config.dataDir);
  const defaultModelClient = createModelClient(config);
  const titleAgent = new TitleGeneratorAgent();

  const novels = options.novelId
    ? [await novelManager.getNovel(options.novelId)]
    : await novelManager.listNovels();

  const candidates: Array<{
    novel: Awaited<ReturnType<NovelManager['getNovel']>>;
    chapterNumber: number;
    title: string;
    oldScore: number;
    oldIssues: string[];
    recentTitles: string[];
    previousTitle: string;
  }> = [];

  for (const novel of novels) {
    const chapterSummaries = await novelManager.listChapters(novel.id);
    for (const summary of chapterSummaries) {
      if (options.from && summary.chapterNumber < options.from) continue;
      if (options.to && summary.chapterNumber > options.to) continue;
      const trimmedTitle = summary.title.trim();
      if (!trimmedTitle || isPlaceholderChapterTitle(trimmedTitle)) continue;

      const recentTitles = chapterSummaries
        .filter((item) => item.chapterNumber < summary.chapterNumber)
        .slice(-3)
        .map((item) => item.title)
        .filter(Boolean);
      const evaluation = evaluateChapterTitle(trimmedTitle, {
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        novelTags: novel.tags,
        constitutionTags: novel.constitutionTags,
        chapterNumber: summary.chapterNumber,
        startupPlatformProfile: novel.startupPlatformProfile,
        outline: summary.summary || '',
        summary: summary.summary || '',
        recentTitles,
      });
      if (evaluation.score > options.maxScore) continue;

      candidates.push({
        novel,
        chapterNumber: summary.chapterNumber,
        title: trimmedTitle,
        oldScore: evaluation.score,
        oldIssues: evaluation.issues,
        recentTitles,
        previousTitle: recentTitles[recentTitles.length - 1] ?? '',
      });
    }
  }

  candidates.sort((left, right) => left.oldScore - right.oldScore);
  const limitedCandidates = candidates.slice(0, options.limit);
  const results: ChapterRegenerationResult[] = [];
  const touchedNovelIds = new Set<string>();

  for (const candidate of limitedCandidates) {
    const { novel, chapterNumber } = candidate;
    const meta = await readRawChapterMeta(paths, novel.id, chapterNumber);
    const content = await readChapterContent(paths, novel.id, chapterNumber);
    if (!meta || !content.trim()) {
      continue;
    }

    const modelClient = resolveNovelModelOverride(novel) ?? defaultModelClient;
    const generatedTitle = await generateTitleWithRetry({
      titleAgent,
      novelId: novel.id,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      genre: novel.genre,
      chapterNumber,
      previousTitle: candidate.previousTitle,
      recentTitles: candidate.recentTitles,
      fullContent: content,
      modelClient,
    });

    const newEvaluation = evaluateChapterTitle(generatedTitle, {
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      novelTags: novel.tags,
      constitutionTags: novel.constitutionTags,
      chapterNumber,
      startupPlatformProfile: novel.startupPlatformProfile,
      outline: String(meta.outline?.summary ?? meta.summary ?? ''),
      summary: String(meta.summary ?? meta.outline?.summary ?? ''),
      fullContent: content,
      recentTitles: candidate.recentTitles,
    });

    const decision = shouldAdoptGeneratedChapterTitle({
      currentTitle: candidate.title,
      generatedTitle,
      auditInput: {
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        novelTags: novel.tags,
        constitutionTags: novel.constitutionTags,
        chapterNumber,
        startupPlatformProfile: novel.startupPlatformProfile,
        outline: String(meta.outline?.summary ?? meta.summary ?? ''),
        summary: String(meta.summary ?? meta.outline?.summary ?? ''),
        fullContent: content,
        recentTitles: candidate.recentTitles,
      },
    });
    const improved = decision.accept;
    let saved = false;

    if (options.apply && improved) {
      meta.title = generatedTitle;
      meta.updatedAt = new Date().toISOString();
      await fs.writeFile(
        paths.chapterMetaPath(novel.id, chapterNumber),
        `${JSON.stringify(meta, null, 2)}\n`,
        'utf8',
      );
      touchedNovelIds.add(novel.id);
      saved = true;
    }

    results.push({
      novelId: novel.id,
      novelTitle: novel.title,
      chapterNumber,
      oldTitle: candidate.title,
      oldScore: candidate.oldScore,
      newTitle: generatedTitle,
      newScore: newEvaluation.score,
      improved,
      saved,
      oldIssues: candidate.oldIssues,
      newIssues: newEvaluation.issues,
      decisionReasons: decision.reasons,
    });
  }

  for (const novelId of touchedNovelIds) {
    await novelManager.syncNovelMetadataByChapters(novelId);
  }

  return {
    mode: options.apply ? 'apply' : 'preview',
    novelCount: new Set(limitedCandidates.map(item => item.novel.id)).size,
    attempted: results.length,
    improved: results.filter(item => item.improved).length,
    saved: results.filter(item => item.saved).length,
    results,
  };
}

export async function runRegenerateTitlesCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npx tsx src/scripts/regenerate-titles.ts',
): Promise<number> {
  const options = parseRegenerateTitlesArgs(argv);
  if (options.help) {
    printRegenerateTitlesHelp(invocation);
    return 0;
  }

  const summary = await executeRegenerateTitles(options);
  console.log(`标题批量重生成完成：mode=${summary.mode}, novels=${summary.novelCount}, attempted=${summary.attempted}, improved=${summary.improved}, saved=${summary.saved}`);
  for (const item of summary.results) {
    console.log('');
    console.log(`${item.novelTitle} / 第${item.chapterNumber}章`);
    console.log(`旧标题 [${item.oldScore}]: ${item.oldTitle}`);
    console.log(`新标题 [${item.newScore}]: ${item.newTitle}`);
    console.log(`结果: ${item.improved ? (item.saved ? '已提升并落库' : '已提升（预览未落库）') : '未提升，保留原标题'}`);
    if (!item.improved && item.decisionReasons.length) {
      console.log(`原因: ${item.decisionReasons.join('、')}`);
    }
  }
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runRegenerateTitlesCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('regenerate-titles');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
