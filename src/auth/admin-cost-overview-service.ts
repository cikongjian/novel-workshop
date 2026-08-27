import type { RowDataPacket } from 'mysql2/promise';
import { readAiUsageRecords } from '../ai/usage-repository.js';
import { getNovelAiUsageSummary, summarizeUsageTotals } from '../ai/usage-summary-service.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { AuthDb, CreatorStatus } from './types.js';

type AdminCostUserRow = RowDataPacket & {
  id: string;
  username: string;
  pen_name: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  creator_status: CreatorStatus | null;
};

export type AdminCostOverviewTrendPoint = {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  operationCount: number;
  userCount: number;
  novelCount: number;
};

export type AdminCostOverviewUserItem = {
  userId: string;
  username: string;
  penName: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  novelCount: number;
  totalGeneratedWords: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastActivityAt: string | null;
};

export type AdminCostOverviewNovelItem = {
  novelId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  totalGeneratedWords: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastActivityAt: string | null;
};

export type AdminCostOverview = {
  generatedAt: string;
  totals: {
    userCount: number;
    creatorCount: number;
    activeUsers30d: number;
    novelCount: number;
    totalGeneratedWords: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    deepSeekTokens: number;
    deepSeekCost: number;
  };
  trends: AdminCostOverviewTrendPoint[];
  users: AdminCostOverviewUserItem[];
  topNovels: AdminCostOverviewNovelItem[];
};

type ServiceDeps = {
  db: AuthDb;
  novelManager: NovelManager;
  dataDir?: string;
};

type TrendAccumulator = {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  operationCount: number;
  userIds: Set<string>;
  novelIds: Set<string>;
};

function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function pickLatest(current: string | null, next: string | null | undefined): string | null {
  if (!next) return current;
  if (!current) return next;
  return current > next ? current : next;
}

function isWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return false;
  return Date.now() - value.getTime() <= days * 86_400_000;
}

function createEmptyUserItem(row: AdminCostUserRow): AdminCostOverviewUserItem {
  return {
    userId: row.id,
    username: row.username,
    penName: row.pen_name,
    role: row.role,
    status: row.status ?? 'active',
    novelCount: 0,
    totalGeneratedWords: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    deepSeekTokens: 0,
    deepSeekCost: 0,
    lastActivityAt: null,
  };
}

function rememberTrendPoint(
  trendMap: Map<string, TrendAccumulator>,
  params: {
    dateLike: string | null | undefined;
    userId?: string;
    novelId?: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    deepSeekTokens: number;
    deepSeekCost: number;
    operationCount: number;
  },
): void {
  const dateKey = toDateKey(params.dateLike);
  if (!dateKey) return;

  const item = trendMap.get(dateKey) ?? {
    date: dateKey,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    deepSeekTokens: 0,
    deepSeekCost: 0,
    operationCount: 0,
    userIds: new Set<string>(),
    novelIds: new Set<string>(),
  };

  item.totalInputTokens += Math.max(0, params.totalInputTokens);
  item.totalOutputTokens += Math.max(0, params.totalOutputTokens);
  item.totalTokens += Math.max(0, params.totalTokens);
  item.totalCost += Math.max(0, params.totalCost);
  item.deepSeekTokens += Math.max(0, params.deepSeekTokens);
  item.deepSeekCost += Math.max(0, params.deepSeekCost);
  item.operationCount += Math.max(1, params.operationCount);
  if (params.userId) item.userIds.add(params.userId);
  if (params.novelId) item.novelIds.add(params.novelId);

  trendMap.set(dateKey, item);
}

export async function getAdminCostOverview(deps: ServiceDeps): Promise<AdminCostOverview> {
  const dataDir = deps.dataDir ?? 'data';
  const [novels, userRows, allRecords] = await Promise.all([
    deps.novelManager.listNovels(),
    deps.db.execute<AdminCostUserRow[]>(
      `SELECT id, username, pen_name, role, status, creator_status
       FROM users
       ORDER BY created_at DESC`,
    ),
    readAiUsageRecords(dataDir).catch(() => []),
  ]);
  const [rows] = userRows;

  const userMap = new Map<string, AdminCostUserRow>();
  const userAggMap = new Map<string, AdminCostOverviewUserItem>();
  for (const row of rows) {
    userMap.set(row.id, row);
    userAggMap.set(row.id, createEmptyUserItem(row));
  }

  const novelSummaries = await Promise.all(
    novels.map(async (novel) => ({
      novel,
      summary: await getNovelAiUsageSummary(deps.novelManager, dataDir, novel.id),
    })),
  );

  const trendMap = new Map<string, TrendAccumulator>();
  const topNovels: AdminCostOverviewNovelItem[] = [];

  let totalGeneratedWords = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let deepSeekTokens = 0;
  let deepSeekCost = 0;

  for (const { novel, summary } of novelSummaries) {
    const ownerId = novel.ownerId ?? '';
    if (!ownerId) continue;

    const owner = userMap.get(ownerId);
    const ownerName = owner?.pen_name?.trim() || owner?.username || '未知用户';

    totalInputTokens += summary.totalInputTokens;
    totalOutputTokens += summary.totalOutputTokens;
    totalTokens += summary.totalTokens ?? (summary.totalInputTokens + summary.totalOutputTokens);
    totalCost += summary.totalCost;
    deepSeekTokens += summary.deepSeekTokens ?? 0;
    deepSeekCost += summary.deepSeekCost ?? 0;

    const chapterWordCount = (await deps.novelManager.listChapters(novel.id))
      .reduce((sum, chapter) => sum + Math.max(0, chapter.wordCount ?? 0), 0);
    totalGeneratedWords += chapterWordCount;

    const userAgg = userAggMap.get(ownerId) ?? (owner ? createEmptyUserItem(owner) : null);
    if (userAgg) {
      userAgg.novelCount += 1;
      userAgg.totalGeneratedWords += chapterWordCount;
      userAgg.totalInputTokens += summary.totalInputTokens;
      userAgg.totalOutputTokens += summary.totalOutputTokens;
      userAgg.totalTokens += summary.totalTokens ?? (summary.totalInputTokens + summary.totalOutputTokens);
      userAgg.totalCost += summary.totalCost;
      userAgg.deepSeekTokens += summary.deepSeekTokens ?? 0;
      userAgg.deepSeekCost += summary.deepSeekCost ?? 0;
      userAgg.lastActivityAt = pickLatest(userAgg.lastActivityAt, summary.lastUpdated);
      userAggMap.set(ownerId, userAgg);
    }

    topNovels.push({
      novelId: novel.id,
      title: novel.title,
      ownerId,
      ownerName,
      totalGeneratedWords: chapterWordCount,
      totalInputTokens: summary.totalInputTokens,
      totalOutputTokens: summary.totalOutputTokens,
      totalTokens: summary.totalTokens ?? (summary.totalInputTokens + summary.totalOutputTokens),
      totalCost: summary.totalCost,
      deepSeekTokens: summary.deepSeekTokens ?? 0,
      deepSeekCost: summary.deepSeekCost ?? 0,
      lastActivityAt: summary.lastUpdated,
    });

    for (const chapter of summary.chapters) {
      rememberTrendPoint(trendMap, {
        dateLike: chapter.generatedAt,
        userId: ownerId,
        novelId: novel.id,
        totalInputTokens: chapter.totalInputTokens,
        totalOutputTokens: chapter.totalOutputTokens,
        totalTokens: chapter.totalTokens ?? (chapter.totalInputTokens + chapter.totalOutputTokens),
        totalCost: chapter.totalCost,
        deepSeekTokens: chapter.deepSeekTokens ?? 0,
        deepSeekCost: chapter.deepSeekCost ?? 0,
        operationCount: chapter.operationCount ?? 1,
      });
    }

    for (const operation of summary.nonChapterOperations ?? []) {
      rememberTrendPoint(trendMap, {
        dateLike: operation.lastUsedAt,
        userId: ownerId,
        novelId: novel.id,
        totalInputTokens: operation.totalInputTokens,
        totalOutputTokens: operation.totalOutputTokens,
        totalTokens: operation.totalTokens,
        totalCost: operation.totalCost,
        deepSeekTokens: operation.deepSeekTokens,
        deepSeekCost: operation.deepSeekCost,
        operationCount: operation.requestCount,
      });
    }
  }

  const nonNovelRecords = allRecords.filter((record) => !record.novelId);
  const nonNovelTotals = summarizeUsageTotals(nonNovelRecords);
  totalInputTokens += nonNovelTotals.totalInputTokens;
  totalOutputTokens += nonNovelTotals.totalOutputTokens;
  totalTokens += nonNovelTotals.totalTokens;
  totalCost += nonNovelTotals.totalCost;
  deepSeekTokens += nonNovelTotals.deepSeekTokens;
  deepSeekCost += nonNovelTotals.deepSeekCost;

  for (const record of nonNovelRecords) {
    if (record.userId) {
      const owner = userMap.get(record.userId);
      if (owner) {
        const userAgg = userAggMap.get(record.userId) ?? createEmptyUserItem(owner);
        userAgg.totalInputTokens += Math.max(0, record.inputTokens ?? 0);
        userAgg.totalOutputTokens += Math.max(0, record.outputTokens ?? 0);
        userAgg.totalTokens += Math.max(0, record.totalTokens ?? 0);
        userAgg.totalCost += Math.max(0, record.totalCost ?? 0);
        if (String(record.provider).toLowerCase().includes('deepseek') || String(record.model).toLowerCase().includes('deepseek')) {
          userAgg.deepSeekTokens += Math.max(0, record.totalTokens ?? 0);
          userAgg.deepSeekCost += Math.max(0, record.totalCost ?? 0);
        }
        userAgg.lastActivityAt = pickLatest(userAgg.lastActivityAt, record.createdAt);
        userAggMap.set(record.userId, userAgg);
      }
    }

    rememberTrendPoint(trendMap, {
      dateLike: record.createdAt,
      userId: record.userId,
      totalInputTokens: Math.max(0, record.inputTokens ?? 0),
      totalOutputTokens: Math.max(0, record.outputTokens ?? 0),
      totalTokens: Math.max(0, record.totalTokens ?? 0),
      totalCost: Math.max(0, record.totalCost ?? 0),
      deepSeekTokens: (String(record.provider).toLowerCase().includes('deepseek') || String(record.model).toLowerCase().includes('deepseek'))
        ? Math.max(0, record.totalTokens ?? 0)
        : 0,
      deepSeekCost: (String(record.provider).toLowerCase().includes('deepseek') || String(record.model).toLowerCase().includes('deepseek'))
        ? Math.max(0, record.totalCost ?? 0)
        : 0,
      operationCount: Math.max(1, record.requestCount ?? 1),
    });
  }

  const users = [...userAggMap.values()].sort((a, b) => (
    b.totalCost - a.totalCost
    || b.totalTokens - a.totalTokens
    || b.totalGeneratedWords - a.totalGeneratedWords
    || a.username.localeCompare(b.username)
  ));
  const trends = [...trendMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((item) => ({
      date: item.date,
      totalInputTokens: item.totalInputTokens,
      totalOutputTokens: item.totalOutputTokens,
      totalTokens: item.totalTokens,
      totalCost: item.totalCost,
      deepSeekTokens: item.deepSeekTokens,
      deepSeekCost: item.deepSeekCost,
      operationCount: item.operationCount,
      userCount: item.userIds.size,
      novelCount: item.novelIds.size,
    }));
  const creatorCount = rows.filter((row) => row.role === 'admin' || row.creator_status === 'approved').length;
  const activeUsers30d = users.filter((item) => isWithinDays(item.lastActivityAt, 30)).length;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      userCount: rows.length,
      creatorCount,
      activeUsers30d,
      novelCount: novels.length,
      totalGeneratedWords,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCost,
      deepSeekTokens,
      deepSeekCost,
    },
    trends,
    users,
    topNovels: topNovels
      .sort((a, b) => (
        b.totalCost - a.totalCost
        || b.totalTokens - a.totalTokens
        || b.totalGeneratedWords - a.totalGeneratedWords
      ))
      .slice(0, 10),
  };
}
