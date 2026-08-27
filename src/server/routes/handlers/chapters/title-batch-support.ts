import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { Chapter, NovelMetadata } from '../../../../novel/types.js';
import {
  auditChapterTitle,
  summarizeAuditReports,
  type AuditSummary,
  type TitleAuditReport,
  type TitleAuditLevel,
} from '../../../../pipeline/title-quality-audit.js';
import { generateSmartTitle, checkGenreConsistency } from '../../../../pipeline/smart-title-generator.js';

export interface TitleBatchFixResult {
  chapterNumber: number;
  before: string;
  after: string;
  applied: boolean;
  reason: string;
  level?: TitleAuditLevel;
  qualityScore?: number;
  genreMatch?: number;
}

export interface TitleBatchFixSummary {
  audit: AuditSummary;
  results: TitleBatchFixResult[];
  applied: number;
  skipped: number;
  dryRun: boolean;
  avgQualityScore: number;
  avgGenreMatch: number;
}

export interface TitleBatchFixOptions {
  chapterNumbers?: number[];
  level?: TitleAuditLevel | 'all';
  dryRun?: boolean;
  skipEdited?: boolean;
  /** 是否强制修复 good 级别的标题（用于多样性优化） */
  forceGood?: boolean;
  /** 最小题材匹配度要求 */
  minGenreMatch?: number;
}

function shouldProcess(level: TitleAuditLevel, target: TitleAuditLevel | 'all'): boolean {
  if (target === 'all') return true;
  if (target === 'fix') return level === 'fix';
  if (target === 'improve') return level === 'fix' || level === 'improve';
  return true;
}

/**
 * 审计一本小说的所有章节标题，返回报告与汇总统计。
 */
export async function auditNovelTitles(params: {
  novelManager: NovelManager;
  novelId: string;
  chapterNumbers?: number[];
}): Promise<{ novel: NovelMetadata | null; summary: AuditSummary }> {
  const { novelManager, novelId, chapterNumbers } = params;
  const novel = await novelManager.getNovel(novelId).catch(() => null);
  const chapters = await listChapters(novelManager, novelId, chapterNumbers);

  const reports: TitleAuditReport[] = [];

  for (const chapter of chapters) {
    const recentTitles = collectRecentTitles(chapters, chapter.chapterNumber, 3);
    const report = auditChapterTitle({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title || '',
      content: chapter.content || '',
      outline: chapter.summary || '',
      recentTitles,
      genre: novel?.genre,
    });
    reports.push(report);
  }

  return { novel, summary: summarizeAuditReports(reports) };
}

/**
 * 批量修复小说章节标题。默认 dryRun=true，调用方必须显式 dryRun=false 才会写入。
 */
export async function fixNovelTitles(params: {
  novelManager: NovelManager;
  novelId: string;
  options?: TitleBatchFixOptions;
}): Promise<TitleBatchFixSummary> {
  const { novelManager, novelId, options = {} } = params;
  const { chapterNumbers, level = 'fix', dryRun = true, skipEdited = true, forceGood = false, minGenreMatch = 0 } = options;

  const novel = await novelManager.getNovel(novelId).catch(() => null);
  const chapters = await listChapters(novelManager, novelId, chapterNumbers);

  const reports: TitleAuditReport[] = [];
  const suggestedTitles: Map<number, string> = new Map();
  const qualityScores: Map<number, number> = new Map();
  const genreMatches: Map<number, number> = new Map();

  for (const chapter of chapters) {
    const recentTitles = collectRecentTitles(chapters, chapter.chapterNumber, 10);
    const allTitles = chapters
      .filter(c => c.chapterNumber < chapter.chapterNumber)
      .map(c => c.title || '')
      .filter(Boolean);

    const report = auditChapterTitle({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title || '',
      content: chapter.content || '',
      outline: chapter.summary || '',
      recentTitles,
      genre: novel?.genre,
    });
    reports.push(report);

    const newTitle = generateSmartTitle({
      content: chapter.content || '',
      outline: chapter.summary || '',
      chapterNumber: chapter.chapterNumber,
      genre: novel?.genre,
      recentTitles,
      allTitles,
    });

    suggestedTitles.set(chapter.chapterNumber, newTitle);
    genreMatches.set(chapter.chapterNumber, checkGenreConsistency(newTitle, novel?.genre || ''));

    const qualityScore = calculateQualityScore(newTitle, recentTitles, novel?.genre);
    qualityScores.set(chapter.chapterNumber, qualityScore);
  }

  const results: TitleBatchFixResult[] = [];
  let applied = 0;
  let skipped = 0;
  let totalQualityScore = 0;
  let totalGenreMatch = 0;

  for (const report of reports) {
    const chapter = chapters.find(c => c.chapterNumber === report.chapterNumber);
    if (!chapter) {
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: report.currentTitle,
        applied: false,
        reason: '章节数据缺失',
        level: report.level,
      });
      skipped += 1;
      continue;
    }

    const newTitle = suggestedTitles.get(report.chapterNumber) || report.currentTitle;
    const qualityScore = qualityScores.get(report.chapterNumber) || 0;
    const genreMatch = genreMatches.get(report.chapterNumber) || 0;
    totalQualityScore += qualityScore;
    totalGenreMatch += genreMatch;

    if (!forceGood && !shouldProcess(report.level, level)) {
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: report.currentTitle,
        applied: false,
        reason: `等级 ${report.level} 不在处理范围`,
        level: report.level,
        qualityScore,
        genreMatch,
      });
      skipped += 1;
      continue;
    }

    if (newTitle === report.currentTitle) {
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: report.currentTitle,
        applied: false,
        reason: report.level === 'good' ? '标题已达标且无更好建议' : '生成的标题与原标题相同',
        level: report.level,
        qualityScore,
        genreMatch,
      });
      skipped += 1;
      continue;
    }

    if (genreMatch < minGenreMatch) {
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: newTitle,
        applied: false,
        reason: `题材匹配度不足（${genreMatch}/${minGenreMatch}）`,
        level: report.level,
        qualityScore,
        genreMatch,
      });
      skipped += 1;
      continue;
    }

    if (skipEdited && isLikelyEditedTitle(chapter)) {
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: newTitle,
        applied: false,
        reason: '标题疑似人工编辑过，跳过覆盖',
        level: report.level,
        qualityScore,
        genreMatch,
      });
      skipped += 1;
      continue;
    }

    if (dryRun) {
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: newTitle,
        applied: false,
        reason: 'dryRun 模式，未实际写入',
        level: report.level,
        qualityScore,
        genreMatch,
      });
      continue;
    }

    try {
      const updated: Chapter = {
        ...chapter,
        title: newTitle,
        updatedAt: new Date().toISOString(),
      };
      await novelManager.saveChapter(novelId, updated);
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: newTitle,
        applied: true,
        reason: '已写入',
        level: report.level,
        qualityScore,
        genreMatch,
      });
      applied += 1;
    } catch (err) {
      results.push({
        chapterNumber: report.chapterNumber,
        before: report.currentTitle,
        after: newTitle,
        applied: false,
        reason: `写入失败：${err instanceof Error ? err.message : String(err)}`,
        level: report.level,
        qualityScore,
        genreMatch,
      });
      skipped += 1;
    }
  }

  const avgQualityScore = reports.length > 0 ? totalQualityScore / reports.length : 0;
  const avgGenreMatch = reports.length > 0 ? totalGenreMatch / reports.length : 0;

  return {
    audit: summarizeAuditReports(reports),
    results,
    applied,
    skipped,
    dryRun,
    avgQualityScore,
    avgGenreMatch,
  };
}

function calculateQualityScore(title: string, recentTitles: string[], genre?: string): number {
  let score = 0;

  if (title.length >= 4 && title.length <= 8) score += 5;
  else if (title.length >= 3 && title.length <= 10) score += 3;

  const genreMatch = checkGenreConsistency(title, genre || '');
  if (genreMatch >= 2) score += 8;
  else if (genreMatch >= 1) score += 4;

  for (const recent of recentTitles) {
    if (title === recent) score -= 20;
    else if (title.slice(0, 2) === recent.slice(0, 2)) score -= 5;
  }

  const actionWords = ['突破', '逆袭', '反杀', '打脸', '碾压', '飞升', '证道', '渡劫'];
  if (actionWords.some(w => title.includes(w))) score += 5;

  return Math.max(0, score);
}

async function listChapters(
  novelManager: NovelManager,
  novelId: string,
  chapterNumbers?: number[],
): Promise<Chapter[]> {
  if (chapterNumbers && chapterNumbers.length > 0) {
    const chapters: Chapter[] = [];
    for (const num of chapterNumbers) {
      const ch = await novelManager.getChapter(novelId, num).catch(() => null);
      if (ch) chapters.push(ch);
    }
    chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    return chapters;
  }
  // listChapters 返回 ChapterSummary[] 不含 content，需要逐个 getChapter 取完整数据
  const summary = await novelManager.listChapters(novelId).catch(() => []);
  const chapters: Chapter[] = [];
  for (const item of summary) {
    const ch = await novelManager.getChapter(novelId, item.chapterNumber).catch(() => null);
    if (ch) chapters.push(ch);
  }
  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function collectRecentTitles(chapters: Chapter[], chapterNumber: number, limit: number): string[] {
  const titles: string[] = [];
  for (let num = chapterNumber - 1; num >= 1 && titles.length < limit; num -= 1) {
    const ch = chapters.find(c => c.chapterNumber === num);
    if (ch?.title) titles.push(ch.title);
  }
  return titles;
}

/**
 * 启发式判断标题是否疑似被人工编辑过：
 * - diagnostics 中存在 userEditedTitle / manualTitleEdited 等标记
 * - updatedAt 远晚于 createdAt 且与同书其他章节的 fallback 模式明显不同
 *
 * 此处采用保守策略：只要存在显式的人工编辑标记就跳过，避免误判。
 */
function isLikelyEditedTitle(chapter: Chapter): boolean {
  const diagnostics = chapter.diagnostics as any;
  if (!diagnostics) return false;
  if (diagnostics.userEditedTitle === true) return true;
  if (diagnostics.manualTitleEdited === true) return true;
  return false;
}
