/**
 * 作家分计算服务
 *
 * 作家分 = (笔力值×0.30 + 品质值×0.40 + 人气值×0.20 + 多元值×0.10) × 连击系数 + 爆发加分
 *
 * 数据口径：仅统计已发布到书城（publishedChapters 中 status='published'）的章节。
 */
import type { AppDb } from '../db/app-db.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { WriterStatsService } from './writer-stats-service.js';
import type { VoteService } from './vote-service.js';
import type { ForkService } from './fork-service.js';
import type { LetterService } from './letter-service.js';
import type { AdaptationManager } from '../adaptation/adaptation-manager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('writer-score');

// ==================== 等级定义 ====================

const LEVEL_THRESHOLDS: { level: number; name: string; min: number; max: number }[] = [
  { level: 0, name: '初涉文墨', min: 0, max: 99 },
  { level: 1, name: '妙笔生花', min: 100, max: 499 },
  { level: 2, name: '下笔有神', min: 500, max: 1499 },
  { level: 3, name: '文思泉涌', min: 1500, max: 4499 },
  { level: 4, name: '著作等身', min: 4500, max: 11999 },
  { level: 5, name: '独步文坛', min: 12000, max: 29999 },
  { level: 6, name: '一代文豪', min: 30000, max: 74999 },
  { level: 7, name: '文曲星君', min: 75000, max: 149999 },
  { level: 8, name: '开宗立派', min: 150000, max: Infinity },
];

// ==================== 爆发加分定义 ====================

const BURST_DEFINITIONS: { type: string; points: number; onceOnly: boolean }[] = [
  { type: 'word_milestone_10k', points: 20, onceOnly: true },
  { type: 'word_milestone_50k', points: 50, onceOnly: true },
  { type: 'word_milestone_100k', points: 100, onceOnly: true },
  { type: 'word_milestone_500k', points: 300, onceOnly: true },
  { type: 'word_milestone_1m', points: 500, onceOnly: true },
  { type: 'first_publish', points: 50, onceOnly: true },
  { type: 'first_completed', points: 100, onceOnly: true },
  { type: 'first_fork', points: 80, onceOnly: true },
];

// ==================== 类型 ====================

export interface WriterScoreDimensions {
  bili: number;
  pinzhi: number;
  renqi: number;
  duoyuan: number;
}

export interface WriterScoreResult {
  userId: string;
  score: number;
  level: number;
  levelName: string;
  dimensions: WriterScoreDimensions;
  burstScore: number;
  comboDays: number;
  comboMultiplier: number;
  calculatedAt: string;
}

// ==================== 服务 ====================

export class WriterScoreService {
  constructor(
    private readonly db: AppDb,
    private readonly novelManager: NovelManager,
    private readonly writerStatsService: WriterStatsService,
    private readonly voteService: VoteService,
    private readonly forkService: ForkService,
    private readonly letterService: LetterService,
    private readonly adaptationManager: AdaptationManager,
  ) {}

  /** 计算单个用户的作家分 */
  async calculateScore(userId: string): Promise<WriterScoreResult> {
    const dims = await this.calcDimensions(userId);
    const comboResult = this.calcCombo(userId);
    const burst = await this.calcBurstScore(userId, dims);

    const baseScore =
      dims.bili * 0.30 +
      dims.pinzhi * 0.40 +
      dims.renqi * 0.20 +
      dims.duoyuan * 0.10;

    const score = Math.round(baseScore * comboResult.multiplier + burst);

    const levelInfo = this.getLevelInfo(score);

    return {
      userId,
      score,
      level: levelInfo.level,
      levelName: levelInfo.name,
      dimensions: dims,
      burstScore: burst,
      comboDays: comboResult.days,
      comboMultiplier: comboResult.multiplier,
      calculatedAt: new Date().toISOString(),
    };
  }

  /** 获取所有用户的作家分列表 */
  async calculateAllScores(): Promise<WriterScoreResult[]> {
    const userIds = this.getAllWriterUserIds();
    return Promise.all(userIds.map((uid) => this.calculateScore(uid)));
  }

  /** 持久化到数据库 */
  saveScore(result: WriterScoreResult): void {
    try {
      const existing = this.db.prepare('SELECT level FROM writer_scores WHERE user_id = ?').get(result.userId) as { level: number } | undefined;
      const oldLevel = existing?.level ?? -1;

      this.db.prepare(`
        INSERT INTO writer_scores (user_id, score, level, dimensions_json, combo_days, combo_multiplier, burst_score, calculated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          score = excluded.score,
          level = excluded.level,
          dimensions_json = excluded.dimensions_json,
          combo_days = excluded.combo_days,
          combo_multiplier = excluded.combo_multiplier,
          burst_score = excluded.burst_score,
          calculated_at = excluded.calculated_at
      `).run(
        result.userId,
        result.score,
        result.level,
        JSON.stringify(result.dimensions),
        result.comboDays,
        result.comboMultiplier,
        result.burstScore,
        result.calculatedAt,
      );

      // 等级变更日志
      if (oldLevel >= 0 && oldLevel !== result.level) {
        const changeId = crypto.randomUUID();
        this.db.prepare(`
          INSERT INTO writer_level_changes (id, user_id, from_level, to_level, score_at_change, changed_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(changeId, result.userId, oldLevel, result.level, result.score, result.calculatedAt);
        log.info('作家等级提升', { userId: result.userId, from: oldLevel, to: result.level, score: result.score });
      }
    } catch (err) {
      log.warn('保存作家分失败', { userId: result.userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** 清空用户并重新计算（用于章节发布后更新） */
  async recalculateAndSave(userId: string): Promise<WriterScoreResult> {
    const result = await this.calculateScore(userId);
    this.saveScore(result);
    return result;
  }

  /** 获取缓存结果 */
  getCachedScore(userId: string): WriterScoreResult | null {
    try {
      const row = this.db.prepare(
        'SELECT * FROM writer_scores WHERE user_id = ?',
      ).get(userId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        userId: row.user_id as string,
        score: row.score as number,
        level: row.level as number,
        levelName: this.getLevelInfo(row.score as number).name,
        dimensions: JSON.parse(row.dimensions_json as string) as WriterScoreDimensions,
        burstScore: (row.burst_score as number) ?? 0,
        comboDays: (row.combo_days as number) ?? 0,
        comboMultiplier: (row.combo_multiplier as number) ?? 1.0,
        calculatedAt: row.calculated_at as string,
      };
    } catch {
      return null;
    }
  }

  // ==================== 私有方法 ====================

  private getLevelInfo(score: number): { level: number; name: string } {
    for (const t of LEVEL_THRESHOLDS) {
      if (score >= t.min && score <= t.max) return { level: t.level, name: t.name };
    }
    return { level: 8, name: '开宗立派' };
  }

  // ── 维度计算 ──

  private async calcDimensions(userId: string): Promise<WriterScoreDimensions> {
    return {
      bili: this.calcBili(userId),
      pinzhi: await this.calcPinzhi(userId),
      renqi: this.calcRenqi(userId),
      duoyuan: await this.calcDuoyuan(userId),
    };
  }

  // ── 笔力值 ──

  private calcBili(userId: string): number {
    const { totalWords, novelCount, chapterCount } = this.getPublishedStats(userId);
    const streak = this.writerStatsService.getStats(userId);

    const wordScore = Math.floor(totalWords / 1000);
    const novelScore = novelCount * 50;
    const chapterScore = chapterCount * 3;

    // 连击体力（取最高档）
    const s = streak.streak;
    let streakBonus = 0;
    if (s >= 100) streakBonus = 300;
    else if (s >= 30) streakBonus = 80;
    else if (s >= 7) streakBonus = 15;

    // 稳定输出
    const stableBonus = streak.thisMonthWords >= 30 * 2000 ? 50 : 0;

    return wordScore + novelScore + chapterScore + streakBonus + stableBonus;
  }

  // ── 品质值 ──

  private async calcPinzhi(userId: string): Promise<number> {
    const { readerScoreTotal, readerScoreCount, gatePassCount, gateTotalCount, aiTraceTotal, aiTraceCount, openingScoreTotal, openingScoreCount, highScoreChapterCount } = await this.getQualityStats(userId);

    // 数据不足时返回 0（冷启动，靠爆发加分补位）
    if (readerScoreCount < 3) return 0;

    const avgReader = readerScoreTotal / readerScoreCount;
    const readerScore = avgReader * 15;

    const gateRate = gateTotalCount > 0 ? gatePassCount / gateTotalCount : 0;
    const gateScore = gateRate * 250;

    const avgAiTrace = aiTraceCount > 0 ? aiTraceTotal / aiTraceCount : 0;
    const aiControlScore = Math.max(0, (1 - avgAiTrace / 10) * 80);

    const openingScore = openingScoreCount > 0 ? (openingScoreTotal / openingScoreCount) * 15 : 0;

    const highScoreBonus = highScoreChapterCount * 8;

    return Math.round(readerScore + gateScore + aiControlScore + openingScore + highScoreBonus);
  }

  // ── 人气值 ──

  private calcRenqi(userId: string): number {
    const { totalVotes, totalForks, totalComments, totalFavorites, totalLetters } = this.getEngagementStats(userId);

    const voteScore = Math.sqrt(totalVotes) * 30;
    const forkScore = totalForks * 40;
    const commentScore = Math.sqrt(totalComments) * 25;
    const favScore = Math.sqrt(totalFavorites) * 20;
    const letterScore = Math.sqrt(totalLetters) * 15;

    return Math.round(voteScore + forkScore + commentScore + favScore + letterScore);
  }

  // ── 多元值 ──

  private async calcDuoyuan(userId: string): Promise<number> {
    const novelIds = this.getUserNovelIds(userId);
    const genres = new Set<string>();

    let adaptationCount = 0;
    let interactiveRoundCount = 0;

    for (const nid of novelIds) {
      try {
        const meta = await this.novelManager.getNovel(nid);
        if (meta) {
          genres.add(meta.genre);
          const interactiveConfig = meta.interactiveConfig as { currentRound?: number } | undefined;
          if (interactiveConfig?.currentRound) {
            interactiveRoundCount += interactiveConfig.currentRound;
          }
        }
      } catch { /* ignore */ }
    }

    // 统计已发布的改编数量（改编包按文件存储，逐小说读取）
    for (const nid of novelIds) {
      try {
        const packs = await this.adaptationManager.listPackages(nid, { status: 'published' });
        adaptationCount += packs.length;
      } catch { /* ignore */ }
    }

    return genres.size * 30 + adaptationCount * 50 + interactiveRoundCount * 20;
  }

  // ── 连击 ──

  private calcCombo(userId: string): { days: number; multiplier: number } {
    const stats = this.writerStatsService.getStats(userId);
    const days = stats.streak;
    let multiplier = 1.0;
    if (days >= 100) multiplier = 1.5;
    else if (days >= 30) multiplier = 1.2;
    else if (days >= 7) multiplier = 1.1;
    return { days, multiplier };
  }

  // ── 爆发加分 ──

  private async calcBurstScore(userId: string, dims: WriterScoreDimensions): Promise<number> {
    const { totalWords, novelCount, totalForks, highScoreChapterCount } = await this.getBurstInput(userId);

    // 已触发的爆发
    const triggered = new Set<string>();
    try {
      const rows = this.db.prepare(
        'SELECT burst_type FROM writer_score_bursts WHERE user_id = ?',
      ).all(userId) as { burst_type: string }[];
      for (const r of rows) triggered.add(r.burst_type);
    } catch { /* table may not exist yet */ }

    let burst = 0;

    const checkAndAdd = (type: string, points: number, condition: boolean) => {
      if (!triggered.has(type) && condition) {
        burst += points;
        // 记录触发
        try {
          this.db.prepare(
            'INSERT OR IGNORE INTO writer_score_bursts (id, user_id, burst_type, points, triggered_at) VALUES (?, ?, ?, ?, ?)',
          ).run(crypto.randomUUID(), userId, type, points, new Date().toISOString());
        } catch { /* ignore duplicate */ }
      }
    };

    checkAndAdd('word_milestone_10k', 20, totalWords >= 10_000);
    checkAndAdd('word_milestone_50k', 50, totalWords >= 50_000);
    checkAndAdd('word_milestone_100k', 100, totalWords >= 100_000);
    checkAndAdd('word_milestone_500k', 300, totalWords >= 500_000);
    checkAndAdd('word_milestone_1m', 500, totalWords >= 1_000_000);
    checkAndAdd('first_publish', 50, novelCount >= 1);
    checkAndAdd('first_completed', 100, this.hasCompletedNovel(userId));
    checkAndAdd('first_fork', 80, totalForks >= 1);

    // 精品章加分：已触发的高分章不再重复
    const existingHighScoreCount = [...triggered].filter((t) => t.startsWith('high_score_ch_')).length;
    const newHighScoreCount = Math.max(0, highScoreChapterCount - existingHighScoreCount);
    for (let i = 0; i < newHighScoreCount; i++) {
      burst += 10;
      try {
        this.db.prepare(
          'INSERT OR IGNORE INTO writer_score_bursts (id, user_id, burst_type, points, triggered_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), userId, `high_score_ch_${existingHighScoreCount + i}`, 10, new Date().toISOString());
      } catch { /* ignore */ }
    }

    return burst;
  }

  // ==================== 数据聚合 ====================

  /** 获取已发布作品的统计（字数/作品数/章数） */
  private getPublishedStats(userId: string): { totalWords: number; novelCount: number; chapterCount: number } {
    const books = this.db.prepare(
      'SELECT id, published_chapters FROM books WHERE user_id = ?',
    ).all(userId) as { id: string; published_chapters: string }[];

    let totalWords = 0;
    let chapterCount = 0;

    for (const book of books) {
      try {
        const chapters = JSON.parse(book.published_chapters || '[]') as Array<{
          status?: string; wordCount?: number; chapterNumber?: number;
        }>;
        const published = chapters.filter((c) => c.status === 'published');
        // 同章号去重（取最新记录）
        const deduped = new Map<number, number>();
        for (const c of published) {
          if (c.chapterNumber != null && c.wordCount != null) {
            deduped.set(c.chapterNumber, c.wordCount);
          }
        }
        for (const [, wc] of deduped) {
          totalWords += wc;
          chapterCount += 1;
        }
      } catch { /* ignore malformed JSON */ }
    }

    return { totalWords, novelCount: books.length, chapterCount };
  }

  /** 获取品质相关统计 */
  private async getQualityStats(userId: string) {
    const novelIds = this.getUserNovelIds(userId);
    let readerScoreTotal = 0;
    let readerScoreCount = 0;
    let gatePassCount = 0;
    let gateTotalCount = 0;
    let aiTraceTotal = 0;
    let aiTraceCount = 0;
    let openingScoreTotal = 0;
    let openingScoreCount = 0;
    let highScoreChapterCount = 0;

    for (const nid of novelIds) {
      try {
        const chapters = await this.novelManager.listChapters(nid);
        for (const ch of chapters) {
          if (ch.readerScore != null) {
            readerScoreTotal += ch.readerScore;
            readerScoreCount++;
            if (ch.readerScore >= 9.0) highScoreChapterCount++;
          }
          // 门禁和开篇报告从 diagnostics 取
          const diag = (ch as Record<string, unknown>).diagnostics as Record<string, unknown> | undefined;
          if (diag?.startupOpeningReport) {
            const report = diag.startupOpeningReport as { overallScore?: number; passed?: boolean };
            if (report.overallScore != null) {
              openingScoreTotal += report.overallScore;
              openingScoreCount++;
            }
            if (report.passed != null) {
              gateTotalCount++;
              if (report.passed) gatePassCount++;
            }
          }
          // AI 痕迹
          const aiTrace = (ch as Record<string, unknown>).aiTraceScore as number | undefined;
          if (aiTrace != null) {
            aiTraceTotal += aiTrace;
            aiTraceCount++;
          }
        }
      } catch { /* ignore */ }
    }

    return { readerScoreTotal, readerScoreCount, gatePassCount, gateTotalCount, aiTraceTotal, aiTraceCount, openingScoreTotal, openingScoreCount, highScoreChapterCount };
  }

  /** 获取互动统计 */
  private getEngagementStats(userId: string) {
    const novelIds = this.getUserNovelIds(userId);

    // 投票：累加用户所有小说下各投票点的票数（投票按 JSON 文件存储）
    let totalVotes = 0;
    for (const nid of novelIds) {
      try {
        const votePoints = this.voteService.listVotePointsByNovel(nid);
        for (const vp of votePoints) {
          totalVotes += this.voteService.getVoteStats(vp.id).totalVotes;
        }
      } catch { /* ignore */ }
    }

    // Fork：每个原创小说被抱走的次数（forks.json）
    let totalForks = 0;
    for (const nid of novelIds) {
      try {
        totalForks += this.forkService.countByNovel(nid);
      } catch { /* ignore */ }
    }

    // 评论（books.comment_count，SQL 列存在）
    let totalComments = 0;
    try {
      const commentRows = this.db.prepare(
        `SELECT SUM(comment_count) as total FROM books WHERE user_id = ?`,
      ).get(userId) as { total: number | null } | undefined;
      totalComments = commentRows?.total ?? 0;
    } catch { /* fallback */ }

    // 收藏（books.favorite_count，SQL 列存在）
    let totalFavorites = 0;
    try {
      const favAgg = this.db.prepare(
        `SELECT SUM(favorite_count) as total FROM books WHERE user_id = ?`,
      ).get(userId) as { total: number | null } | undefined;
      totalFavorites = favAgg?.total ?? 0;
    } catch { /* fallback */ }

    // 信箱：每个小说的来信数（letters.json）
    let totalLetters = 0;
    for (const nid of novelIds) {
      try {
        totalLetters += this.letterService.listByNovel(nid).length;
      } catch { /* ignore */ }
    }

    return { totalVotes, totalForks, totalComments, totalFavorites, totalLetters };
  }

  /** 获取爆发加分所需输入 */
  private async getBurstInput(userId: string) {
    const { totalWords, novelCount } = this.getPublishedStats(userId);
    const { totalForks } = this.getEngagementStats(userId);
    const { highScoreChapterCount } = await this.getQualityStats(userId);
    return { totalWords, novelCount, totalForks, highScoreChapterCount };
  }

  private hasCompletedNovel(userId: string): boolean {
    try {
      const row = this.db.prepare(
        `SELECT COUNT(*) as cnt FROM books WHERE user_id = ? AND publish_status = 'completed'`,
      ).get(userId) as { cnt: number } | undefined;
      return (row?.cnt ?? 0) > 0;
    } catch {
      return false;
    }
  }

  private getUserNovelIds(userId: string): string[] {
    try {
      const rows = this.db.prepare(
        'SELECT novel_id FROM books WHERE user_id = ?',
      ).all(userId) as { novel_id: string }[];
      return rows.map((r) => r.novel_id);
    } catch {
      return [];
    }
  }

  /** 获取所有作家 user_id */
  private getAllWriterUserIds(): string[] {
    try {
      const rows = this.db.prepare(
        'SELECT DISTINCT user_id FROM books',
      ).all() as { user_id: string }[];
      return rows.map((r) => r.user_id);
    } catch {
      return [];
    }
  }
}
