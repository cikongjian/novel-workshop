/**
 * 重建设定基线（存量小说软修复）
 *
 * 从漂移前章节（--from-chapters）的 world/character 设定提取基线，
 * 标记早期条目 baseline:true、检测后期漂移条目 driftRisk，
 * 写入 setting-baseline.json（confirmed）。只改元数据标记，不动正文/description。
 *
 * 用法: nw dev rebuild-setting-baseline --novel <id> [--from-chapters 1-8] [--allow-mythic] [--dry-run]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { buildSettingBaseline } from '../pipeline/setting-baseline/baseline-snapshot.js';
import { saveSettingBaseline } from '../pipeline/setting-baseline/baseline-store.js';
import { SETTING_DRIFT_TERMS } from '../pipeline/setting-drift-gate.js';

type CliOptions = {
  novelId?: string;
  fromChapters: string;
  allowMythic: boolean;
  dryRun: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { fromChapters: '1-8', allowMythic: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--novel' && argv[i + 1]) { opts.novelId = argv[i + 1]; i += 1; continue; }
    if (a === '--from-chapters' && argv[i + 1]) { opts.fromChapters = argv[i + 1]; i += 1; continue; }
    if (a === '--allow-mythic') { opts.allowMythic = true; continue; }
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
  }
  return opts;
}

function parseEarlyChapterMax(fromChapters: string): number {
  const match = fromChapters.match(/(\d+)\s*-\s*(\d+)/);
  if (match) return Number.parseInt(match[2], 10);
  const single = Number.parseInt(fromChapters, 10);
  return Number.isFinite(single) ? single : 8;
}

function parseChapterFromTags(tags: string[] = []): number | undefined {
  for (const tag of tags) {
    const m = tag.match(/^chapter-(\d+)$/);
    if (m) return Number.parseInt(m[1], 10);
  }
  return undefined;
}

function countDriftHits(text: string): number {
  let hits = 0;
  for (const term of SETTING_DRIFT_TERMS) {
    let idx = 0;
    while ((idx = text.indexOf(term, idx)) !== -1) {
      hits += 1;
      idx += term.length;
      if (hits > 100) return hits;
    }
  }
  return hits;
}

function computeDriftRisk(text: string): number | undefined {
  const hits = countDriftHits(text);
  if (hits < 3) return undefined;
  return Math.min(1, Math.round((hits / 15) * 10) / 10);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function runRebuildSettingBaselineCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw dev rebuild-setting-baseline',
): Promise<number> {
  const opts = parseArgs(argv);
  if (opts.help || !opts.novelId) {
    process.stdout.write([
      `用法: ${invocation} --novel <novelId> [--from-chapters 1-8] [--allow-mythic] [--dry-run]`,
      '  --novel <id>          目标小说 ID（必填）',
      '  --from-chapters 1-8   用漂移前章节范围提取基线（默认 1-8）',
      '  --allow-mythic        允许上界神明线（神话/仙侠题材，跳过上界禁令）',
      '  --dry-run             仅预览，不写盘',
      '  -h, --help            显示帮助',
    ].join('\n') + '\n');
    return opts.help ? 0 : 1;
  }

  const novelsDir = getNovelsDir();
  const novelDir = resolveNovelStorageDir(novelsDir, opts.novelId);
  const earlyMax = parseEarlyChapterMax(opts.fromChapters);

  const novel = await readJson<Record<string, unknown>>(path.join(novelDir, 'novel.json'));
  const worldEntries = (await readJson<Array<Record<string, unknown>>>(path.join(novelDir, 'world.json'))) ?? [];
  const characters = (await readJson<Array<Record<string, unknown>>>(path.join(novelDir, 'characters.json'))) ?? [];
  if (!novel) {
    process.stderr.write(`[rebuild-setting-baseline] 未找到 novel.json: ${opts.novelId}\n`);
    return 1;
  }

  let worldBaselineMarked = 0;
  let worldDriftMarked = 0;
  for (const e of worldEntries) {
    const introducedIn = (e.introducedIn as number | undefined) ?? parseChapterFromTags(e.tags as string[] | undefined);
    if (introducedIn && introducedIn <= earlyMax) {
      e.baseline = true;
      worldBaselineMarked += 1;
    }
    const risk = computeDriftRisk(`${e.name ?? ''} ${e.description ?? ''}`);
    if (risk !== undefined) {
      e.driftRisk = risk;
      worldDriftMarked += 1;
    }
  }

  let charBaselineMarked = 0;
  let charDriftMarked = 0;
  for (const c of characters) {
    const fa = (c.firstAppearance as number | undefined) ?? 1;
    if (fa <= earlyMax) {
      c.baseline = true;
      charBaselineMarked += 1;
    }
    const abilities = Array.isArray(c.abilities) ? (c.abilities as string[]).join(' ') : '';
    const risk = computeDriftRisk(`${c.personality ?? ''} ${abilities} ${c.currentState ?? ''}`);
    if (risk !== undefined) {
      c.driftRisk = risk;
      charDriftMarked += 1;
    }
  }

  const baseline = buildSettingBaseline({
    novel: {
      id: (novel.id as string) ?? opts.novelId,
      genre: novel.genre as string | undefined,
      title: novel.title as string | undefined,
      synopsis: novel.synopsis as string | undefined,
      tags: novel.tags as string[] | undefined,
    },
    worldEntries: worldEntries as any,
    characters: characters as any,
    fromChapters: opts.fromChapters,
    allowMythicUpgrades: opts.allowMythic,
  });

  const summary = {
    novelId: opts.novelId,
    fromChapters: opts.fromChapters,
    worldBaselineMarked,
    worldDriftMarked,
    characterBaselineMarked: charBaselineMarked,
    characterDriftMarked: charDriftMarked,
    baselinePowerSystems: baseline.powerSystems.map(p => p.name),
    forbiddenDirections: baseline.forbiddenDirections,
    dryRun: opts.dryRun,
  };

  if (opts.dryRun) {
    process.stdout.write(`[rebuild-setting-baseline] DRY-RUN 摘要:\n${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }

  if (worldEntries.length > 0) {
    await fs.writeFile(path.join(novelDir, 'world.json'), JSON.stringify(worldEntries, null, 2), 'utf-8');
  }
  if (characters.length > 0) {
    await fs.writeFile(path.join(novelDir, 'characters.json'), JSON.stringify(characters, null, 2), 'utf-8');
  }
  await saveSettingBaseline(novelsDir, {
    ...baseline,
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
  });

  process.stdout.write(`[rebuild-setting-baseline] 完成:\n${JSON.stringify(summary, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runRebuildSettingBaselineCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('rebuild-setting-baseline');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[rebuild-setting-baseline] fatal:', err);
    process.exit(1);
  });
}
