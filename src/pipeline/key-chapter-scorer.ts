/**
 * 关键章节评分器
 *
 * 根据章节的大纲张力、情节线状态、读者评分、里程碑位置等信号
 * 综合评估章节重要性，用于智能决定是否为该章生成"作者有话说"。
 */

// ==================== 评分权重常量 ====================

/** 高张力阈值（tensionTarget >= 此值得满分） */
const HIGH_TENSION_THRESHOLD = 8;
/** 中高张力阈值 */
const MID_TENSION_THRESHOLD = 6;
/** 读者高分阈值 */
const HIGH_READER_SCORE = 8.5;
/** 关键事件多的阈值 */
const MANY_KEY_EVENTS = 3;
/** 字数异常倍数 */
const WORD_COUNT_SPIKE_RATIO = 1.5;
/** 里程碑间隔（每 N 章算一个里程碑） */
const MILESTONE_INTERVAL = 10;

/** 各信号的评分权重 */
const SCORE_WEIGHTS = {
  highTension: 20,
  midTension: 10,
  plotClimaxThread: 25,
  plotResolved: 20,
  plotNew: 10,
  manyKeyEvents: 15,
  highReaderScore: 10,
  milestone: 10,
  wordCountSpike: 5,
} as const;

// ==================== 类型定义 ====================

export type ChapterKeyType =
  | 'climax'
  | 'resolution'
  | 'turning_point'
  | 'revelation'
  | 'setup'
  | 'normal';

export interface ChapterImportanceResult {
  /** 综合评分 0-100 */
  score: number;
  /** 章节分类标签 */
  keyType: ChapterKeyType;
  /** 人类可读的评分信号列表 */
  signals: string[];
}

export interface ChapterScoringInput {
  /** 大纲中的张力目标 (0-10) */
  tensionTarget?: number;
  /** 大纲中的关键事件列表 */
  keyEvents?: string[];
  /** 读者评分 (0-10) */
  readerScore?: number;
  /** 该章的情节线快照状态列表：'new' | 'advanced' | 'mentioned' | 'dormant' | 'resolved' */
  snapshotStatuses?: string[];
  /** 小说级情节线中是否有处于 'climax' 状态且关联到本章的 */
  hasClimaxThread?: boolean;
  /** 章节号 */
  chapterNumber: number;
  /** 当前总章数 */
  totalChapters: number;
  /** 本章字数 */
  wordCount?: number;
  /** 全书平均章节字数 */
  avgWordCount?: number;
}

/** 默认关键章节阈值 */
export const KEY_CHAPTER_THRESHOLD = 30;

// ==================== 核心评分函数 ====================

export function scoreChapterImportance(
  input: ChapterScoringInput,
): ChapterImportanceResult {
  let score = 0;
  const signals: string[] = [];

  const {
    tensionTarget,
    keyEvents,
    readerScore,
    snapshotStatuses = [],
    hasClimaxThread = false,
    chapterNumber,
    totalChapters,
    wordCount,
    avgWordCount,
  } = input;

  // 1. 张力评分
  if (tensionTarget != null) {
    if (tensionTarget >= HIGH_TENSION_THRESHOLD) {
      score += SCORE_WEIGHTS.highTension;
      signals.push(`高张力(${tensionTarget})`);
    } else if (tensionTarget >= MID_TENSION_THRESHOLD) {
      score += SCORE_WEIGHTS.midTension;
      signals.push(`中高张力(${tensionTarget})`);
    }
  }

  // 2. 情节线高潮（小说级线程处于 climax 状态）
  if (hasClimaxThread) {
    score += SCORE_WEIGHTS.plotClimaxThread;
    signals.push('情节线高潮');
  }

  // 3. 情节线快照状态
  if (snapshotStatuses.includes('resolved')) {
    score += SCORE_WEIGHTS.plotResolved;
    signals.push('情节线收束');
  }
  if (snapshotStatuses.includes('new')) {
    score += SCORE_WEIGHTS.plotNew;
    signals.push('新情节线开启');
  }

  // 4. 关键事件数量
  if (keyEvents && keyEvents.length >= MANY_KEY_EVENTS) {
    score += SCORE_WEIGHTS.manyKeyEvents;
    signals.push(`关键事件(${keyEvents.length})`);
  }

  // 5. 读者高分
  if (readerScore != null && readerScore >= HIGH_READER_SCORE) {
    score += SCORE_WEIGHTS.highReaderScore;
    signals.push(`读者高分(${readerScore})`);
  }

  // 6. 里程碑章节
  const isMilestone =
    chapterNumber === 1 ||
    chapterNumber === totalChapters ||
    chapterNumber % MILESTONE_INTERVAL === 0;
  if (isMilestone) {
    score += SCORE_WEIGHTS.milestone;
    signals.push(`里程碑章节(第${chapterNumber}章)`);
  }

  // 7. 字数异常高
  if (
    wordCount != null &&
    avgWordCount != null &&
    avgWordCount > 0 &&
    wordCount > avgWordCount * WORD_COUNT_SPIKE_RATIO
  ) {
    score += SCORE_WEIGHTS.wordCountSpike;
    signals.push(`长篇章节(${wordCount}字)`);
  }

  // 封顶 100
  score = Math.min(score, 100);

  // 分类
  const keyType = classifyChapter(score, {
    hasClimaxThread,
    hasResolved: snapshotStatuses.includes('resolved'),
    hasNew: snapshotStatuses.includes('new'),
    highTension: (tensionTarget ?? 0) >= HIGH_TENSION_THRESHOLD,
  });

  return { score, keyType, signals };
}

// ==================== 分类辅助 ====================

function classifyChapter(
  score: number,
  flags: {
    hasClimaxThread: boolean;
    hasResolved: boolean;
    hasNew: boolean;
    highTension: boolean;
  },
): ChapterKeyType {
  if (score >= 60 && flags.hasClimaxThread) return 'climax';
  if (score >= 50 && flags.hasResolved) return 'resolution';
  if (score >= 40 && flags.hasNew) return 'setup';
  if (score >= 40 && flags.highTension) return 'turning_point';
  if (score >= 30) return 'revelation';
  return 'normal';
}
