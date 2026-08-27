/**
 * 审计小说的设定漂移（只读报告）
 *
 * 扫描 world/character 条目的漂移术语命中，识别漂移源、回填污染候选、
 * 建议标记为 baseline 的早期条目。不修改任何文件。
 *
 * 用法: nw dev audit-setting-drift --novel <id> [--out <path>] [--early-chapter 8]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import { SETTING_DRIFT_TERMS } from '../pipeline/setting-drift-gate.js';
import { loadSettingBaseline } from '../pipeline/setting-baseline/baseline-store.js';

type CliOptions = {
  novelId?: string;
  outPath?: string;
  earlyChapter: number;
  help: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { earlyChapter: 8, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--novel' && argv[i + 1]) { opts.novelId = argv[i + 1]; i += 1; continue; }
    if (a === '--out' && argv[i + 1]) { opts.outPath = argv[i + 1]; i += 1; continue; }
    if (a === '--early-chapter' && argv[i + 1]) {
      const n = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(n) && n > 0) opts.earlyChapter = n;
      i += 1; continue;
    }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
  }
  return opts;
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
      if (hits > 200) return hits;
    }
  }
  return hits;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type DriftItem = { name: string; category?: string; driftHits: number; introducedIn?: number; alreadyBaseline?: boolean };

export async function runAuditSettingDriftCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw dev audit-setting-drift',
): Promise<number> {
  const opts = parseArgs(argv);
  if (opts.help || !opts.novelId) {
    process.stdout.write([
      `用法: ${invocation} --novel <novelId> [--out <path>] [--early-chapter 8]`,
      '  --novel <id>           目标小说 ID（必填）',
      '  --out <path>           输出 JSON 报告路径（默认仅 stdout）',
      '  --early-chapter <n>    判定"早期条目"的章节上限（默认 8），<= 该章的建议标 baseline',
      '  -h, --help             显示帮助',
    ].join('\n') + '\n');
    return opts.help ? 0 : 1;
  }

  const novelsDir = getNovelsDir();
  const novelDir = resolveNovelStorageDir(novelsDir, opts.novelId);
  const worldEntries = (await readJson<Array<Record<string, unknown>>>(path.join(novelDir, 'world.json'))) ?? [];
  const characters = (await readJson<Array<Record<string, unknown>>>(path.join(novelDir, 'characters.json'))) ?? [];
  const existingBaseline = await loadSettingBaseline(novelsDir, opts.novelId);

  const worldDrift: DriftItem[] = [];
  const suggestedBaselineWorld: string[] = [];
  const backfillCandidates: Array<{ name: string; createdAt?: string; updatedAt?: string; reason: string }> = [];
  for (const e of worldEntries) {
    const name = (e.name as string) ?? '(未命名)';
    const introducedIn = (e.introducedIn as number | undefined) ?? parseChapterFromTags(e.tags as string[] | undefined);
    const hits = countDriftHits(`${name} ${e.description ?? ''}`);
    if (hits >= 3) {
      worldDrift.push({
        name,
        category: e.category as string | undefined,
        driftHits: hits,
        introducedIn,
        alreadyBaseline: e.baseline === true,
      });
    }
    if (introducedIn && introducedIn <= opts.earlyChapter) {
      suggestedBaselineWorld.push(`${name}（第${introducedIn}章）`);
    }
    if (e.createdAt && e.updatedAt && e.createdAt !== e.updatedAt) {
      const createdTag = parseChapterFromTags(e.tags as string[] | undefined);
      backfillCandidates.push({
        name,
        createdAt: e.createdAt as string,
        updatedAt: e.updatedAt as string,
        reason: createdTag ? `第${createdTag}章条目被后期更新（疑似回填污染）` : 'createdAt ≠ updatedAt（疑似回填污染）',
      });
    }
  }
  worldDrift.sort((a, b) => b.driftHits - a.driftHits);

  const charDrift: DriftItem[] = [];
  for (const c of characters) {
    const name = (c.name as string) ?? '(未命名)';
    const abilities = Array.isArray(c.abilities) ? (c.abilities as string[]).join(' ') : '';
    const hits = countDriftHits(`${name} ${c.personality ?? ''} ${abilities} ${c.currentState ?? ''}`);
    if (hits >= 3) {
      charDrift.push({
        name,
        category: c.role as string | undefined,
        driftHits: hits,
        alreadyBaseline: c.baseline === true,
      });
    }
  }
  charDrift.sort((a, b) => b.driftHits - a.driftHits);

  const report = {
    novelId: opts.novelId,
    generatedAt: new Date().toISOString(),
    baselineStatus: existingBaseline?.status ?? 'absent',
    summary: {
      worldEntries: worldEntries.length,
      worldDriftEntries: worldDrift.length,
      characterDrift: charDrift.length,
      backfillCandidates: backfillCandidates.length,
      suggestedBaselineWorld: suggestedBaselineWorld.length,
    },
    worldDrift: worldDrift.slice(0, 20),
    characterDrift: charDrift.slice(0, 20),
    backfillCandidates: backfillCandidates.slice(0, 20),
    suggestedBaselineWorld: suggestedBaselineWorld.slice(0, 30),
    driftTerms: SETTING_DRIFT_TERMS,
  };

  const content = JSON.stringify(report, null, 2);
  if (opts.outPath) {
    const absOut = path.resolve(opts.outPath);
    await fs.mkdir(path.dirname(absOut), { recursive: true });
    await fs.writeFile(absOut, content, 'utf-8');
    process.stdout.write(`[audit-setting-drift] 报告已写入 ${absOut}\n摘要: ${JSON.stringify(report.summary)}\n`);
  } else {
    process.stdout.write(`${content}\n`);
  }
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runAuditSettingDriftCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('audit-setting-drift');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error('[audit-setting-drift] fatal:', err);
    process.exit(1);
  });
}
