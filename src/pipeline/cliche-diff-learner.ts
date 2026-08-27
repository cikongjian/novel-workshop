/**
 * 套路化模式 diff 学习器 — 从 Writer 初稿 vs Editor 润色稿的差异中学习套路化表达
 *
 * 核心思路：如果 Editor 把"沉默了几秒"改成"嘴角抿了一下"，
 * 说明"沉默了几秒"是套路化表达，应该被标记。
 *
 * 工作流程：
 * 1. 章节生成后，对比 Writer 初稿与 Editor 润色稿
 * 2. 按句子提取初稿中存在但润色稿中消失的 3-8 字短语
 * 3. 用 isExpressivePhrase 过滤，只保留表达性短语
 * 4. 用 findCluster 归类到语义簇
 * 5. 累计 hitCount，达到阈值（3 次）升级为"确认套路"
 * 6. 持久化到小说级 + 全局级学习库
 *
 * 纯规则实现，零 LLM 成本。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createLogger } from '../utils/logger.js';
import { isExpressivePhrase, isContentWord } from './content-word-filter.js';
import { findCluster } from './pattern-semantic-cluster.js';
import { resolveNovelStorageDir, normalizeNovelDataRoot } from '../novel/data-root.js';

const log = createLogger('cliche-diff-learner');

// ==================== 类型 ====================

export type DiffLearningResult = {
  /** 本次新学到的模式 */
  learnedPatterns: string[];
  /** 本次升级为"确认套路"的模式 */
  promotedPatterns: string[];
  /** 累计已学习模式总数 */
  totalLearned: number;
};

type LearnedClicheEntry = {
  text: string;
  cluster: string | null;
  hitCount: number;
  lastSeenChapter: number;
  examples: string[];
};

type LearnedClicheStore = {
  patterns: Record<string, LearnedClicheEntry>;
  updatedAt: string;
};

// ==================== 常量 ====================

const STORE_FILENAME = 'cliche-learned.json';
const GLOBAL_STORE_FILENAME = 'cliche-learned-global.json';
const GLOBAL_DIR = '_global';

const MIN_NGRAM_LENGTH = 3;
const MAX_NGRAM_LENGTH = 8;
const PROMOTION_THRESHOLD = 3;
const MAX_STORED_PATTERNS = 200;
const MAX_EXAMPLES_PER_PATTERN = 3;
const MIN_SENTENCE_LENGTH = 10;

/** 句子分割正则：按中文句末标点和换行切分 */
const SENTENCE_SPLIT_REGEX = /[。！？；\n]+/;

/** n-gram 中不应包含的字符（标点、空白、数字等） */
const NGRAM_INVALID_CHAR = /[，。！？!?；;：:、""''「」『』（）()【】《》\-—…\.\,\s\d]/;

// ==================== 句子与 n-gram 提取 ====================

function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(SENTENCE_SPLIT_REGEX)
    .map(s => s.replace(/\s+/g, '').trim())
    .filter(s => s.length >= MIN_SENTENCE_LENGTH);
}

/**
 * 从单个句子中提取 3-8 字的 CJK n-gram。
 * 返回 Map<phrase, exampleSentence>，便于记录上下文示例。
 */
function extractSentenceNgrams(sentence: string): Map<string, string> {
  const result = new Map<string, string>();
  const clean = sentence.replace(/\s+/g, '');
  for (let len = MIN_NGRAM_LENGTH; len <= MAX_NGRAM_LENGTH; len++) {
    for (let i = 0; i <= clean.length - len; i++) {
      const gram = clean.slice(i, i + len);
      if (NGRAM_INVALID_CHAR.test(gram)) continue;
      const cjkCount = (gram.match(/[\u4e00-\u9fff]/g) || []).length;
      if (cjkCount < gram.length * 0.7) continue;
      if (!result.has(gram)) result.set(gram, sentence);
    }
  }
  return result;
}

/**
 * 提取初稿中存在但润色稿中消失的表达性短语。
 * 逐句提取初稿 n-gram，与润色稿全体 n-gram 集合比对，
 * 只保留被 Editor 删除/替换且属于表达性的短语。
 */
function extractRemovedClichePhrases(
  draft: string,
  polished: string,
): Array<{ phrase: string; example: string }> {
  if (!draft || !polished || draft.length < 50 || polished.length < 50) return [];

  const draftSentences = splitSentences(draft);
  if (draftSentences.length === 0) return [];

  // 收集润色稿所有句子的 n-gram，用于判断短语是否被删除
  const polishedNgrams = new Set<string>();
  for (const sentence of splitSentences(polished)) {
    for (const phrase of extractSentenceNgrams(sentence).keys()) {
      polishedNgrams.add(phrase);
    }
  }

  const results: Array<{ phrase: string; example: string }> = [];
  const seen = new Set<string>();

  for (const sentence of draftSentences) {
    for (const [phrase, example] of extractSentenceNgrams(sentence)) {
      if (seen.has(phrase)) continue;
      // 短语必须在初稿中存在但在润色稿中消失
      if (polishedNgrams.has(phrase)) continue;
      // 过滤功能性/专有名词，只保留表达性短语
      if (isContentWord(phrase)) continue;
      if (!isExpressivePhrase(phrase)) continue;
      seen.add(phrase);
      results.push({ phrase, example });
    }
  }

  return results;
}

// ==================== 持久化（同步 API） ====================

function createEmptyStore(): LearnedClicheStore {
  return { patterns: {}, updatedAt: new Date().toISOString() };
}

function loadStore(filePath: string): LearnedClicheStore {
  try {
    if (!existsSync(filePath)) return createEmptyStore();
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as LearnedClicheStore;
    if (!parsed.patterns || typeof parsed.patterns !== 'object') {
      return createEmptyStore();
    }
    return parsed;
  } catch (err) {
    log.warn(`加载套路学习库失败，创建新库: ${filePath}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
    return createEmptyStore();
  }
}

function saveStore(filePath: string, store: LearnedClicheStore): void {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    store.updatedAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    log.warn(`保存套路学习库失败: ${filePath}`, {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

function getNovelStorePath(novelsDir: string, novelId: string): string {
  return join(resolveNovelStorageDir(novelsDir, novelId), STORE_FILENAME);
}

function getGlobalStorePath(novelsDir: string): string {
  // normalizeNovelDataRoot 兼容 novelsDir 传 novels 目录或其父目录两种约定
  return join(normalizeNovelDataRoot(novelsDir), 'novels', GLOBAL_DIR, GLOBAL_STORE_FILENAME);
}

// ==================== 累计与升级 ====================

/**
 * 将本次提取的短语合并到 store 中。
 * 返回本次新学到的短语和本次升级（hitCount 跨过阈值）的短语。
 */
function mergePhrasesIntoStore(
  store: LearnedClicheStore,
  phrases: Array<{ phrase: string; example: string }>,
  chapterNumber: number,
): { learned: string[]; promoted: string[] } {
  const learned: string[] = [];
  const promoted: string[] = [];

  for (const { phrase, example } of phrases) {
    const existing = store.patterns[phrase];
    if (existing) {
      const wasPromoted = existing.hitCount >= PROMOTION_THRESHOLD;
      existing.hitCount += 1;
      existing.lastSeenChapter = chapterNumber;
      if (
        existing.examples.length < MAX_EXAMPLES_PER_PATTERN &&
        !existing.examples.includes(example)
      ) {
        existing.examples.push(example);
      }
      // 本次首次跨过升级阈值
      if (!wasPromoted && existing.hitCount >= PROMOTION_THRESHOLD) {
        promoted.push(phrase);
      }
    } else {
      store.patterns[phrase] = {
        text: phrase,
        cluster: findCluster(phrase),
        hitCount: 1,
        lastSeenChapter: chapterNumber,
        examples: [example],
      };
      learned.push(phrase);
    }
  }

  // 保留最多 MAX_STORED_PATTERNS 个模式，按 hitCount 降序裁剪
  const entries = Object.entries(store.patterns);
  if (entries.length > MAX_STORED_PATTERNS) {
    entries.sort((a, b) => b[1].hitCount - a[1].hitCount);
    store.patterns = Object.fromEntries(entries.slice(0, MAX_STORED_PATTERNS));
  }

  return { learned, promoted };
}

// ==================== 公开 API ====================

/**
 * 从 Writer 初稿和 Editor 润色稿中提取套路化模式。
 *
 * 在章节管线完成后调用，将 Editor 修掉的初稿短语累计到学习库，
 * 达到阈值的模式升级为"确认套路"。同时更新全局聚合库。
 */
export function learnFromEditorDiff(params: {
  novelId: string;
  novelsDir: string;
  chapterNumber: number;
  draftText: string;
  polishedText: string;
}): DiffLearningResult {
  const { novelId, novelsDir, chapterNumber, draftText, polishedText } = params;

  // 1. 提取被 Editor 删除的表达性短语
  const removed = extractRemovedClichePhrases(draftText, polishedText);
  if (removed.length === 0) {
    return { learnedPatterns: [], promotedPatterns: [], totalLearned: 0 };
  }

  // 2. 更新小说级 store
  const novelStorePath = getNovelStorePath(novelsDir, novelId);
  const novelStore = loadStore(novelStorePath);
  const novelResult = mergePhrasesIntoStore(novelStore, removed, chapterNumber);
  saveStore(novelStorePath, novelStore);

  // 3. 更新全局 store（hitCount 为所有小说累计总和）
  const globalStorePath = getGlobalStorePath(novelsDir);
  const globalStore = loadStore(globalStorePath);
  mergePhrasesIntoStore(globalStore, removed, chapterNumber);
  saveStore(globalStorePath, globalStore);

  const totalLearned = Object.keys(novelStore.patterns).length;

  if (novelResult.learned.length > 0 || novelResult.promoted.length > 0) {
    log.info('套路化模式学习完成', {
      novelId,
      chapter: chapterNumber,
      extracted: removed.length,
      learned: novelResult.learned.length,
      promoted: novelResult.promoted.length,
      total: totalLearned,
    });
  }

  return {
    learnedPatterns: novelResult.learned,
    promotedPatterns: novelResult.promoted,
    totalLearned,
  };
}

/**
 * 加载小说级已学习的套路化模式。
 * 返回 hitCount >= minHitCount 的所有模式文本。
 */
export function loadLearnedClichePatterns(params: {
  novelId: string;
  novelsDir: string;
  minHitCount?: number;
}): string[] {
  const { novelId, novelsDir, minHitCount = 1 } = params;
  const store = loadStore(getNovelStorePath(novelsDir, novelId));
  return Object.values(store.patterns)
    .filter(e => e.hitCount >= minHitCount)
    .map(e => e.text);
}

/**
 * 加载全局已学习的套路化模式（聚合所有小说）。
 * 返回 hitCount >= minHitCount 的所有模式文本。
 */
export function loadGlobalLearnedClichePatterns(
  novelsDir: string,
  minHitCount = 1,
): string[] {
  const store = loadStore(getGlobalStorePath(novelsDir));
  return Object.values(store.patterns)
    .filter(e => e.hitCount >= minHitCount)
    .map(e => e.text);
}
