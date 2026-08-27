/**
 * 写作习惯统计服务
 * 追踪每日字数、连续打卡天数、里程碑成就
 * 数据按用户 + 日期粒度存储
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface DailyRecord {
  date: string;       // YYYY-MM-DD
  wordCount: number;  // 当日新增字数
  novelCount: number; // 当日创作的小说数
}

interface WriterStatsStore {
  daily: Record<string, DailyRecord[]>; // userId -> daily records
  goals: Record<string, number>;        // userId -> daily word goal
}

const MILESTONES = [
  { words: 10_000, label: '初露锋芒', description: '累计创作 1 万字' },
  { words: 50_000, label: '笔耕不辍', description: '累计创作 5 万字' },
  { words: 100_000, label: '著作等身', description: '累计创作 10 万字' },
  { words: 500_000, label: '文坛巨匠', description: '累计创作 50 万字' },
  { words: 1_000_000, label: '笔下乾坤', description: '累计创作 100 万字' },
];

export interface WriterStats {
  todayWords: number;
  todayGoal: number;
  todayPercent: number;
  streak: number;
  totalWords: number;
  thisWeekWords: number;
  thisMonthWords: number;
  weeklyHeatmap: number[];      // 本周 7 天 x 24 小时热力图数据
  milestones: { label: string; description: string; achieved: boolean }[];
}

export class WriterStatsService {
  private storePath: string;

  constructor(private readonly dataDir: string) {
    this.storePath = path.join(dataDir, 'writer-stats.json');
  }

  private loadStore(): WriterStatsStore {
    try {
      if (!fs.existsSync(this.storePath)) return { daily: {}, goals: {} };
      return JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as WriterStatsStore;
    } catch {
      return { daily: {}, goals: {} };
    }
  }

  private saveStore(store: WriterStatsStore) {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  /** 记录今日新增字数 */
  recordWords(userId: string, addedWords: number, novelCount: number = 1) {
    if (addedWords <= 0) return;
    const store = this.loadStore();
    const today = new Date().toISOString().slice(0, 10);
    const userRecords = store.daily[userId] ?? [];

    const existing = userRecords.find((r) => r.date === today);
    if (existing) {
      existing.wordCount += addedWords;
      existing.novelCount = Math.max(existing.novelCount, novelCount);
    } else {
      userRecords.push({ date: today, wordCount: addedWords, novelCount });
    }

    store.daily[userId] = userRecords;
    this.saveStore(store);
  }

  /** 获取用户完整写作统计 */
  getStats(userId: string): WriterStats {
    const store = this.loadStore();
    const records = store.daily[userId] ?? [];
    const today = new Date().toISOString().slice(0, 10);

    // 今日字数
    const todayRecord = records.find((r) => r.date === today);
    const todayWords = todayRecord?.wordCount ?? 0;
    const todayGoal = store.goals[userId] ?? 2000;
    const todayPercent = todayGoal > 0 ? Math.min(100, Math.round((todayWords / todayGoal) * 100)) : 0;

    // 连续打卡天数
    let streak = 0;
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const todayDate = new Date(today);
    for (let i = 0; i < sorted.length; i++) {
      const expectedDate = new Date(todayDate);
      expectedDate.setDate(expectedDate.getDate() - i);
      const expected = expectedDate.toISOString().slice(0, 10);
      if (sorted[i]?.date === expected) {
        streak++;
      } else if (i === 0 && sorted[0]?.date !== today) {
        // 今天还没写，从昨天开始算
        const yesterday = new Date(todayDate);
        yesterday.setDate(yesterday.getDate() - 1);
        if (sorted[0]?.date === yesterday.toISOString().slice(0, 10)) {
          streak++;
          continue;
        }
        break;
      } else {
        break;
      }
    }

    // 累计字数
    const totalWords = records.reduce((sum, r) => sum + r.wordCount, 0);

    // 本周字数
    const weekStart = new Date(todayDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeekWords = records
      .filter((r) => new Date(r.date) >= weekStart)
      .reduce((sum, r) => sum + r.wordCount, 0);

    // 本月字数
    const monthStart = `${today.slice(0, 7)}-01`;
    const thisMonthWords = records
      .filter((r) => r.date >= monthStart)
      .reduce((sum, r) => sum + r.wordCount, 0);

    // 热力图（本周 7 天 x 6 时段 = 42 格, 简化为每日字数）
    const weeklyHeatmap = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      return records.find((r) => r.date === dateStr)?.wordCount ?? 0;
    });

    // 里程碑
    const milestones = MILESTONES.map((m) => ({
      ...m,
      achieved: totalWords >= m.words,
    }));

    return {
      todayWords,
      todayGoal,
      todayPercent,
      streak,
      totalWords,
      thisWeekWords,
      thisMonthWords,
      weeklyHeatmap,
      milestones,
    };
  }

  /** 设置每日字数目标 */
  setDailyGoal(userId: string, goal: number) {
    const store = this.loadStore();
    store.goals[userId] = Math.max(100, Math.min(50000, goal));
    this.saveStore(store);
  }

  /** 获取每日目标 */
  getDailyGoal(userId: string): number {
    const store = this.loadStore();
    return store.goals[userId] ?? 2000;
  }
}
