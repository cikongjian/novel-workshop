import { z } from 'zod';

export const ModelPricing = z.object({
  provider: z.string(),
  model: z.string(),
  pricingMode: z.enum(['tokens', 'requests']).default('tokens'),
  inputPricePer1M: z.number().nonnegative(),
  outputPricePer1M: z.number().nonnegative(),
  requestPrice: z.number().nonnegative().optional(),
  requestUnit: z.string().optional(),
  currency: z.string().default('USD'),
});
export type ModelPricing = z.infer<typeof ModelPricing>;

export const CostOperationType = z.string().min(1);
export type CostOperationType = z.infer<typeof CostOperationType>;

export const AgentCostRecord = z.object({
  agentRole: z.string(),
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  inputCost: z.number().nonnegative(),
  outputCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type AgentCostRecord = z.infer<typeof AgentCostRecord>;

export const CostOperationSummary = z.object({
  operationType: CostOperationType,
  operationLabel: z.string().default(''),
  agentCosts: z.array(AgentCostRecord).default([]),
  totalInputTokens: z.number().int().nonnegative().default(0),
  totalOutputTokens: z.number().int().nonnegative().default(0),
  totalCost: z.number().nonnegative().default(0),
  generatedAt: z.string().datetime(),
});
export type CostOperationSummary = z.infer<typeof CostOperationSummary>;

export const ChapterCostSummary = z.object({
  chapterNumber: z.number().int().positive(),
  operations: z.array(CostOperationSummary).default([]),
  agentCosts: z.array(AgentCostRecord).default([]),
  totalInputTokens: z.number().int().nonnegative().default(0),
  totalOutputTokens: z.number().int().nonnegative().default(0),
  totalCost: z.number().nonnegative().default(0),
  generatedAt: z.string().datetime(),
});
export type ChapterCostSummary = z.infer<typeof ChapterCostSummary>;

export const NovelCostData = z.object({
  novelId: z.string().uuid(),
  chapters: z.array(ChapterCostSummary).default([]),
  totalCost: z.number().nonnegative().default(0),
  totalInputTokens: z.number().int().nonnegative().default(0),
  totalOutputTokens: z.number().int().nonnegative().default(0),
  lastUpdated: z.string().datetime(),
});
export type NovelCostData = z.infer<typeof NovelCostData>;
