/**
 * AI 痕迹自学习模块 — 从 Writer→Editor 的 diff 中提取被反复修改的 AI 痕迹模式
 *
 * 工作流程：
 * 1. 章节生成后，对比 Writer 初稿 vs Editor 润色稿
 * 2. 提取初稿中存在但润色稿中被删除/替换的 n-gram 短语
 * 3. 累计统计每个短语被修掉的次数
 * 4. 超过阈值（默认 3 次）的短语自动升级为运行时检测模式
 * 5. 持久化到小说目录 + 全局聚合文件
 *
 * 零 LLM 成本，纯确定性文本分析。
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';

const log = createLogger('ai-trace-learner');

// ==================== 类型 ====================

type LearnedPattern = {
  /** 被修掉的短语 */
  phrase: string;
  /** 匹配的 n-gram 长度 */
  ngramLength: number;
  /** 被 Editor 修掉的总次数 */
  hitCount: number;
  /** 首次发现时间 */
  firstSeen: string;
  /** 最近一次发现时间 */
  lastSeen: string;
  /** 涉及的章节列表 */
  chapters: number[];
  /** 是否已升级为核心检测模式 */
  promotedToCore: boolean;
};

type LearnedPatternStore = {
  /** 版本号，用于未来 schema 迁移 */
  version: 1;
  /** 上次更新时间 */
  updatedAt: string;
  /** 学到的模式列表 */
  patterns: LearnedPattern[];
};

// ==================== 常量 ====================

const STORE_FILENAME = 'ai-trace-learned.json';
const GLOBAL_STORE_FILENAME = 'ai-trace-learned-global.json';

/** n-gram 提取的长度范围 */
const MIN_NGRAM_LENGTH = 3;
const MAX_NGRAM_LENGTH = 8;

/** 短语被修掉 N 次后升级为运行时检测模式 */
const PROMOTION_THRESHOLD = 3;

/** 最大学习模式数（防止无限膨胀） */
const MAX_LEARNED_PATTERNS = 200;

/** 最小段落长度（太短的段落不参与对比） */
const MIN_PARAGRAPH_LENGTH = 20;

/** 停止词：不应被学习的常见词汇 */
const STOP_PHRASES = new Set([
  '的', '了', '在', '是', '有', '和', '就', '不', '人', '都',
  '一个', '上', '也', '到', '说', '她', '他', '我', '你', '们',
  '这', '那', '什么', '没有', '可以', '自己', '已经', '因为',
  '但是', '如果', '这个', '那个', '还是', '所以', '知道',
]);

// ==================== 核心分析 ====================

/**
 * 从文本中提取 n-gram 集合
 */
function extractNgrams(text: string, minLen: number, maxLen: number): Set<string> {
  const ngrams = new Set<string>();
  // 按句分割
  const sentences = text.split(/[。！？；\n]+/).filter(s => s.trim().length >= MIN_PARAGRAPH_LENGTH);

  for (const sentence of sentences) {
    const clean = sentence.replace(/\s+/g, '').trim();
    for (let len = minLen; len <= maxLen; len++) {
      for (let i = 0; i <= clean.length - len; i++) {
        const gram = clean.slice(i, i + len);
        if (!STOP_PHRASES.has(gram)) {
          ngrams.add(gram);
        }
      }
    }
  }

  return ngrams;
}

/**
 * 对比初稿与润色稿，提取被删除的 AI 痕迹短语
 *
 * 策略：找到在初稿中出现但在润色稿中消失的 n-gram，
 * 然后过滤出"有意义"的短语（非普通叙事用语）。
 */
function extractRemovedPhrases(draft: string, polished: string): string[] {
  if (!draft || !polished || draft.length < 100 || polished.length < 100) return [];

  const draftNgrams = extractNgrams(draft, MIN_NGRAM_LENGTH, MAX_NGRAM_LENGTH);
  const polishedNgrams = extractNgrams(polished, MIN_NGRAM_LENGTH, MAX_NGRAM_LENGTH);

  // 在初稿中有但在润色稿中消失的 n-gram
  const removed: string[] = [];
  for (const gram of draftNgrams) {
    if (!polishedNgrams.has(gram)) {
      removed.push(gram);
    }
  }

  // 过滤：只保留可能是 AI 痕迹的短语（含有特定信号）
  const aiSignalPatterns = [
    // 微动作模板
    /(?:发白|发紧|一滞|一沉|一颤|一僵|泛红|骤缩|滚动|闪过|掠过)/,
    // 情感告知
    /(?:很|非常|十分|极其|无比)(?:开心|愤怒|伤心|害怕|紧张|兴奋)/,
    // 结构性短语
    /(?:显而易见|毋庸置疑|不难发现|值得注意|综上所述)/,
    // 过渡词
    /(?:然而|此外|与此同时|不仅如此|事实上|毕竟)/,
    // 套路化表达
    /(?:仿佛|不由得|不禁|下意识|不知不觉|心中暗)/,
    // 感知动词
    /(?:看到|发现|感觉到|注意到|意识到|察觉到)/,
    // 弱修饰
    /(?:缓缓|微微|默默|悄悄|静静|渐渐)/,
    // 空气/氛围套路
    /(?:空气.*(?:凝固|弥漫)|时间.*(?:静止|停滞)|沉默.*蔓延)/,
    // Markdown 残留
    /(?:\*{2,3}|~~|`|#{1,3}\s)/,
  ];

  return removed.filter(phrase => {
    // 必须匹配至少一个 AI 信号模式
    return aiSignalPatterns.some(pattern => pattern.test(phrase));
  });
}

// ==================== 持久化 ====================

function createEmptyStore(): LearnedPatternStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    patterns: [],
  };
}

async function loadStore(filePath: string): Promise<LearnedPatternStore> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as LearnedPatternStore;
    if (parsed.version === 1 && Array.isArray(parsed.patterns)) {
      return parsed;
    }
    return createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}

async function saveStore(filePath: string, store: LearnedPatternStore): Promise<void> {
  store.updatedAt = new Date().toISOString();
  // 按 hitCount 降序排序，保留 top N
  store.patterns.sort((a, b) => b.hitCount - a.hitCount);
  if (store.patterns.length > MAX_LEARNED_PATTERNS) {
    store.patterns = store.patterns.slice(0, MAX_LEARNED_PATTERNS);
  }
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * 将发现的短语合并到 store 中
 */
function mergePhrasesIntoStore(
  store: LearnedPatternStore,
  phrases: string[],
  chapterNumber: number,
): number {
  const now = new Date().toISOString();
  let newCount = 0;

  for (const phrase of phrases) {
    const existing = store.patterns.find(p => p.phrase === phrase);
    if (existing) {
      existing.hitCount += 1;
      existing.lastSeen = now;
      if (!existing.chapters.includes(chapterNumber)) {
        existing.chapters.push(chapterNumber);
      }
      // 检查是否达到升级阈值
      if (!existing.promotedToCore && existing.hitCount >= PROMOTION_THRESHOLD) {
        existing.promotedToCore = true;
        log.info(`AI 痕迹模式升级为核心检测: "${phrase}" (命中 ${existing.hitCount} 次)`);
      }
    } else {
      store.patterns.push({
        phrase,
        ngramLength: phrase.length,
        hitCount: 1,
        firstSeen: now,
        lastSeen: now,
        chapters: [chapterNumber],
        promotedToCore: false,
      });
      newCount++;
    }
  }

  return newCount;
}

function getNovelStorePath(novelsDir: string, novelId: string): string {
  return path.join(resolveNovelStorageDir(novelsDir, novelId), STORE_FILENAME);
}

// ==================== 公开 API ====================

/**
 * 从 Writer→Editor diff 中学习 AI 痕迹模式
 *
 * 在章节管线完成后调用（fire-and-forget）。
 */
export async function learnFromChapterDiff(params: {
  novelId: string;
  novelsDir: string;
  chapterNumber: number;
  /** Writer 原始初稿 */
  draft: string;
  /** Editor 润色后的正文 */
  polished: string;
}): Promise<{ newPatterns: number; totalPatterns: number; promotedCount: number }> {
  const { novelId, novelsDir, chapterNumber, draft, polished } = params;

  // 1. 提取被删除的 AI 痕迹短语
  const removedPhrases = extractRemovedPhrases(draft, polished);
  if (removedPhrases.length === 0) {
    return { newPatterns: 0, totalPatterns: 0, promotedCount: 0 };
  }

  // 去重
  const uniquePhrases = [...new Set(removedPhrases)];

  // 2. 更新小说级 store
  const novelStorePath = getNovelStorePath(novelsDir, novelId);
  const novelStore = await loadStore(novelStorePath);
  const promotedBefore = novelStore.patterns.filter(p => p.promotedToCore).length;
  const newCount = mergePhrasesIntoStore(novelStore, uniquePhrases, chapterNumber);
  const promotedAfter = novelStore.patterns.filter(p => p.promotedToCore).length;
  await saveStore(novelStorePath, novelStore);

  // 3. 更新全局 store
  const globalStorePath = path.join(novelsDir, GLOBAL_STORE_FILENAME);
  const globalStore = await loadStore(globalStorePath);
  mergePhrasesIntoStore(globalStore, uniquePhrases, chapterNumber);
  await saveStore(globalStorePath, globalStore);

  const result = {
    newPatterns: newCount,
    totalPatterns: novelStore.patterns.length,
    promotedCount: promotedAfter - promotedBefore,
  };

  if (newCount > 0 || result.promotedCount > 0) {
    log.info('AI 痕迹学习完成', {
      novelId,
      chapter: chapterNumber,
      extracted: uniquePhrases.length,
      ...result,
    });
  }

  return result;
}

/**
 * 加载已学习的运行时检测模式（仅返回已升级的模式）
 *
 * 合并小说级 + 全局级的模式，供 evaluateAiTrace() 使用。
 */
export async function loadLearnedPatterns(params: {
  novelId: string;
  novelsDir: string;
}): Promise<RegExp[]> {
  const { novelId, novelsDir } = params;

  const promotedPhrases = new Set<string>();

  // 加载小说级
  try {
    const novelStore = await loadStore(getNovelStorePath(novelsDir, novelId));
    for (const p of novelStore.patterns) {
      if (p.promotedToCore) promotedPhrases.add(p.phrase);
    }
  } catch { /* 忽略 */ }

  // 加载全局级
  try {
    const globalStore = await loadStore(path.join(novelsDir, GLOBAL_STORE_FILENAME));
    for (const p of globalStore.patterns) {
      if (p.promotedToCore) promotedPhrases.add(p.phrase);
    }
  } catch { /* 忽略 */ }

  if (promotedPhrases.size === 0) return [];

  // 将短语转为正则（转义特殊字符）
  return Array.from(promotedPhrases).map(phrase => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'g');
  });
}

