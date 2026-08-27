import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { WorldEntry, CharacterProfile } from '../novel/types.js';
import { selectWorldCardsV2 } from '../pipeline/world-context-v2.js';
import { buildWorldContract, evaluateWorldContractFulfillment } from '../pipeline/world-contract.js';

type CliOptions = {
  novelId: string;
  chapterNumber: number;
  query?: string;
  topK: number;
  gateMode: 'warn' | 'strict';
  help?: boolean;
};

export type WorldContractPreviewCliOptions = CliOptions;

export type WorldContractPreviewOutput = {
  generatedAt: string;
  novelId: string;
  chapterNumber: number;
  topK: number;
  gateMode: 'warn' | 'strict';
  queryPreview: string;
  cards: Awaited<ReturnType<typeof selectWorldCardsV2>>;
  contract: ReturnType<typeof buildWorldContract>;
  fulfillment?: ReturnType<typeof evaluateWorldContractFulfillment>;
};

function parseWorldContractPreviewArgs(argv: string[]): CliOptions {
  let novelId = '';
  let chapterNumber = 1;
  let query: string | undefined;
  let topK = 10;
  let gateMode: 'warn' | 'strict' = 'warn';
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
      if (Number.isFinite(parsed) && parsed > 0) chapterNumber = parsed;
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
      if (Number.isFinite(parsed) && parsed > 0) topK = parsed;
      i += 1;
      continue;
    }
    if (arg === '--gate' && argv[i + 1]) {
      if (argv[i + 1] === 'strict') gateMode = 'strict';
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

  return { novelId, chapterNumber, query, topK, gateMode, help };
}

function formatWorldContractPreviewHelp(invocation = 'npm run preview:world-contract --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --novel <novelId>   指定小说 ID',
    '  --chapter <number>  指定章节号（默认 1）',
    '  --query <text>      手动指定 query，默认取章节前 300 字',
    '  --topk <count>      世界卡片召回数量（默认 10）',
    '  --gate <mode>       门禁模式：warn | strict（默认 warn）',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --novel <novelId> --chapter 10`,
    `  ${invocation} --novel <novelId> --chapter 10 --gate strict --topk 12`,
  ].join('\n');
}

function printWorldContractPreviewHelp(invocation?: string): void {
  console.log(formatWorldContractPreviewHelp(invocation));
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

async function readChapterContent(novelDir: string, chapterNumber: number): Promise<string> {
  const mdPath = path.join(novelDir, 'chapters', `${String(chapterNumber).padStart(3, '0')}.md`);
  if (!(await exists(mdPath))) return '';
  return fs.readFile(mdPath, 'utf-8');
}

async function readCharacterNames(novelDir: string): Promise<string[]> {
  const charactersPath = path.join(novelDir, 'characters.json');
  if (!(await exists(charactersPath))) return [];

  const raw = await fs.readFile(charactersPath, 'utf-8');
  const list = JSON.parse(raw) as unknown[];
  const names: string[] = [];
  for (const item of list) {
    try {
      const parsed = CharacterProfile.parse(item);
      names.push(parsed.name, ...parsed.aliases);
    } catch {
      // Ignore invalid character payloads.
    }
  }
  return [...new Set(names.map(name => name.trim()).filter(Boolean))];
}

export async function executeWorldContractPreview(options: CliOptions): Promise<WorldContractPreviewOutput> {
  const novelsRoot = await resolveNovelsRoot(getNovelsDir());
  const novelDir = path.join(novelsRoot, options.novelId);

  const worldRaw = await fs.readFile(path.join(novelDir, 'world.json'), 'utf-8');
  const worldEntries = (JSON.parse(worldRaw) as unknown[]).map(item => WorldEntry.parse(item));
  const chapterContent = await readChapterContent(novelDir, options.chapterNumber);
  const characterNames = await readCharacterNames(novelDir);

  const query = options.query ?? chapterContent.slice(0, 300);
  const reusableEntries = worldEntries.filter(entry => !entry.tags.includes('auto-generated'));
  const cards = selectWorldCardsV2({
    entries: reusableEntries,
    query,
    chapterNumber: options.chapterNumber,
    topK: options.topK,
  });

  const contract = buildWorldContract({
    entries: reusableEntries,
    chapterNumber: options.chapterNumber,
    query,
    topK: options.topK,
    selectedCards: cards,
  });

  const fulfillment = chapterContent
    ? evaluateWorldContractFulfillment({
        contract,
        chapterContent,
        gateMode: options.gateMode,
        knownWorldEntries: worldEntries,
        knownCharacterNames: characterNames,
      })
    : undefined;

  return {
    generatedAt: new Date().toISOString(),
    novelId: options.novelId,
    chapterNumber: options.chapterNumber,
    topK: options.topK,
    gateMode: options.gateMode,
    queryPreview: query.slice(0, 120),
    cards,
    contract,
    fulfillment,
  };
}

export async function runWorldContractPreviewCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run preview:world-contract --',
): Promise<number> {
  const options = parseWorldContractPreviewArgs(argv);
  if (options.help) {
    printWorldContractPreviewHelp(invocation);
    return 0;
  }

  const output = await executeWorldContractPreview(options);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runWorldContractPreviewCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('world-contract-preview');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[world-contract-preview] fatal:', err);
    process.exit(1);
  });
}
