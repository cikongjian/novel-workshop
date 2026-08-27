import type { NovelManager } from '../novel/novel-manager.js';
import type { AgentCostRecord, ChapterCostSummary, NovelCostData } from '../cost/cost-types.js';
import { readAiUsageRecords, summarizeAiUsageOperations } from './usage-repository.js';
import type { AiUsageOperationSummary, AiUsageRecord } from './usage-types.js';

export type AiUsageTotals = {
  totalRequestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastUsedAt: string | null;
};

export type AiUsageModelSummary = {
  provider: string;
  model: string;
  agentRole: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastUsedAt: string | null;
};

export type TrackedChapterUsageSummary = ChapterCostSummary & {
  totalTokens: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  requestCount: number;
  operationCount: number;
  usageOperations: AiUsageOperationSummary[];
  usageModels: AiUsageModelSummary[];
  hasLedgerData: boolean;
};

export type NovelAiUsageSummary = NovelCostData & {
  totalTokens: number;
  totalRequestCount: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  chapterCount: number;
  chapters: TrackedChapterUsageSummary[];
  usageOperations: AiUsageOperationSummary[];
  nonChapterOperations: AiUsageOperationSummary[];
};

function isDeepSeekRecord(record: Pick<AiUsageRecord, 'provider' | 'model'>): boolean {
  const provider = String(record.provider ?? '').toLowerCase();
  const model = String(record.model ?? '').toLowerCase();
  return provider.includes('deepseek') || model.includes('deepseek');
}

function pickLatest(current: string | null, next: string | null | undefined): string | null {
  if (!next) return current;
  if (!current) return next;
  return current > next ? current : next;
}

export function summarizeUsageTotals(records: AiUsageRecord[]): AiUsageTotals {
  return records.reduce<AiUsageTotals>((summary, record) => {
    summary.totalRequestCount += Math.max(1, record.requestCount ?? 1);
    summary.totalInputTokens += Math.max(0, record.inputTokens ?? 0);
    summary.totalOutputTokens += Math.max(0, record.outputTokens ?? 0);
    summary.totalTokens += Math.max(0, record.totalTokens ?? 0);
    summary.totalCost += Math.max(0, record.totalCost ?? 0);
    if (isDeepSeekRecord(record)) {
      summary.deepSeekTokens += Math.max(0, record.totalTokens ?? 0);
      summary.deepSeekCost += Math.max(0, record.totalCost ?? 0);
    }
    summary.lastUsedAt = pickLatest(summary.lastUsedAt, record.createdAt);
    return summary;
  }, {
    totalRequestCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    deepSeekTokens: 0,
    deepSeekCost: 0,
    lastUsedAt: null,
  });
}

function summarizeUsageModels(records: AiUsageRecord[]): AiUsageModelSummary[] {
  const grouped = new Map<string, AiUsageModelSummary>();

  for (const record of records) {
    const key = [
      record.agentRole || '',
      record.provider || '',
      record.model || '',
    ].join('::');

    const current = grouped.get(key) ?? {
      provider: record.provider,
      model: record.model,
      agentRole: record.agentRole || '',
      requestCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      deepSeekTokens: 0,
      deepSeekCost: 0,
      lastUsedAt: null,
    };

    current.requestCount += Math.max(1, record.requestCount ?? 1);
    current.totalInputTokens += Math.max(0, record.inputTokens ?? 0);
    current.totalOutputTokens += Math.max(0, record.outputTokens ?? 0);
    current.totalTokens += Math.max(0, record.totalTokens ?? 0);
    current.totalCost += Math.max(0, record.totalCost ?? 0);
    if (isDeepSeekRecord(record)) {
      current.deepSeekTokens += Math.max(0, record.totalTokens ?? 0);
      current.deepSeekCost += Math.max(0, record.totalCost ?? 0);
    }
    current.lastUsedAt = pickLatest(current.lastUsedAt, record.createdAt);
    grouped.set(key, current);
  }

  return [...grouped.values()].sort((a, b) => (
    b.totalCost - a.totalCost
    || b.totalTokens - a.totalTokens
    || b.requestCount - a.requestCount
    || a.agentRole.localeCompare(b.agentRole)
    || a.provider.localeCompare(b.provider)
    || a.model.localeCompare(b.model)
  ));
}

function toLegacyAgentCosts(models: AiUsageModelSummary[]): AgentCostRecord[] {
  return models
    .filter((item) => item.agentRole)
    .map((item) => ({
      agentRole: item.agentRole,
      provider: item.provider,
      model: item.model,
      inputTokens: item.totalInputTokens,
      outputTokens: item.totalOutputTokens,
      inputCost: 0,
      outputCost: 0,
      totalCost: item.totalCost,
      latencyMs: 0,
      timestamp: item.lastUsedAt ?? new Date(0).toISOString(),
    }))
    .sort((a, b) => b.totalCost - a.totalCost || b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
}

function buildTrackedChapterSummaries(records: AiUsageRecord[]): TrackedChapterUsageSummary[] {
  const grouped = new Map<number, AiUsageRecord[]>();

  for (const record of records) {
    const chapterNumber = Number(record.chapterNumber);
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) continue;

    const list = grouped.get(chapterNumber) ?? [];
    list.push(record);
    grouped.set(chapterNumber, list);
  }

  return [...grouped.entries()]
    .map(([chapterNumber, chapterRecords]) => {
      const totals = summarizeUsageTotals(chapterRecords);
      const usageOperations = summarizeAiUsageOperations(chapterRecords);
      const usageModels = summarizeUsageModels(chapterRecords);
      return {
        chapterNumber,
        operations: [],
        agentCosts: toLegacyAgentCosts(usageModels),
        totalInputTokens: totals.totalInputTokens,
        totalOutputTokens: totals.totalOutputTokens,
        totalCost: totals.totalCost,
        generatedAt: totals.lastUsedAt ?? new Date(0).toISOString(),
        totalTokens: totals.totalTokens,
        deepSeekTokens: totals.deepSeekTokens,
        deepSeekCost: totals.deepSeekCost,
        requestCount: totals.totalRequestCount,
        operationCount: usageOperations.length,
        usageOperations,
        usageModels,
        hasLedgerData: true,
      } satisfies TrackedChapterUsageSummary;
    })
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}

export async function getNovelAiUsageSummary(
  novelManager: NovelManager,
  dataDir: string,
  novelId: string,
): Promise<NovelAiUsageSummary> {
  const [legacy, allRecords] = await Promise.all([
    novelManager.getCostData(novelId),
    readAiUsageRecords(dataDir),
  ]);
  const records = allRecords.filter((record) => record.novelId === novelId);
  const chapterUsageMap = new Map(
    buildTrackedChapterSummaries(records).map((chapter) => [chapter.chapterNumber, chapter]),
  );
  const allChapterNumbers = new Set<number>([
    ...legacy.chapters.map((chapter) => chapter.chapterNumber),
    ...chapterUsageMap.keys(),
  ]);

  const chapters: TrackedChapterUsageSummary[] = [...allChapterNumbers]
    .sort((a, b) => a - b)
    .map((chapterNumber) => {
      const tracked = chapterUsageMap.get(chapterNumber);
      if (tracked) {
        return tracked;
      }

      const legacyChapter = legacy.chapters.find((chapter) => chapter.chapterNumber === chapterNumber)!;
      const legacyRecords: AiUsageRecord[] = legacyChapter.agentCosts.map((item) => ({
        id: `${novelId}-${chapterNumber}-${item.agentRole}-${item.timestamp}`,
        createdAt: item.timestamp,
        scope: 'system',
        operationKey: 'legacy.chapter-cost',
        operationLabel: '历史章节成本',
        operationRegistered: true,
        requestPath: '',
        requestMethod: '',
        userId: '',
        username: '',
        userRole: '',
        novelId,
        chapterNumber,
        agentRole: item.agentRole,
        usageKind: 'chat',
        provider: item.provider,
        model: item.model,
        requestCount: 1,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        totalTokens: item.inputTokens + item.outputTokens,
        inputCost: item.inputCost,
        outputCost: item.outputCost,
        totalCost: item.totalCost,
        promptChars: 0,
        outputChars: 0,
        metadata: {},
      }));
      const legacyTotals = summarizeUsageTotals(legacyRecords);
      const usageOperations = legacyChapter.operations?.length
        ? legacyChapter.operations.map((operation) => ({
            operationKey: operation.operationType,
            operationLabel: operation.operationLabel || operation.operationType,
            requestCount: 1,
            totalInputTokens: operation.totalInputTokens,
            totalOutputTokens: operation.totalOutputTokens,
            totalTokens: operation.totalInputTokens + operation.totalOutputTokens,
            totalCost: operation.totalCost,
            deepSeekTokens: operation.agentCosts
              .filter((item) => isDeepSeekRecord(item))
              .reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0),
            deepSeekCost: operation.agentCosts
              .filter((item) => isDeepSeekRecord(item))
              .reduce((sum, item) => sum + item.totalCost, 0),
            lastUsedAt: operation.generatedAt,
            usageKinds: ['chat' as const],
          }))
        : [];

      return {
        ...legacyChapter,
        totalTokens: legacyChapter.totalInputTokens + legacyChapter.totalOutputTokens,
        deepSeekTokens: legacyTotals.deepSeekTokens,
        deepSeekCost: legacyTotals.deepSeekCost,
        requestCount: Math.max(legacyChapter.operations?.length ?? 0, legacyChapter.agentCosts.length, 1),
        operationCount: usageOperations.length || 1,
        usageOperations,
        usageModels: summarizeUsageModels(legacyRecords),
        hasLedgerData: false,
      } satisfies TrackedChapterUsageSummary;
    });

  const usageOperations = summarizeAiUsageOperations(records);
  const nonChapterOperations = summarizeAiUsageOperations(records.filter((record) => !record.chapterNumber));
  const chapterTotals = chapters.reduce((summary, chapter) => {
    summary.totalInputTokens += Math.max(0, chapter.totalInputTokens);
    summary.totalOutputTokens += Math.max(0, chapter.totalOutputTokens);
    summary.totalTokens += Math.max(0, chapter.totalTokens ?? (chapter.totalInputTokens + chapter.totalOutputTokens));
    summary.totalCost += Math.max(0, chapter.totalCost);
    summary.deepSeekTokens += Math.max(0, chapter.deepSeekTokens ?? 0);
    summary.deepSeekCost += Math.max(0, chapter.deepSeekCost ?? 0);
    summary.totalRequestCount += Math.max(1, chapter.requestCount ?? 1);
    return summary;
  }, {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    deepSeekTokens: 0,
    deepSeekCost: 0,
    totalRequestCount: 0,
  });
  const nonChapterTotals = summarizeUsageTotals(records.filter((record) => !record.chapterNumber));
  const lastUpdated = chapters.reduce<string | null>(
    (latest, chapter) => pickLatest(latest, chapter.generatedAt),
    pickLatest(nonChapterTotals.lastUsedAt, legacy.lastUpdated),
  ) ?? legacy.lastUpdated ?? new Date(0).toISOString();

  return {
    novelId,
    chapters,
    totalCost: chapterTotals.totalCost + nonChapterTotals.totalCost,
    totalInputTokens: chapterTotals.totalInputTokens + nonChapterTotals.totalInputTokens,
    totalOutputTokens: chapterTotals.totalOutputTokens + nonChapterTotals.totalOutputTokens,
    lastUpdated,
    totalTokens: chapterTotals.totalTokens + nonChapterTotals.totalTokens,
    totalRequestCount: chapterTotals.totalRequestCount + nonChapterTotals.totalRequestCount,
    deepSeekTokens: chapterTotals.deepSeekTokens + nonChapterTotals.deepSeekTokens,
    deepSeekCost: chapterTotals.deepSeekCost + nonChapterTotals.deepSeekCost,
    chapterCount: chapters.length,
    usageOperations,
    nonChapterOperations,
  };
}
