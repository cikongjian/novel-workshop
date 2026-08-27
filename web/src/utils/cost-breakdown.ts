import type { AgentCostRecord } from '../types';

export type CostRecordSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  recordCount: number;
};

export function isDeepSeekCostRecord(record: AgentCostRecord): boolean {
  const provider = String(record.provider ?? '').toLowerCase();
  const model = String(record.model ?? '').toLowerCase();
  return provider.includes('deepseek') || model.includes('deepseek');
}

export function summarizeCostRecords(
  records: AgentCostRecord[],
  predicate?: (record: AgentCostRecord) => boolean,
): CostRecordSummary {
  return records.reduce<CostRecordSummary>((summary, record) => {
    if (predicate && !predicate(record)) return summary;

    const inputTokens = Math.max(0, record.inputTokens || 0);
    const outputTokens = Math.max(0, record.outputTokens || 0);
    const totalCost = Math.max(0, record.totalCost || 0);

    summary.inputTokens += inputTokens;
    summary.outputTokens += outputTokens;
    summary.totalTokens += inputTokens + outputTokens;
    summary.totalCost += totalCost;
    summary.recordCount += 1;
    return summary;
  }, {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    recordCount: 0,
  });
}
