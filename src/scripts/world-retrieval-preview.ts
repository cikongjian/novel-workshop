import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { WorldEntry } from '../novel/types.js';
import { selectWorldCardsV2 } from '../pipeline/world-context-v2.js';

type CliOptions = {
  novelId: string;
  chapterNumber: number;
  query?: string;
  topK: number;
  help?: boolean;
};

export type WorldRetrievalPreviewCliOptions = CliOptions;

export type WorldRetrievalPreviewOutput = {
  novelId: string;
  chapterNumber: number;
  topK: number;
  queryPreview: string;
  selectedCount: number;
  cards: Awaited<ReturnType<typeof selectWorldCardsV2>>;
};

function parseWorldRetrievalPreviewArgs(argv: string[]): CliOptions {
  let novelId = '';
  let chapterNumber = 1;
  let query: string | undefined;
  let topK = 10;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--novel' && argv[i + 1]) {
      novelId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--chapter' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        chapterNumber = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--query' && argv[i + 1]) {
      query = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--topk' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        topK = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
  }

  if (!help && !novelId) {
    throw new Error('缺少参数 --novel <novelId>');
  }

  return { novelId, chapterNumber, query, topK, help };
}

function formatWorldRetrievalPreviewHelp(invocation = 'npm run preview:world-retrieval --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --novel <novelId>   指定小说 ID',
    '  --chapter <number>  指定章节号（默认 1）',
    '  --query <text>      手动指定检索 query，默认取章节前 300 字',
    '  --topk <count>      召回数量（默认 10）',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --novel <novelId> --chapter 10`,
    `  ${invocation} --novel <novelId> --chapter 10 --query "冰川祭坛 星陨之地 守夜人" --topk 12`,
  ].join('\n');
}

function printWorldRetrievalPreviewHelp(invocation?: string): void {
  console.log(formatWorldRetrievalPreviewHelp(invocation));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveNovelsRoot(baseDir: string): Promise<string> {
  const nestedDir = path.join(baseDir, 'novels');
  if (await exists(nestedDir)) {
    return nestedDir;
  }
  return baseDir;
}

export async function executeWorldRetrievalPreview(options: CliOptions): Promise<WorldRetrievalPreviewOutput> {
  const novelsRoot = await resolveNovelsRoot(getNovelsDir());
  const novelDir = path.join(novelsRoot, options.novelId);

  const worldRaw = await fs.readFile(path.join(novelDir, 'world.json'), 'utf-8');
  const worldEntries = JSON.parse(worldRaw) as unknown[];
  const parsedEntries = worldEntries.map(item => WorldEntry.parse(item));

  const chapterPath = path.join(novelDir, 'chapters', `${String(options.chapterNumber).padStart(3, '0')}.md`);
  let fallbackQuery = '';
  if (await exists(chapterPath)) {
    const chapter = await fs.readFile(chapterPath, 'utf-8');
    fallbackQuery = chapter.slice(0, 300);
  }

  const query = options.query ?? fallbackQuery;
  const cards = selectWorldCardsV2({
    entries: parsedEntries.filter(entry => !entry.tags.includes('auto-generated')),
    query,
    chapterNumber: options.chapterNumber,
    topK: options.topK,
  });

  return {
    novelId: options.novelId,
    chapterNumber: options.chapterNumber,
    topK: options.topK,
    queryPreview: query.slice(0, 120),
    selectedCount: cards.length,
    cards,
  };
}

export async function runWorldRetrievalPreviewCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run preview:world-retrieval --',
): Promise<number> {
  const options = parseWorldRetrievalPreviewArgs(argv);
  if (options.help) {
    printWorldRetrievalPreviewHelp(invocation);
    return 0;
  }

  const output = await executeWorldRetrievalPreview(options);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runWorldRetrievalPreviewCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('world-retrieval-preview');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[world-retrieval-preview] fatal:', err);
    process.exit(1);
  });
}
