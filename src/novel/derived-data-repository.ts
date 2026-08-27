import fs from 'node:fs/promises';
import path from 'node:path';
import { now } from '../utils/text.js';
import {
  ChapterFact,
  ChapterPacing,
  type PlotThreadSnapshot,
  type OutlineDeviation,
} from './types.js';
import type { NovelPaths } from './novel-paths.js';
import type { CollaborationEntry } from '../pipeline/collaboration-log.js';
import type { StyleDNA } from '../style/style-types.js';
import { FactGraph as FactGraphSchema } from './fact-graph-types.js';
import type { FactGraph } from './fact-graph-types.js';
import type { PlotBranchTree } from './plot-branch-types.js';
import type { NovelCostData, ChapterCostSummary } from '../cost/cost-types.js';
import { appendOperationCost, normalizeNovelCostData } from '../cost/cost-summary.js';
import { readJson, writeJson } from './fs-helpers.js';

// ==================== QuoteCleanupFeedback ====================

export type QuoteCleanupFeedback = {
  ignoredQuoteTexts: string[];
  updatedAt: string;
};

export async function getQuoteCleanupFeedback(
  paths: NovelPaths,
  novelId: string,
): Promise<QuoteCleanupFeedback> {
  const raw = await readJson<Record<string, unknown> | null>(
    paths.quoteCleanupFeedbackPath(novelId),
    null,
  );

  const ignoredRaw = Array.isArray(raw?.ignoredQuoteTexts) ? raw.ignoredQuoteTexts : [];
  const ignoredQuoteTexts = Array.from(new Set(
    ignoredRaw
      .map(item => String(item ?? '').trim())
      .filter(Boolean),
  )).slice(0, 2000);

  return {
    ignoredQuoteTexts,
    updatedAt: typeof raw?.updatedAt === 'string' && raw.updatedAt
      ? raw.updatedAt
      : now(),
  };
}

export async function saveQuoteCleanupFeedback(
  paths: NovelPaths,
  novelId: string,
  feedback: QuoteCleanupFeedback,
): Promise<void> {
  const ignoredQuoteTexts = Array.from(new Set(
    feedback.ignoredQuoteTexts
      .map(item => String(item ?? '').trim())
      .filter(Boolean),
  )).slice(0, 2000);

  await writeJson(paths.quoteCleanupFeedbackPath(novelId), {
    ignoredQuoteTexts,
    updatedAt: feedback.updatedAt || now(),
  });
}

export async function addIgnoredQuoteTexts(
  paths: NovelPaths,
  novelId: string,
  quoteTexts: string[],
): Promise<QuoteCleanupFeedback> {
  const incoming = Array.from(new Set(
    quoteTexts
      .map(item => String(item ?? '').trim())
      .filter(Boolean),
  ));
  if (incoming.length === 0) {
    return getQuoteCleanupFeedback(paths, novelId);
  }

  const current = await getQuoteCleanupFeedback(paths, novelId);
  const merged = Array.from(new Set([
    ...current.ignoredQuoteTexts,
    ...incoming,
  ])).slice(0, 2000);

  const next: QuoteCleanupFeedback = {
    ignoredQuoteTexts: merged,
    updatedAt: now(),
  };
  await saveQuoteCleanupFeedback(paths, novelId, next);
  return next;
}

// ==================== 章节事实快照 ====================

/**
 * 获取所有章节事实（先读拆分目录，回退到旧版单文件）
 */
export async function getChapterFacts(
  paths: NovelPaths,
  novelId: string,
): Promise<Record<number, ChapterFact>> {
  const dir = paths.chapterFactsDir(novelId);
  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    if (jsonFiles.length > 0) {
      const result: Record<number, ChapterFact> = {};
      const BATCH = 50;
      for (let i = 0; i < jsonFiles.length; i += BATCH) {
        const batch = jsonFiles.slice(i, i + BATCH);
        const entries = await Promise.all(
          batch.map(async f => {
            const num = parseInt(f, 10);
            if (isNaN(num)) return null;
            try {
              const raw = await fs.readFile(path.join(dir, f), 'utf-8');
              return { num, fact: ChapterFact.parse(JSON.parse(raw)) };
            } catch { return null; }
          }),
        );
        for (const e of entries) {
          if (e) result[e.num] = e.fact;
        }
      }
      return result;
    }
  } catch { /* dir doesn't exist yet */ }
  // Fallback: legacy single file
  return readJson<Record<number, ChapterFact>>(paths.chapterFactsLegacyPath(novelId), {});
}

/**
 * 获取单章事实（O(1) 读取，不加载全部）
 */
export async function getChapterFact(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
): Promise<ChapterFact | null> {
  try {
    const raw = await fs.readFile(paths.chapterFactFilePath(novelId, chapterNumber), 'utf-8');
    return ChapterFact.parse(JSON.parse(raw));
  } catch {
    // Fallback: try legacy single file
    const all = await readJson<Record<number, ChapterFact>>(paths.chapterFactsLegacyPath(novelId), {});
    return all[chapterNumber] ?? null;
  }
}

/**
 * 保存单章事实（直接写单文件，不读全量）
 */
export async function saveChapterFact(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
  fact: ChapterFact,
): Promise<void> {
  const dir = paths.chapterFactsDir(novelId);
  await fs.mkdir(dir, { recursive: true });
  await writeJson(paths.chapterFactFilePath(novelId, chapterNumber), ChapterFact.parse(fact));
}

// ==================== 节奏分析 ====================

export async function getPacing(
  paths: NovelPaths,
  novelId: string,
): Promise<ChapterPacing[]> {
  return readJson<ChapterPacing[]>(paths.pacingPath(novelId), []);
}

export async function savePacing(
  paths: NovelPaths,
  novelId: string,
  pacing: ChapterPacing[],
): Promise<void> {
  await writeJson(paths.pacingPath(novelId), pacing);
}

// ==================== 情节线追踪快照 ====================

export async function getPlotThreadSnapshots(
  paths: NovelPaths,
  novelId: string,
): Promise<PlotThreadSnapshot[]> {
  return readJson<PlotThreadSnapshot[]>(paths.plotThreadSnapshotsPath(novelId), []);
}

export async function savePlotThreadSnapshots(
  paths: NovelPaths,
  novelId: string,
  snapshots: PlotThreadSnapshot[],
): Promise<void> {
  const existing = await getPlotThreadSnapshots(paths, novelId);
  // 按 threadId + chapterNumber 去重，新数据覆盖旧数据
  const key = (s: PlotThreadSnapshot) => `${s.threadId}:${s.chapterNumber}`;
  const map = new Map(existing.map((s) => [key(s), s]));
  for (const s of snapshots) {
    map.set(key(s), s);
  }
  const merged = [...map.values()].sort((a, b) => a.chapterNumber - b.chapterNumber);
  await writeJson(paths.plotThreadSnapshotsPath(novelId), merged);
}

// ==================== 大纲偏离度 ====================

export async function getOutlineDeviations(
  paths: NovelPaths,
  novelId: string,
): Promise<OutlineDeviation[]> {
  return readJson<OutlineDeviation[]>(paths.outlineDeviationsPath(novelId), []);
}

export async function saveOutlineDeviation(
  paths: NovelPaths,
  novelId: string,
  deviation: OutlineDeviation,
): Promise<void> {
  const existing = await getOutlineDeviations(paths, novelId);
  const idx = existing.findIndex((d) => d.chapterNumber === deviation.chapterNumber);
  if (idx >= 0) {
    existing[idx] = deviation;
  } else {
    existing.push(deviation);
  }
  existing.sort((a, b) => a.chapterNumber - b.chapterNumber);
  await writeJson(paths.outlineDeviationsPath(novelId), existing);
}

// ==================== 协作日志 ====================

export async function getCollaborationLogs(
  paths: NovelPaths,
  novelId: string,
): Promise<Record<number, CollaborationEntry[]>> {
  return readJson<Record<number, CollaborationEntry[]>>(paths.collaborationLogPath(novelId), {});
}

export async function saveCollaborationLog(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
  entries: CollaborationEntry[],
): Promise<void> {
  const all = await getCollaborationLogs(paths, novelId);
  all[chapterNumber] = entries;
  await writeJson(paths.collaborationLogPath(novelId), all);
}

// ==================== 风格 DNA ====================

export async function getStyleDna(
  paths: NovelPaths,
  novelId: string,
): Promise<StyleDNA | null> {
  return readJson<StyleDNA | null>(paths.styleDnaPath(novelId), null);
}

export async function saveStyleDna(
  paths: NovelPaths,
  novelId: string,
  dna: StyleDNA,
): Promise<void> {
  await writeJson(paths.styleDnaPath(novelId), dna);
}

export async function deleteStyleDna(
  paths: NovelPaths,
  novelId: string,
): Promise<void> {
  await fs.unlink(paths.styleDnaPath(novelId)).catch(() => {});
}

// ==================== 事实图谱 ====================

export async function getFactGraph(
  paths: NovelPaths,
  novelId: string,
): Promise<FactGraph> {
  const fallback: FactGraph = {
    novelId,
    lastUpdatedChapter: 0,
    characterAppearances: [],
    itemTimeline: [],
    locationVisits: [],
    timelineEvents: [],
    relationshipChanges: [],
    characterStateChanges: [],
    factEvents: [],
    updatedAt: new Date().toISOString(),
  };
  const raw = await readJson<FactGraph>(paths.factGraphPath(novelId), fallback);
  const parsed = FactGraphSchema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

export async function saveFactGraph(
  paths: NovelPaths,
  novelId: string,
  graph: FactGraph,
): Promise<void> {
  await writeJson(paths.factGraphPath(novelId), graph);
}

// ==================== 情节分支 ====================

export async function getPlotBranchTree(
  paths: NovelPaths,
  novelId: string,
): Promise<PlotBranchTree> {
  return readJson<PlotBranchTree>(paths.plotBranchesPath(novelId), {
    novelId,
    nodes: [],
    activePath: [],
  });
}

export async function savePlotBranchTree(
  paths: NovelPaths,
  novelId: string,
  tree: PlotBranchTree,
): Promise<void> {
  await writeJson(paths.plotBranchesPath(novelId), tree);
}

// ==================== 费用数据 ====================

export async function getCostData(
  paths: NovelPaths,
  novelId: string,
): Promise<NovelCostData> {
  const fallback: NovelCostData = {
    novelId,
    chapters: [],
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastUpdated: new Date().toISOString(),
  };
  const raw = await readJson<NovelCostData>(paths.costDataPath(novelId), fallback);
  return normalizeNovelCostData(raw, novelId);
}

export async function saveCostData(
  paths: NovelPaths,
  novelId: string,
  data: NovelCostData,
): Promise<void> {
  await writeJson(paths.costDataPath(novelId), data);
}

export async function appendChapterCost(
  paths: NovelPaths,
  novelId: string,
  chapterCost: ChapterCostSummary,
): Promise<void> {
  const data = await getCostData(paths, novelId);
  const updated = appendOperationCost(data, chapterCost);
  await saveCostData(paths, novelId, updated);
}
