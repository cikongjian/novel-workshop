import path from 'node:path';
import { NovelManager } from '../novel/novel-manager.js';
import { DEFAULT_TITLE_REWRITE_SCORE, evaluateChapterTitle } from '../agents/title-audit.js';

type TitleAuditCliOptions = {
  novelId?: string;
  from?: number;
  to?: number;
  limit: number;
  maxScore: number;
  json: boolean;
};

type AuditedTitleRow = {
  novelId: string;
  novelTitle: string;
  chapterNumber: number;
  title: string;
  score: number;
  issues: string[];
  strengths: string[];
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

function parseArgs(argv: string[] = process.argv.slice(2)): TitleAuditCliOptions {
  const options: TitleAuditCliOptions = {
    limit: 20,
    maxScore: DEFAULT_TITLE_REWRITE_SCORE,
    json: false,
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
    if (arg === '--json') {
      options.json = true;
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

function formatTitleAuditHelp(invocation = 'npm run audit:titles'): string {
  return [
    `用法: ${invocation} [--novel <novelId>] [--from <n>] [--to <n>] [--limit <n>] [--max-score <n>] [--json]`,
    '',
    '选项:',
    '  --novel <novelId>   仅审计指定小说',
    '  --from <n>          起始章节号',
    '  --to <n>            结束章节号',
    '  --limit <n>         最多输出多少条低分标题，默认 20',
    `  --max-score <n>     仅输出不高于该分数的标题，默认 ${DEFAULT_TITLE_REWRITE_SCORE}`,
    '  --json              以 JSON 输出完整结果',
  ].join('\n');
}

function printIssueSummary(rows: AuditedTitleRow[]): void {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const issue of row.issues) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }

  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (ordered.length === 0) {
    console.log('未发现低分标题问题。');
    return;
  }

  console.log('主要问题分布:');
  for (const [issue, count] of ordered) {
    console.log(`- ${issue}: ${count}`);
  }
}

async function collectAuditedRows(options: TitleAuditCliOptions): Promise<AuditedTitleRow[]> {
  const novelManager = new NovelManager(path.join(process.cwd(), 'data'));
  const novels = options.novelId
    ? [await novelManager.getNovel(options.novelId)]
    : await novelManager.listNovels();

  const rows: AuditedTitleRow[] = [];

  for (const novel of novels) {
    const chapterSummaries = await novelManager.listChapters(novel.id);
    const ranged = chapterSummaries.filter((chapter) => {
      if (options.from && chapter.chapterNumber < options.from) return false;
      if (options.to && chapter.chapterNumber > options.to) return false;
      return true;
    });

    for (const summary of ranged) {
      if (!summary.title.trim()) continue;

      const evaluation = evaluateChapterTitle(summary.title, {
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        novelTags: novel.tags,
        constitutionTags: novel.constitutionTags,
        chapterNumber: summary.chapterNumber,
        startupPlatformProfile: novel.startupPlatformProfile,
        outline: summary.summary || '',
        summary: summary.summary || '',
        recentTitles: summary.chapterNumber > 1
          ? chapterSummaries
              .filter((item) => item.chapterNumber < summary.chapterNumber)
              .slice(-3)
              .map((item) => item.title)
              .filter(Boolean)
          : [],
      });

      if (evaluation.score > options.maxScore) {
        continue;
      }

      rows.push({
        novelId: novel.id,
        novelTitle: novel.title,
        chapterNumber: summary.chapterNumber,
        title: summary.title,
        score: evaluation.score,
        issues: evaluation.issues,
        strengths: evaluation.strengths,
      });
    }
  }

  rows.sort((a, b) => a.score - b.score || a.novelTitle.localeCompare(b.novelTitle, 'zh-CN'));
  return rows.slice(0, options.limit);
}

export async function runTitleAuditCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run audit:titles',
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(formatTitleAuditHelp(invocation));
    return 0;
  }

  const options = parseArgs(argv);
  const rows = await collectAuditedRows(options);

  if (options.json) {
    console.log(JSON.stringify({
      threshold: options.maxScore,
      count: rows.length,
      rows,
    }, null, 2));
    return 0;
  }

  console.log(`标题审计完成：输出 ${rows.length} 条分数 <= ${options.maxScore} 的标题`);
  printIssueSummary(rows);
  for (const row of rows) {
    console.log('');
    console.log(`[${row.score}] ${row.novelTitle} / 第${row.chapterNumber}章`);
    console.log(`标题: ${row.title}`);
    console.log(`问题: ${row.issues.join('、') || '无'}`);
  }
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runTitleAuditCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('title-audit');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
