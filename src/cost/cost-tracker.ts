import type { AgentCostRecord, ChapterCostSummary, CostOperationSummary, CostOperationType, ModelPricing } from './cost-types.js';
import { calculateCost, findPricing, DEFAULT_PRICING } from './pricing.js';

export class CostTracker {
  private records: Map<string, AgentCostRecord[]> = new Map();
  private pricingTable: ModelPricing[];

  constructor(pricingTable?: ModelPricing[]) {
    this.pricingTable = pricingTable ?? DEFAULT_PRICING;
  }

  recordAgentCall(params: {
    novelId: string;
    chapterNumber: number;
    agentRole: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  }): AgentCostRecord {
    const pricing = findPricing(this.pricingTable, params.provider, params.model);
    const costs = pricing
      ? calculateCost(pricing, params.inputTokens, params.outputTokens)
      : { inputCost: 0, outputCost: 0, totalCost: 0 };

    const record: AgentCostRecord = {
      agentRole: params.agentRole,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      inputCost: costs.inputCost,
      outputCost: costs.outputCost,
      totalCost: costs.totalCost,
      latencyMs: params.latencyMs,
      timestamp: new Date().toISOString(),
    };

    const key = `${params.novelId}:${params.chapterNumber}`;
    const list = this.records.get(key) ?? [];
    list.push(record);
    this.records.set(key, list);

    return record;
  }

  finalizeChapter(
    novelId: string,
    chapterNumber: number,
    options: {
      operationType?: CostOperationType;
      operationLabel?: string;
      generatedAt?: string;
    } = {},
  ): ChapterCostSummary {
    const key = `${novelId}:${chapterNumber}`;
    const agentCosts = this.records.get(key) ?? [];
    const generatedAt = options.generatedAt ?? new Date().toISOString();

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    for (const r of agentCosts) {
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
      totalCost += r.totalCost;
    }

    const operation: CostOperationSummary = {
      operationType: options.operationType ?? 'generate',
      operationLabel: options.operationLabel ?? '',
      agentCosts: [...agentCosts],
      totalInputTokens,
      totalOutputTokens,
      totalCost: Math.round(totalCost * 1e8) / 1e8,
      generatedAt,
    };

    const summary: ChapterCostSummary = {
      chapterNumber,
      operations: [operation],
      agentCosts: [...agentCosts],
      totalInputTokens,
      totalOutputTokens,
      totalCost: Math.round(totalCost * 1e8) / 1e8,
      generatedAt,
    };

    // Clear records for this chapter after finalizing
    this.records.delete(key);

    return summary;
  }

  getCurrentChapterRecords(novelId: string, chapterNumber: number): AgentCostRecord[] {
    const key = `${novelId}:${chapterNumber}`;
    return [...(this.records.get(key) ?? [])];
  }
}
