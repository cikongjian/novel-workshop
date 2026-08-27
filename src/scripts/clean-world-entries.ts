import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { WorldEntry } from '../novel/types.js';
import { normalizeWorldEntry } from '../novel/world-entry-quality.js';

type CliOptions = {
  novelIds: string[];
  dryRun: boolean;
  help?: boolean;
};

export type CleanWorldEntriesCliOptions = CliOptions;

export type CleanWorldEntryNovelSummary = {
  novelId: string;
  total: number;
  changed: number;
  skippedInvalid: number;
  written: boolean;
};

export type CleanWorldEntriesResult = {
  dryRun: boolean;
  novels: Array<CleanWorldEntryNovelSummary | { novelId: string; error: string }>;
};

function parseCleanWorldEntriesArgs(argv: string[]): CliOptions {
  const novelIds: string[] = [];
  let dryRun = true;
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
    if (arg === '--apply') {
      dryRun = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
  }

  return { novelIds, dryRun, help };
}

function formatCleanWorldEntriesHelp(invocation = 'npm run clean:world-entries --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --novel <novelId>   仅处理指定小说（可重复多次）',
    '  --dry-run           仅预览结果，不写回文件（默认）',
    '  --apply             实际写回 world.json',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --novel <novelId>`,
    `  ${invocation} --apply --novel <novelId>`,
  ].join('\n');
}

function printCleanWorldEntriesHelp(invocation?: string): void {
  console.log(formatCleanWorldEntriesHelp(invocation));
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
    const nestedHasWorld = await Promise.all(
      nestedEntries
        .filter(entry => entry.isDirectory())
        .map(entry => exists(path.join(nestedDir, entry.name, 'world.json'))),
    );
    if (nestedHasWorld.some(Boolean)) return nestedDir;
  }

  return baseDir;
}

async function listNovelIds(novelsDir: string, preferred: string[]): Promise<string[]> {
  if (preferred.length > 0) return preferred;
  const entries = await fs.readdir(novelsDir, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function cleanNovelWorldEntries(
  novelsDir: string,
  novelId: string,
  dryRun: boolean,
): Promise<CleanWorldEntryNovelSummary> {
  const worldPath = path.join(novelsDir, novelId, 'world.json');
  const raw = await fs.readFile(worldPath, 'utf-8').catch(() => '[]');
  const parsed = JSON.parse(raw) as unknown[];
  const cleaned: unknown[] = [];

  let changed = 0;
  let skippedInvalid = 0;

  for (const item of parsed) {
    try {
      const entry = WorldEntry.parse(item);
      const normalized = normalizeWorldEntry(entry);
      if (stableJson(entry) !== stableJson(normalized)) {
        changed += 1;
      }
      cleaned.push(normalized);
    } catch {
      skippedInvalid += 1;
      cleaned.push(item);
    }
  }

  if (!dryRun && changed > 0) {
    await fs.writeFile(worldPath, `${stableJson(cleaned)}\n`, 'utf-8');
  }

  return {
    novelId,
    total: parsed.length,
    changed,
    skippedInvalid,
    written: !dryRun && changed > 0,
  };
}

export async function executeCleanWorldEntries(options: CliOptions): Promise<CleanWorldEntriesResult> {
  const novelsDir = await resolveNovelsRoot(getNovelsDir());
  const novelIds = await listNovelIds(novelsDir, options.novelIds);

  const result: CleanWorldEntriesResult['novels'] = [];
  for (const novelId of novelIds) {
    try {
      const summary = await cleanNovelWorldEntries(novelsDir, novelId, options.dryRun);
      result.push(summary);
    } catch (error) {
      result.push({
        novelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    dryRun: options.dryRun,
    novels: result,
  };
}

export async function runCleanWorldEntriesCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run clean:world-entries --',
): Promise<number> {
  const options = parseCleanWorldEntriesArgs(argv);
  if (options.help) {
    printCleanWorldEntriesHelp(invocation);
    return 0;
  }

  const result = await executeCleanWorldEntries(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runCleanWorldEntriesCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('clean-world-entries');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[clean-world-entries] fatal:', err);
    process.exit(1);
  });
}
