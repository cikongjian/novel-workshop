import type {
  AgentCostRecord,
  ChapterCostSummary,
  CostOperationSummary,
  CostOperationType,
  NovelCostData,
} from './cost-types.js';

function roundCost(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function mergeAgentCostLists(agentCosts: AgentCostRecord[]): AgentCostRecord[] {
  const merged = new Map<string, AgentCostRecord>();

  for (const record of agentCosts) {
    const key = [
      record.agentRole,
      record.provider,
      record.model,
    ].join('::');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...record });
      continue;
    }

    merged.set(key, {
      ...existing,
      inputTokens: existing.inputTokens + record.inputTokens,
      outputTokens: existing.outputTokens + record.outputTokens,
      inputCost: roundCost(existing.inputCost + record.inputCost),
      outputCost: roundCost(existing.outputCost + record.outputCost),
      totalCost: roundCost(existing.totalCost + record.totalCost),
      latencyMs: existing.latencyMs + record.latencyMs,
      timestamp: existing.timestamp >= record.timestamp ? existing.timestamp : record.timestamp,
    });
  }

  return [...merged.values()].sort((a, b) => b.totalCost - a.totalCost);
}

function summarizeOperations(
  chapterNumber: number,
  operations: CostOperationSummary[],
): ChapterCostSummary {
  const normalizedOperations = [...operations].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  const agentCosts = mergeAgentCostLists(normalizedOperations.flatMap((operation) => operation.agentCosts));
  const totalInputTokens = normalizedOperations.reduce((sum, operation) => sum + operation.totalInputTokens, 0);
  const totalOutputTokens = normalizedOperations.reduce((sum, operation) => sum + operation.totalOutputTokens, 0);
  const totalCost = roundCost(normalizedOperations.reduce((sum, operation) => sum + operation.totalCost, 0));
  const generatedAt = normalizedOperations[normalizedOperations.length - 1]?.generatedAt ?? new Date().toISOString();

  return {
    chapterNumber,
    operations: normalizedOperations,
    agentCosts,
    totalInputTokens,
    totalOutputTokens,
    totalCost,
    generatedAt,
  };
}

export function normalizeChapterCostSummary(raw: unknown): ChapterCostSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const chapterNumber = Number(input.chapterNumber);
  if (!Number.isFinite(chapterNumber) || chapterNumber < 1) return null;

  const legacyAgentCosts = Array.isArray(input.agentCosts) ? (input.agentCosts as AgentCostRecord[]) : [];
  const legacyGeneratedAt = typeof input.generatedAt === 'string' && input.generatedAt
    ? input.generatedAt
    : new Date().toISOString();
  const operations = Array.isArray(input.operations) && input.operations.length > 0
    ? (input.operations as CostOperationSummary[])
    : [{
        operationType: 'generate' satisfies CostOperationType,
        operationLabel: '',
        agentCosts: legacyAgentCosts,
        totalInputTokens: Number(input.totalInputTokens) || 0,
        totalOutputTokens: Number(input.totalOutputTokens) || 0,
        totalCost: Number(input.totalCost) || 0,
        generatedAt: legacyGeneratedAt,
      }];

  return summarizeOperations(chapterNumber, operations);
}

export function appendOperationCost(
  data: NovelCostData,
  chapterCost: ChapterCostSummary,
): NovelCostData {
  const chapters = data.chapters.map((chapter) => normalizeChapterCostSummary(chapter)).filter(Boolean) as ChapterCostSummary[];
  const incoming = normalizeChapterCostSummary(chapterCost);
  if (!incoming) return data;

  const chapterIndex = chapters.findIndex((chapter) => chapter.chapterNumber === incoming.chapterNumber);
  if (chapterIndex >= 0) {
    chapters[chapterIndex] = summarizeOperations(
      incoming.chapterNumber,
      [...chapters[chapterIndex].operations, ...incoming.operations],
    );
  } else {
    chapters.push(incoming);
  }

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

  return {
    novelId: data.novelId,
    chapters,
    totalCost: roundCost(chapters.reduce((sum, chapter) => sum + chapter.totalCost, 0)),
    totalInputTokens: chapters.reduce((sum, chapter) => sum + chapter.totalInputTokens, 0),
    totalOutputTokens: chapters.reduce((sum, chapter) => sum + chapter.totalOutputTokens, 0),
    lastUpdated: new Date().toISOString(),
  };
}

export function normalizeNovelCostData(raw: unknown, novelId: string): NovelCostData {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const chapters = Array.isArray(input.chapters)
    ? input.chapters.map((chapter) => normalizeChapterCostSummary(chapter)).filter(Boolean) as ChapterCostSummary[]
    : [];

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

  return {
    novelId,
    chapters,
    totalCost: roundCost(chapters.reduce((sum, chapter) => sum + chapter.totalCost, 0)),
    totalInputTokens: chapters.reduce((sum, chapter) => sum + chapter.totalInputTokens, 0),
    totalOutputTokens: chapters.reduce((sum, chapter) => sum + chapter.totalOutputTokens, 0),
    lastUpdated: typeof input.lastUpdated === 'string' && input.lastUpdated
      ? input.lastUpdated
      : new Date().toISOString(),
  };
}
