import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { getNovelsDir } from '../config/index.js';
import { NovelManager } from '../novel/novel-manager.js';
import type { Chapter } from '../novel/types.js';
import { AdaptationManager } from './adaptation-manager.js';
import { SceneCardExtractor } from './scene-card-extractor.js';
import { AudioAdapter } from './audio-adapter.js';
import { AdaptationQAGate } from './qa-gate.js';
import { AdaptationComplianceChecker } from './compliance-checker.js';

const DEFAULT_CHAPTER_TEXTS = [
  '夜色沉沉，林舟在旧码头找到一封匿名信。信上只有一句话：今晚十二点，仓库见。',
  '仓库里灯光昏黄，林舟看见失踪多年的好友。对方低声说：别相信任何人，他们已经进城了。',
  '警笛划破雨幕，林舟背着硬盘冲向天桥。身后脚步逼近，他只能把真相上传到云端。',
];

export type SmokeSampleResult = {
  sample: string;
  novelId: string;
  chapterNumberStart: number;
  chapterNumberEnd: number;
  timingsMs: {
    sceneCardRebuild: number;
    generate: number;
    createPackage: number;
    qa: number;
    publishReadyCheck: number;
  };
  sceneCardCount: number;
  packageId: string;
  qaPassed: boolean;
  qaScore: number;
  publishReady: boolean;
  blockers: string[];
  payloadPath: string;
  mixGuidePath: string;
  chapterAudioPaths: string[];
  payloadWarnings: string[];
};

export type SmokeReport = {
  recordedAt: string;
  novelId: string;
  samples: number;
  results: SmokeSampleResult[];
};

export type SmokeRunOptions = {
  samples?: number;
  novelId?: string;
};

export type SmokeCleanupOptions = {
  dryRun?: boolean;
  keep?: number;
};

export type SmokeCleanupItem = {
  novelId: string;
  title: string;
  updatedAt: string;
  removedPaths: string[];
  status: 'removed' | 'skipped';
};

export type SmokeCleanupSummary = {
  dryRun: boolean;
  keep: number;
  roots: string[];
  smokeNovelCount: number;
  removedCount: number;
  keptIds: string[];
  actions: SmokeCleanupItem[];
};

type NovelMeta = {
  id: string;
  title?: string;
  description?: string;
  updatedAt?: string;
};

type AdaptationSmokeServiceDeps = {
  novelsDir: string;
  novelManager: NovelManager;
  adaptationManager: AdaptationManager;
  sceneCardExtractor: SceneCardExtractor;
  audioAdapter: AudioAdapter;
  qaGate: AdaptationQAGate;
  complianceChecker: AdaptationComplianceChecker;
};

export class AdaptationSmokeService {
  private readonly deps: AdaptationSmokeServiceDeps;

  constructor(deps: AdaptationSmokeServiceDeps) {
    this.deps = deps;
  }

  async run(options: SmokeRunOptions = {}): Promise<SmokeReport> {
    const samples = normalizeSamples(options.samples);
    const novelId = await this.ensureSampleNovel(samples, options.novelId);
    const results: SmokeSampleResult[] = [];

    for (let idx = 0; idx < samples; idx += 1) {
      const chapterNumber = idx + 1;
      const sampleName = String.fromCharCode('A'.charCodeAt(0) + idx);

      const tScene = performance.now();
      const chapter = await this.deps.novelManager.getChapter(novelId, chapterNumber);
      if (!chapter?.content?.trim()) {
        throw new Error(`样本${sampleName}章节内容为空: chapter=${chapterNumber}`);
      }

      const characters = await this.deps.novelManager.getCharacters(novelId);
      const cards = this.deps.sceneCardExtractor.extract({
        chapterNumber,
        chapterTitle: chapter.title,
        chapterContent: chapter.content,
        characters: characters.map((char) => ({ id: char.id, name: char.name })),
      });
      await this.deps.adaptationManager.saveSceneCards(novelId, chapterNumber, cards);
      const sceneCardCost = elapsedMs(tScene);

      const tGenerate = performance.now();
      const outputDirRelative = `adaptations/audio/run-smoke-${Date.now()}-${chapterNumber}`;
      const audioResult = await this.deps.audioAdapter.generate({
        novelId,
        chapterNumberStart: chapterNumber,
        chapterNumberEnd: chapterNumber,
        outputDirRelative,
        synthesizeAudio: true,
      });
      const generateCost = elapsedMs(tGenerate);

      const payloadAbsolutePath = path.join(
        this.deps.novelsDir,
        novelId,
        path.normalize(audioResult.payloadPath),
      );
      const payloadRaw = await fs.readFile(payloadAbsolutePath, 'utf-8');
      const payload = JSON.parse(payloadRaw) as { warnings?: string[] };

      const tCreate = performance.now();
      const pack = await this.deps.adaptationManager.createPackage({
        novelId,
        chapterNumberStart: chapterNumber,
        chapterNumberEnd: chapterNumber,
        mode: 'audio',
        payloadPath: audioResult.payloadPath,
      });
      const createCost = elapsedMs(tCreate);

      const tQa = performance.now();
      const qaReport = this.deps.qaGate.evaluate({
        pack,
        sceneCardCountByChapter: { [chapterNumber]: cards.length },
      });
      const qaReportPath = await this.deps.adaptationManager.saveQAReport(novelId, pack.id, qaReport);
      const passedPack = await this.deps.adaptationManager.updatePackageStatus(novelId, pack.id, {
        status: qaReport.passed ? 'passed' : 'failed',
        qaReportPath,
      });
      const qaCost = elapsedMs(tQa);

      const tPublish = performance.now();
      const publishCheck = await this.deps.complianceChecker.check(novelId, passedPack);
      const publishCost = elapsedMs(tPublish);

      results.push({
        sample: sampleName,
        novelId,
        chapterNumberStart: chapterNumber,
        chapterNumberEnd: chapterNumber,
        timingsMs: {
          sceneCardRebuild: sceneCardCost,
          generate: generateCost,
          createPackage: createCost,
          qa: qaCost,
          publishReadyCheck: publishCost,
        },
        sceneCardCount: cards.length,
        packageId: pack.id,
        qaPassed: qaReport.passed,
        qaScore: qaReport.score,
        publishReady: publishCheck.publishReady,
        blockers: publishCheck.blockers,
        payloadPath: audioResult.payloadPath,
        mixGuidePath: audioResult.mixGuidePath,
        chapterAudioPaths: audioResult.chapterAudioPaths,
        payloadWarnings: payload.warnings ?? [],
      });
    }

    return {
      recordedAt: new Date().toISOString(),
      novelId,
      samples,
      results,
    };
  }

  async writeJsonReport(report: SmokeReport, outputPath: string): Promise<string> {
    const resolvedPath = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    return resolvedPath;
  }

  async readJsonReport(inputPath: string): Promise<SmokeReport> {
    const resolvedPath = path.resolve(inputPath);
    const raw = await fs.readFile(resolvedPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SmokeReport>;
    if (!Array.isArray(parsed.results)) {
      throw new Error('输入文件格式错误：缺少 results 数组');
    }
    if (typeof parsed.recordedAt !== 'string' || typeof parsed.novelId !== 'string') {
      throw new Error('输入文件格式错误：缺少 recordedAt 或 novelId');
    }
    return {
      recordedAt: parsed.recordedAt,
      novelId: parsed.novelId,
      samples: Number.isFinite(parsed.samples) ? Number(parsed.samples) : parsed.results.length,
      results: parsed.results as SmokeSampleResult[],
    };
  }

  renderMarkdown(report: SmokeReport): string {
    const total = report.results.length;
    const qaPassCount = report.results.filter((item) => item.qaPassed).length;
    const publishReadyCount = report.results.filter((item) => item.publishReady).length;
    const avgGenerateMs = avg(report.results.map((item) => item.timingsMs.generate));

    const lines: string[] = [];
    lines.push(`# IP改编联调自动报告（${report.recordedAt.slice(0, 10)}）`);
    lines.push('');
    lines.push('## 1. 概览');
    lines.push(`- novelId：\`${report.novelId}\``);
    lines.push(`- 样本数：\`${total}\``);
    lines.push(`- QA通过率：\`${percent(qaPassCount, total)}\`（${qaPassCount}/${total}）`);
    lines.push(`- 发布检查通过率：\`${percent(publishReadyCount, total)}\`（${publishReadyCount}/${total}）`);
    lines.push(`- 平均有声生成耗时：\`${toSecond(avgGenerateMs)}\``);
    lines.push('');

    lines.push('## 2. 样本明细');
    lines.push('| 样本 | 章节 | SceneCard | generate | QA | PublishReady | packageId |');
    lines.push('|---|---:|---:|---:|---|---|---|');
    for (const item of report.results) {
      const chapterRange = `${item.chapterNumberStart}-${item.chapterNumberEnd}`;
      lines.push(`| ${item.sample} | ${chapterRange} | ${item.sceneCardCount} | ${toSecond(item.timingsMs.generate)} | ${item.qaPassed ? `passed(${item.qaScore})` : `failed(${item.qaScore})`} | ${item.publishReady ? 'true' : 'false'} | ${item.packageId} |`);
    }
    lines.push('');

    lines.push('## 3. 产物路径');
    for (const item of report.results) {
      lines.push(`### 样本 ${item.sample}`);
      lines.push(`- payload：\`${item.payloadPath}\``);
      lines.push(`- mix guide：\`${item.mixGuidePath}\``);
      for (const audioPath of item.chapterAudioPaths) {
        lines.push(`- audio：\`${audioPath}\``);
      }
      if (item.blockers.length > 0) {
        lines.push(`- blockers：${item.blockers.join('；')}`);
      }
      if (item.payloadWarnings.length > 0) {
        lines.push(`- warnings：${item.payloadWarnings.join('；')}`);
      }
      lines.push('');
    }

    lines.push('## 4. 复跑命令');
    lines.push('- 一键联调+出报告：`npm run smoke:adaptation:full`');
    lines.push('- 仅跑联调（默认3样本）：`npm run smoke:adaptation`');
    lines.push('- 轻量联调（1样本）：`npm run smoke:adaptation -- 1 docs/adaptation-smoke-latest.json`');
    lines.push('- JSON 转报告：`npm run smoke:adaptation:report -- docs/adaptation-smoke-latest.json docs/IP多模态改编运营联调简报.md`');
    lines.push('- 清理历史联调样本（dry-run）：`npm run smoke:adaptation:clean`');
    lines.push('- 清理历史联调样本（实际删除）：`npm run smoke:adaptation:clean -- --apply --keep 1`');
    lines.push('');

    return lines.join('\n');
  }

  async writeMarkdownReport(report: SmokeReport, outputPath: string): Promise<string> {
    const resolvedPath = path.resolve(outputPath);
    const markdown = this.renderMarkdown(report);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeText(resolvedPath, `${markdown}\n`);
    return resolvedPath;
  }

  async generateMarkdownReportFromJson(inputPath: string, outputPath: string): Promise<{
    report: SmokeReport;
    outputPath: string;
  }> {
    const report = await this.readJsonReport(inputPath);
    const savedPath = await this.writeMarkdownReport(report, outputPath);
    return { report, outputPath: savedPath };
  }

  async cleanup(options: SmokeCleanupOptions = {}): Promise<SmokeCleanupSummary> {
    const dryRun = options.dryRun ?? true;
    const keep = normalizeKeep(options.keep);
    const roots = await resolveNovelRoots(this.deps.novelsDir);
    const allNovelIds = new Set<string>();

    for (const root of roots) {
      const ids = await listNovelDirs(root);
      ids.forEach((id) => allNovelIds.add(id));
    }

    const smokeMetas: NovelMeta[] = [];
    for (const novelId of allNovelIds) {
      let metaRaw: string | null = null;
      for (const root of roots) {
        const metaPath = path.join(root, novelId, 'novel.json');
        if (await pathExists(metaPath)) {
          metaRaw = await fs.readFile(metaPath, 'utf-8');
          break;
        }
      }
      if (!metaRaw) {
        continue;
      }

      try {
        const meta = JSON.parse(metaRaw) as NovelMeta;
        if (!isSmokeNovel(meta)) {
          continue;
        }
        smokeMetas.push({
          id: meta.id || novelId,
          title: meta.title ?? '',
          description: meta.description ?? '',
          updatedAt: meta.updatedAt ?? '',
        });
      } catch {
        continue;
      }
    }

    smokeMetas.sort(compareByUpdatedAtDesc);
    const keepIds = new Set(smokeMetas.slice(0, keep).map((item) => item.id));
    const toRemove = smokeMetas.filter((item) => !keepIds.has(item.id));

    const actions: SmokeCleanupItem[] = [];
    for (const item of toRemove) {
      if (dryRun) {
        actions.push({
          novelId: item.id,
          title: item.title ?? '',
          updatedAt: item.updatedAt ?? '',
          removedPaths: roots.map((root) => path.join(root, item.id)),
          status: 'skipped',
        });
        continue;
      }

      const removed = await removeNovelDirs(roots, item.id);
      actions.push({
        novelId: item.id,
        title: item.title ?? '',
        updatedAt: item.updatedAt ?? '',
        removedPaths: removed,
        status: 'removed',
      });
    }

    return {
      dryRun,
      keep,
      roots,
      smokeNovelCount: smokeMetas.length,
      removedCount: actions.length,
      keptIds: Array.from(keepIds),
      actions,
    };
  }

  private async ensureSampleNovel(sampleCount: number, preferredNovelId?: string): Promise<string> {
    if (preferredNovelId) {
      for (let i = 0; i < sampleCount; i += 1) {
        await saveSampleChapter(this.deps.novelManager, preferredNovelId, i + 1, makeChapterText(i));
      }
      return preferredNovelId;
    }

    const novel = await this.deps.novelManager.createNovel({
      title: `联调样本-${new Date().toISOString()}`,
      genre: 'mystery',
      synopsis: '用于改编链路联调的短样本',
      description: '自动创建，用于ADP-P0-010验收',
    });

    for (let i = 0; i < sampleCount; i += 1) {
      await saveSampleChapter(this.deps.novelManager, novel.id, i + 1, makeChapterText(i));
    }
    return novel.id;
  }
}

export function createAdaptationSmokeService(novelsDir = getNovelsDir()): AdaptationSmokeService {
  const novelManager = new NovelManager(novelsDir);
  const adaptationManager = new AdaptationManager(novelsDir);
  const sceneCardExtractor = new SceneCardExtractor();
  const audioAdapter = new AudioAdapter(novelManager, novelsDir);
  const qaGate = new AdaptationQAGate();
  const complianceChecker = new AdaptationComplianceChecker(novelsDir);
  return new AdaptationSmokeService({
    novelsDir,
    novelManager,
    adaptationManager,
    sceneCardExtractor,
    audioAdapter,
    qaGate,
    complianceChecker,
  });
}

function normalizeSamples(value?: number): number {
  if (!Number.isFinite(value)) {
    return 3;
  }
  const num = Number(value);
  return Math.min(10, Math.max(1, Math.floor(num)));
}

function normalizeKeep(value?: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function elapsedMs(startAt: number): number {
  return Math.round(performance.now() - startAt);
}

function makeChapterText(index: number): string {
  const preset = DEFAULT_CHAPTER_TEXTS[index];
  if (preset) return preset;
  return `联调样本章节${index + 1}：主角在追查线索时遭遇阻击，随后在限定时间内完成证据上传。`;
}

async function saveSampleChapter(
  novelManager: NovelManager,
  novelId: string,
  chapterNumber: number,
  content: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const chapter: Chapter = {
    novelId,
    chapterNumber,
    title: `联调章节${chapterNumber}`,
    content,
    wordCount: content.length,
    status: 'finalized',
    agentComments: [],
    revisionCount: 0,
    summary: '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await novelManager.saveChapter(novelId, chapter);
}

function toSecond(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function percent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

async function writeText(targetPath: string, content: string): Promise<void> {
  const normalizedPath = path.normalize(targetPath).toLowerCase();
  const docsSegment = `${path.sep}docs${path.sep}`.toLowerCase();
  const useBom = normalizedPath.endsWith('.md') && normalizedPath.includes(docsSegment);
  if (!useBom) {
    await fs.writeFile(targetPath, content, 'utf-8');
    return;
  }
  await fs.writeFile(targetPath, `\uFEFF${content}`, 'utf-8');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveNovelRoots(baseNovelsDir: string): Promise<string[]> {
  const roots = new Set<string>();
  roots.add(baseNovelsDir);
  const nested = path.join(baseNovelsDir, 'novels');
  if (await pathExists(nested)) {
    roots.add(nested);
  }
  return Array.from(roots);
}

async function listNovelDirs(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as Dirent[]);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function isSmokeNovel(meta: NovelMeta): boolean {
  const title = (meta.title ?? '').trim();
  const description = (meta.description ?? '').trim();
  return title.startsWith('联调样本-') || description.includes('自动创建，用于ADP-P0-010验收');
}

function compareByUpdatedAtDesc(a: NovelMeta, b: NovelMeta): number {
  const aTime = Date.parse(a.updatedAt ?? '');
  const bTime = Date.parse(b.updatedAt ?? '');
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
    return bTime - aTime;
  }
  if (Number.isFinite(aTime)) return -1;
  if (Number.isFinite(bTime)) return 1;
  return (b.id ?? '').localeCompare(a.id ?? '');
}

async function removeNovelDirs(roots: string[], novelId: string): Promise<string[]> {
  const removed: string[] = [];
  for (const root of roots) {
    const target = path.join(root, novelId);
    if (await pathExists(target)) {
      await fs.rm(target, { recursive: true, force: true });
      removed.push(target);
    }
  }
  return removed;
}
