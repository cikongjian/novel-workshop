import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { PatternFrequencyDB, PatternFrequencyEntry } from './pattern-frequency-extractor.js';
import { createEmptyDB, updatePatternDB } from './pattern-frequency-extractor.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('pattern-freq-store');

const DB_FILENAME = 'pattern-freq.json';

// === 全局模式库 ===
// 单部小说达不到阈值的模式，在全局库中可能达到阈值
const GLOBAL_DB_DIR = '_global';
const GLOBAL_DB_FILENAME = 'pattern-freq-global.json';
const GLOBAL_RECENT_WINDOW = 5;
const GLOBAL_MAX_CLICHE_RETURN = 20;
const DEFAULT_CLICHE_MIN_COUNT = 5;

export type GlobalPatternDB = {
  updatedAt: string;
  totalNovels: number;
  totalChapters: number;
  novelIds: string[];
  expressiveFreq: Record<string, PatternFrequencyEntry>;
  semanticClusterFreq: Record<string, PatternFrequencyEntry>;
};

function getGlobalDBPath(novelsDir: string): string {
  return join(novelsDir, GLOBAL_DB_DIR, GLOBAL_DB_FILENAME);
}

function createEmptyGlobalDB(): GlobalPatternDB {
  return {
    updatedAt: new Date().toISOString(),
    totalNovels: 0,
    totalChapters: 0,
    novelIds: [],
    expressiveFreq: {},
    semanticClusterFreq: {},
  };
}

function getDBPath(novelsDir: string, novelId: string): string {
  return join(novelsDir, novelId, DB_FILENAME);
}

export function loadPatternDB(novelsDir: string, novelId: string): PatternFrequencyDB {
  const dbPath = getDBPath(novelsDir, novelId);
  try {
    if (!existsSync(dbPath)) {
      return createEmptyDB(novelId);
    }
    const raw = readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw) as PatternFrequencyDB;
    if (!parsed.ngramFreq) parsed.ngramFreq = {};
    if (!parsed.metaphorFreq) parsed.metaphorFreq = {};
    if (!parsed.structureFreq) parsed.structureFreq = {};
    if (!parsed.chapterSkeletons) parsed.chapterSkeletons = [];
    if (!parsed.recentEmotionBeats) parsed.recentEmotionBeats = [];
    return parsed;
  } catch (err) {
    log.warn(`加载模式频率库失败，创建新库: ${novelId}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
    return createEmptyDB(novelId);
  }
}

export function savePatternDB(novelsDir: string, db: PatternFrequencyDB): void {
  const dbPath = getDBPath(novelsDir, db.novelId);
  try {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    db.updatedAt = new Date().toISOString();
    writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    log.warn(`保存模式频率库失败: ${db.novelId}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

export function updateAndSavePatternDB(
  novelsDir: string,
  novelId: string,
  chapterIndex: number,
  content: string,
): PatternFrequencyDB {
  const db = loadPatternDB(novelsDir, novelId);
  const updated = updatePatternDB(db, chapterIndex, content);
  savePatternDB(novelsDir, updated);
  return updated;
}

export function rebuildPatternDB(
  novelsDir: string,
  novelId: string,
  chapters: Array<{ chapterNumber: number; content: string }>,
): PatternFrequencyDB {
  const db = createEmptyDB(novelId);
  for (const ch of chapters) {
    updatePatternDB(db, ch.chapterNumber, ch.content);
  }
  savePatternDB(novelsDir, db);
  log.info(`重建模式频率库: ${novelId}, 共${chapters.length}章, ${db.totalChars}字`);
  return db;
}

// === 全局模式库 API ===

export function loadGlobalPatternDB(novelsDir: string): GlobalPatternDB {
  const dbPath = getGlobalDBPath(novelsDir);
  try {
    if (!existsSync(dbPath)) {
      return createEmptyGlobalDB();
    }
    const raw = readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw) as GlobalPatternDB;
    if (!parsed.expressiveFreq) parsed.expressiveFreq = {};
    if (!parsed.semanticClusterFreq) parsed.semanticClusterFreq = {};
    if (!Array.isArray(parsed.novelIds)) parsed.novelIds = [];
    if (typeof parsed.totalNovels !== 'number') {
      parsed.totalNovels = parsed.novelIds.length;
    }
    if (typeof parsed.totalChapters !== 'number') parsed.totalChapters = 0;
    return parsed;
  } catch (err) {
    log.warn(`加载全局模式库失败，创建新库: ${novelsDir}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
    return createEmptyGlobalDB();
  }
}

export function saveGlobalPatternDB(novelsDir: string, db: GlobalPatternDB): void {
  const dbPath = getGlobalDBPath(novelsDir);
  try {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    db.updatedAt = new Date().toISOString();
    writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    log.warn(`保存全局模式库失败: ${novelsDir}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

function mergeIntoGlobalFreq(
  target: Record<string, PatternFrequencyEntry>,
  source: Map<string, number>,
  chapterIndex: number,
): void {
  for (const [text, count] of source) {
    if (count < 1) continue;
    const existing = target[text];
    if (existing) {
      existing.totalCount += count;
      existing.chapterIndices.push(chapterIndex);
      existing.lastSeenChapter = Math.max(existing.lastSeenChapter, chapterIndex);
      existing.recentCounts.push(count);
      if (existing.recentCounts.length > GLOBAL_RECENT_WINDOW) {
        existing.recentCounts.shift();
      }
    } else {
      target[text] = {
        text,
        totalCount: count,
        chapterIndices: [chapterIndex],
        lastSeenChapter: chapterIndex,
        recentCounts: [count],
      };
    }
  }
}

// 当某部小说的章节更新后，将其表达性短语和语义聚类同步到全局库
export function syncToGlobalDB(
  novelsDir: string,
  novelId: string,
  chapterIndex: number,
  expressivePatterns: Map<string, number>,
  semanticClusters: Map<string, { cluster: string; patterns: string[]; totalCount: number }>,
): void {
  const db = loadGlobalPatternDB(novelsDir);

  mergeIntoGlobalFreq(db.expressiveFreq, expressivePatterns, chapterIndex);

  const clusterFreqMap = new Map<string, number>();
  for (const [, cluster] of semanticClusters) {
    clusterFreqMap.set(
      cluster.cluster,
      (clusterFreqMap.get(cluster.cluster) || 0) + cluster.totalCount,
    );
  }
  mergeIntoGlobalFreq(db.semanticClusterFreq, clusterFreqMap, chapterIndex);

  if (!db.novelIds.includes(novelId)) {
    db.novelIds.push(novelId);
    db.totalNovels = db.novelIds.length;
  }
  db.totalChapters += 1;

  saveGlobalPatternDB(novelsDir, db);
}

// 加载全局库中的高频套路化模式，用于注入到Writer提示中
export function getGlobalClichePatterns(
  novelsDir: string,
  minCount: number = DEFAULT_CLICHE_MIN_COUNT,
): string[] {
  const db = loadGlobalPatternDB(novelsDir);
  return Object.values(db.expressiveFreq)
    .filter(e => e.totalCount >= minCount)
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, GLOBAL_MAX_CLICHE_RETURN)
    .map(e => e.text);
}
