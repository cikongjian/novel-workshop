import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import {
  WorldEntry as WorldEntrySchema,
  CharacterProfile as CharacterProfileSchema,
} from '../novel/types.js';
import type {
  WorldEntry as WorldEntryModel,
  CharacterProfile as CharacterProfileModel,
} from '../novel/types.js';
import { selectWorldCardsV2 } from '../pipeline/world-context-v2.js';
import { buildWorldContract, evaluateWorldContractFulfillment } from '../pipeline/world-contract.js';

type CliOptions = {
  novelIds: string[];
  outPath?: string;
  lastChapters: number;
  topK: number;
  gateMode: 'warn' | 'strict';
  fromChapter?: number;
  toChapter?: number;
  help?: boolean;
};

export type WorldGateReportCliOptions = CliOptions;

type ChapterGateStat = {
  chapterNumber: number;
  requiredTotal: number;
  requiredHit: number;
  requiredHitRate: number;
  missingRequired: string[];
  unsourcedTerms: string[];
  passed: boolean;
  summary: string;
};

type CountItem = {
  name: string;
  count: number;
};

export type NovelGateReport = {
  novelId: string;
  chapters: {
    analyzed: number;
    range: string;
    passCount: number;
    passRate: number;
    avgRequiredHitRate: number;
    requiredZeroChapters: number;
    requiredMissAllChapters: number;
  };
  topMissingRequired: CountItem[];
  topUnsourcedTerms: CountItem[];
  chapterStats: ChapterGateStat[];
};

export type WorldGateReportOutput = {
  generatedAt: string;
  options: {
    novelIds: string[];
    lastChapters: number;
    topK: number;
    gateMode: 'warn' | 'strict';
    fromChapter?: number;
    toChapter?: number;
  };
  reports: NovelGateReport[];
};

function parseWorldGateReportArgs(argv: string[]): CliOptions {
  const novelIds: string[] = [];
  let outPath: string | undefined;
  let lastChapters = 20;
  let topK = 10;
  let gateMode: 'warn' | 'strict' = 'strict';
  let fromChapter: number | undefined;
  let toChapter: number | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--novel' && argv[i + 1]) {
      novelIds.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--last' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        lastChapters = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--topk' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed >= 4) {
        topK = Math.min(30, parsed);
      }
      i += 1;
      continue;
    }
    if (arg === '--gate' && argv[i + 1]) {
      gateMode = argv[i + 1] === 'warn' ? 'warn' : 'strict';
      i += 1;
      continue;
    }
    if (arg === '--from' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        fromChapter = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--to' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        toChapter = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
  }

  return { novelIds, outPath, lastChapters, topK, gateMode, fromChapter, toChapter, help };
}

function formatWorldGateReportHelp(invocation = 'npm run report:world-gate --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --novel <novelId>   仅分析指定小说（可重复多次）',
    '  --out <path>        输出 JSON 文件路径',
    '  --last <count>      仅分析最近 N 章（默认 20）',
    '  --topk <count>      世界卡片召回数量，范围 4-30（默认 10）',
    '  --gate <mode>       门禁模式：warn | strict（默认 strict）',
    '  --from <chapter>    起始章节号',
    '  --to <chapter>      结束章节号',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation} --novel <novelId> --last 20 --gate strict`,
    `  ${invocation} --novel <novelId> --from 50 --to 80 --out docs/world-gate-report.json`,
  ].join('\n');
}

function printWorldGateReportHelp(invocation?: string): void {
  console.log(formatWorldGateReportHelp(invocation));
}

function toFixed3(value: number): number {
  return Number(value.toFixed(3));
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
  if (await exists(nestedDir)) return nestedDir;
  return baseDir;
}

async function listNovelIds(novelsRoot: string, preferred: string[]): Promise<string[]> {
  if (preferred.length > 0) return preferred;
  const entries = await fs.readdir(novelsRoot, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

async function safeReadText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function parseJsonArray(raw: string): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseWorldEntries(raw: string): WorldEntryModel[] {
  const items = parseJsonArray(raw);
  const parsed: WorldEntryModel[] = [];
  for (const item of items) {
    const result = WorldEntrySchema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function parseCharacters(raw: string): CharacterProfileModel[] {
  const items = parseJsonArray(raw);
  const parsed: CharacterProfileModel[] = [];
  for (const item of items) {
    const result = CharacterProfileSchema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function collectKnownCharacterNames(characters: CharacterProfileModel[]): string[] {
  const names = new Set<string>();
  for (const character of characters) {
    const add = (value: string) => {
      const normalized = value.trim();
      if (normalized.length > 0) names.add(normalized);
    };
    add(character.name);
    character.aliases.forEach(add);
  }
  return Array.from(names);
}

function buildCounterTop(counter: Map<string, number>, limit = 10): CountItem[] {
  return Array.from(counter.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildQueryFromChapter(content: string, chapterNumber: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return `chapter-${chapterNumber}`;
  return normalized.slice(0, 500);
}

async function buildNovelReport(novelsRoot: string, novelId: string, options: CliOptions): Promise<NovelGateReport> {
  const novelDir = path.join(novelsRoot, novelId);
  const chaptersDir = path.join(novelDir, 'chapters');
  const worldPath = path.join(novelDir, 'world.json');
  const charactersPath = path.join(novelDir, 'characters.json');

  const [worldRaw, charactersRaw, chapterFiles] = await Promise.all([
    safeReadText(worldPath),
    safeReadText(charactersPath),
    fs.readdir(chaptersDir).catch(() => [] as string[]),
  ]);

  const worldEntries = parseWorldEntries(worldRaw);
  const reusableWorldEntries = worldEntries.filter(entry => !entry.tags.includes('auto-generated'));
  const characters = parseCharacters(charactersRaw);
  const knownCharacterNames = collectKnownCharacterNames(characters);

  const chapterNumbers = chapterFiles
    .filter(file => file.endsWith('.md'))
    .map(file => Number.parseInt(path.parse(file).name, 10))
    .filter(num => Number.isFinite(num) && num > 0)
    .sort((a, b) => a - b);

  let targetChapters = chapterNumbers;
  if (typeof options.fromChapter === 'number') {
    targetChapters = targetChapters.filter(chapter => chapter >= options.fromChapter!);
  }
  if (typeof options.toChapter === 'number') {
    targetChapters = targetChapters.filter(chapter => chapter <= options.toChapter!);
  }
  if (options.lastChapters > 0) {
    targetChapters = targetChapters.slice(-options.lastChapters);
  }

  const missingCounter = new Map<string, number>();
  const unsourcedCounter = new Map<string, number>();
  const chapterStats: ChapterGateStat[] = [];
  let passCount = 0;
  let requiredZeroChapters = 0;
  let requiredMissAllChapters = 0;
  let requiredHitRateSum = 0;

  for (const chapterNumber of targetChapters) {
    const chapterPath = path.join(chaptersDir, `${String(chapterNumber).padStart(3, '0')}.md`);
    const chapterContent = await safeReadText(chapterPath);
    const query = buildQueryFromChapter(chapterContent, chapterNumber);

    const selectedCards = selectWorldCardsV2({
      entries: reusableWorldEntries,
      query,
      chapterNumber,
      topK: options.topK,
    });

    const contract = buildWorldContract({
      entries: reusableWorldEntries,
      chapterNumber,
      query,
      topK: options.topK,
      selectedCards,
    });

    const fulfillment = evaluateWorldContractFulfillment({
      contract,
      chapterContent,
      gateMode: options.gateMode,
      knownWorldEntries: reusableWorldEntries,
      knownCharacterNames,
    });

    if (fulfillment.passed) passCount += 1;
    if (fulfillment.requiredTotal === 0) requiredZeroChapters += 1;
    if (fulfillment.requiredTotal > 0 && fulfillment.requiredHit === 0) requiredMissAllChapters += 1;

    const requiredHitRate = fulfillment.requiredTotal === 0
      ? 1
      : fulfillment.requiredHit / fulfillment.requiredTotal;
    requiredHitRateSum += requiredHitRate;

    for (const name of fulfillment.missingRequired) {
      missingCounter.set(name, (missingCounter.get(name) ?? 0) + 1);
    }
    for (const term of fulfillment.unsourcedTerms) {
      unsourcedCounter.set(term, (unsourcedCounter.get(term) ?? 0) + 1);
    }

    chapterStats.push({
      chapterNumber,
      requiredTotal: fulfillment.requiredTotal,
      requiredHit: fulfillment.requiredHit,
      requiredHitRate: toFixed3(requiredHitRate),
      missingRequired: fulfillment.missingRequired,
      unsourcedTerms: fulfillment.unsourcedTerms,
      passed: fulfillment.passed,
      summary: fulfillment.summary,
    });
  }

  const analyzed = chapterStats.length;
  return {
    novelId,
    chapters: {
      analyzed,
      range: analyzed > 0
        ? `${chapterStats[0].chapterNumber}-${chapterStats[chapterStats.length - 1].chapterNumber}`
        : 'none',
      passCount,
      passRate: analyzed === 0 ? 0 : toFixed3(passCount / analyzed),
      avgRequiredHitRate: analyzed === 0 ? 0 : toFixed3(requiredHitRateSum / analyzed),
      requiredZeroChapters,
      requiredMissAllChapters,
    },
    topMissingRequired: buildCounterTop(missingCounter),
    topUnsourcedTerms: buildCounterTop(unsourcedCounter),
    chapterStats,
  };
}

export async function executeWorldGateReport(options: CliOptions): Promise<WorldGateReportOutput> {
  const novelsRoot = await resolveNovelsRoot(getNovelsDir());
  const novelIds = await listNovelIds(novelsRoot, options.novelIds);

  const reports: NovelGateReport[] = [];
  for (const novelId of novelIds) {
    try {
      reports.push(await buildNovelReport(novelsRoot, novelId, options));
    } catch (error) {
      console.warn(`[world-gate-report] skip novel=${novelId}:`, error instanceof Error ? error.message : String(error));
    }
  }

  const output: WorldGateReportOutput = {
    generatedAt: new Date().toISOString(),
    options: {
      novelIds: options.novelIds,
      lastChapters: options.lastChapters,
      topK: options.topK,
      gateMode: options.gateMode,
      fromChapter: options.fromChapter,
      toChapter: options.toChapter,
    },
    reports,
  };

  const content = `${JSON.stringify(output, null, 2)}\n`;
  if (options.outPath) {
    const absOutPath = path.resolve(options.outPath);
    await fs.mkdir(path.dirname(absOutPath), { recursive: true });
    await fs.writeFile(absOutPath, content, 'utf-8');
  }
  return output;
}

export async function runWorldGateReportCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run report:world-gate --',
): Promise<number> {
  const options = parseWorldGateReportArgs(argv);
  if (options.help) {
    printWorldGateReportHelp(invocation);
    return 0;
  }

  const output = await executeWorldGateReport(options);
  const content = `${JSON.stringify(output, null, 2)}\n`;
  process.stdout.write(content);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runWorldGateReportCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('world-gate-report');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[world-gate-report] fatal:', err);
    process.exit(1);
  });
}
