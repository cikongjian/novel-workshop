import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { normalizeNovelCostData } from '../cost/cost-summary.js';

type CliOptions = {
  novelIds: string[];
  dryRun: boolean;
  help: boolean;
};

export type NormalizeCostDataCliOptions = CliOptions;

type NormalizeSummary = {
  novelId: string;
  hasCostData: boolean;
  changed: boolean;
  written: boolean;
  chapterCount: number;
};

export type NormalizeCostDataResult = {
  dryRun: boolean;
  novelsDir: string;
  scanned: number;
  hasCostData: number;
  changed: number;
  written: number;
  failed: number;
  novels: Array<NormalizeSummary | { novelId: string; error: string }>;
};

function parseNormalizeCostDataArgs(argv: string[]): CliOptions {
  const novelIds: string[] = [];
  let dryRun = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--novel' && argv[i + 1]) {
      novelIds.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return {
    novelIds,
    dryRun,
    help,
  };
}

function formatNormalizeCostDataHelp(invocation = 'npm run migrate:cost-data --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --novel <novelId>   仅处理指定小说（可重复多次）',
    '  --dry-run           仅输出结果，不写回文件',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --dry-run`,
    `  ${invocation} --novel 123e4567-e89b-12d3-a456-426614174000`,
  ].join('\n');
}

function printNormalizeCostDataHelp(invocation?: string): void {
  console.log(formatNormalizeCostDataHelp(invocation));
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
    const nestedEntries = await fs.readdir(nestedDir, { withFileTypes: true }).catch(() => []);
    const nestedHasCostData = await Promise.all(
      nestedEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => exists(path.join(nestedDir, entry.name, 'cost-data.json'))),
    );
    if (nestedHasCostData.some(Boolean)) return nestedDir;
  }

  return baseDir;
}

async function listNovelIds(novelsDir: string, preferred: string[]): Promise<string[]> {
  if (preferred.length > 0) return [...new Set(preferred)];
  const entries = await fs.readdir(novelsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function normalizeNovelCostFile(
  novelsDir: string,
  novelId: string,
  dryRun: boolean,
): Promise<NormalizeSummary> {
  const costDataPath = path.join(novelsDir, novelId, 'cost-data.json');
  if (!await exists(costDataPath)) {
    return {
      novelId,
      hasCostData: false,
      changed: false,
      written: false,
      chapterCount: 0,
    };
  }

  const rawText = await fs.readFile(costDataPath, 'utf-8');
  const raw = JSON.parse(rawText) as unknown;
  const normalized = normalizeNovelCostData(raw, novelId);
  const before = stableJson(raw);
  const after = stableJson(normalized);
  const changed = before !== after;

  if (changed && !dryRun) {
    await fs.writeFile(costDataPath, `${after}\n`, 'utf-8');
  }

  return {
    novelId,
    hasCostData: true,
    changed,
    written: changed && !dryRun,
    chapterCount: normalized.chapters.length,
  };
}

export async function executeNormalizeCostData(options: CliOptions): Promise<NormalizeCostDataResult> {
  const novelsDir = await resolveNovelsRoot(getNovelsDir());
  const novelIds = await listNovelIds(novelsDir, options.novelIds);

  const summaries: Array<NormalizeSummary | { novelId: string; error: string }> = [];
  for (const novelId of novelIds) {
    try {
      summaries.push(await normalizeNovelCostFile(novelsDir, novelId, options.dryRun));
    } catch (error) {
      summaries.push({
        novelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    dryRun: options.dryRun,
    novelsDir,
    scanned: novelIds.length,
    hasCostData: summaries.filter((item) => 'hasCostData' in item && item.hasCostData).length,
    changed: summaries.filter((item) => 'changed' in item && item.changed).length,
    written: summaries.filter((item) => 'written' in item && item.written).length,
    failed: summaries.filter((item) => 'error' in item).length,
    novels: summaries,
  };
}

export async function runNormalizeCostDataCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run migrate:cost-data --',
): Promise<number> {
  const options = parseNormalizeCostDataArgs(argv);
  if (options.help) {
    printNormalizeCostDataHelp(invocation);
    return 0;
  }

  const result = await executeNormalizeCostData(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.failed > 0) {
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runNormalizeCostDataCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('normalize-cost-data');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error('[normalize-cost-data] fatal:', error);
    process.exit(1);
  });
}
