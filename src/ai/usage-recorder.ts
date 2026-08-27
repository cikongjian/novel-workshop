import { randomUUID } from 'node:crypto';
import type { ModelPricing } from '../cost/cost-types.js';
import { DEFAULT_PRICING, calculateCost, findPricing, loadPricingTable } from '../cost/pricing.js';
import { createLogger } from '../utils/logger.js';
import { getAiUsageContext } from './usage-context.js';
import { isRegisteredAiUsageOperation } from './usage-operation-registry.js';
import { appendAiUsageRecord } from './usage-repository.js';
import type { AiUsageKind, AiUsageRecord } from './usage-types.js';

const log = createLogger('ai-usage');

let recorderDataDir = '';
let pricingCache: ModelPricing[] = DEFAULT_PRICING;
let pricingLoadedForDir = '';

const warnedOperationKeys = new Set<string>();

function roundCost(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

async function getPricingTable(): Promise<ModelPricing[]> {
  if (!recorderDataDir) return pricingCache;
  if (pricingLoadedForDir === recorderDataDir) return pricingCache;

  pricingCache = await loadPricingTable(recorderDataDir);
  pricingLoadedForDir = recorderDataDir;
  return pricingCache;
}

async function calculateUsageCost(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}): Promise<{ inputCost: number; outputCost: number; totalCost: number }> {
  const pricing = findPricing(await getPricingTable(), params.provider, params.model);
  if (!pricing) {
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  if (pricing.pricingMode === 'requests') {
    const singleRequest = calculateCost(pricing, 0, 0);
    const multiplier = Math.max(1, params.requestCount);
    return {
      inputCost: roundCost(singleRequest.inputCost * multiplier),
      outputCost: roundCost(singleRequest.outputCost * multiplier),
      totalCost: roundCost(singleRequest.totalCost * multiplier),
    };
  }

  return calculateCost(pricing, params.inputTokens, params.outputTokens);
}

function warnIfUnregistered(operationKey: string, requestPath: string): void {
  const warnKey = `${operationKey}:${requestPath}`;
  if (warnedOperationKeys.has(warnKey)) return;

  warnedOperationKeys.add(warnKey);
  log.warn('Detected AI call without registered operation mapping', {
    operationKey,
    requestPath,
  });
}

export function configureAiUsageRecorder(dataDir: string): void {
  recorderDataDir = dataDir;
}

export async function recordAiUsage(params: {
  usageKind: AiUsageKind;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  requestCount?: number;
  promptChars?: number;
  outputChars?: number;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  if (!recorderDataDir) return;

  const context = getAiUsageContext();
  const inputTokens = Math.max(0, Math.round(params.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(params.outputTokens ?? 0));
  const requestCount = Math.max(1, Math.round(params.requestCount ?? 1));
  const costs = await calculateUsageCost({
    provider: params.provider,
    model: params.model,
    inputTokens,
    outputTokens,
    requestCount,
  });
  const operationKey = context?.operationKey || 'system.unscoped';
  const operationLabel = context?.operationLabel || 'Unscoped system AI call';
  const operationRegistered = context?.operationRegistered ?? isRegisteredAiUsageOperation(operationKey);

  if (!operationRegistered) {
    warnIfUnregistered(operationKey, context?.requestPath ?? '');
  }

  const record: AiUsageRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    scope: context?.scope ?? 'system',
    operationKey,
    operationLabel,
    operationRegistered,
    requestPath: context?.requestPath ?? '',
    requestMethod: context?.requestMethod ?? '',
    userId: context?.userId ?? '',
    username: context?.username ?? '',
    userRole: context?.userRole ?? '',
    novelId: context?.novelId ?? '',
    chapterNumber: context?.chapterNumber ?? null,
    agentRole: context?.agentRole ?? '',
    usageKind: params.usageKind,
    provider: params.provider,
    model: params.model,
    requestCount,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputCost: roundCost(costs.inputCost),
    outputCost: roundCost(costs.outputCost),
    totalCost: roundCost(costs.totalCost),
    promptChars: Math.max(0, Math.round(params.promptChars ?? 0)),
    outputChars: Math.max(0, Math.round(params.outputChars ?? 0)),
    metadata: params.metadata ?? {},
  };

  await appendAiUsageRecord(recorderDataDir, record);
}
