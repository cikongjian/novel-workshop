import fs from 'node:fs/promises';
import path from 'node:path';
import type { ModelPricing } from './cost-types.js';

const CNY_TO_USD_RATE = 1 / 7.2;

export const DEFAULT_PRICING: ModelPricing[] = [
  { provider: 'deepseek', model: 'deepseek-chat', pricingMode: 'tokens', inputPricePer1M: 0.27, outputPricePer1M: 1.1, currency: 'USD' },
  { provider: 'deepseek', model: 'deepseek-reasoner', pricingMode: 'tokens', inputPricePer1M: 0.55, outputPricePer1M: 2.19, currency: 'USD' },
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514', pricingMode: 'tokens', inputPricePer1M: 3, outputPricePer1M: 15, currency: 'USD' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', pricingMode: 'tokens', inputPricePer1M: 3, outputPricePer1M: 15, currency: 'USD' },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', pricingMode: 'tokens', inputPricePer1M: 0.8, outputPricePer1M: 4, currency: 'USD' },
  { provider: 'openai', model: 'gpt-4o', pricingMode: 'tokens', inputPricePer1M: 2.5, outputPricePer1M: 10, currency: 'USD' },
  { provider: 'openai', model: 'gpt-4o-mini', pricingMode: 'tokens', inputPricePer1M: 0.15, outputPricePer1M: 0.6, currency: 'USD' },
  { provider: 'openai', model: 'text-embedding-3-small', pricingMode: 'tokens', inputPricePer1M: 0.02, outputPricePer1M: 0, currency: 'USD' },
  { provider: 'openai', model: 'text-embedding-3-large', pricingMode: 'tokens', inputPricePer1M: 0.13, outputPricePer1M: 0, currency: 'USD' },
  { provider: 'qwen', model: 'qwen-max', pricingMode: 'tokens', inputPricePer1M: 2.4, outputPricePer1M: 9.6, currency: 'USD' },
  { provider: 'qwen', model: 'qwen-plus', pricingMode: 'tokens', inputPricePer1M: 0.8, outputPricePer1M: 2, currency: 'USD' },
  { provider: 'zhipu', model: 'glm-4-plus', pricingMode: 'tokens', inputPricePer1M: 0.7, outputPricePer1M: 0.7, currency: 'USD' },
  { provider: 'moonshot', model: 'moonshot-v1-auto', pricingMode: 'tokens', inputPricePer1M: 0.55, outputPricePer1M: 0.55, currency: 'USD' },
  { provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V3', pricingMode: 'tokens', inputPricePer1M: 0.27, outputPricePer1M: 1.1, currency: 'USD' },
  { provider: 'doubao', model: 'doubao-seed-1.6', pricingMode: 'tokens', inputPricePer1M: 0.3, outputPricePer1M: 0.6, currency: 'CNY' },
  { provider: 'doubao', model: 'doubao-1.5-pro', pricingMode: 'tokens', inputPricePer1M: 0.8, outputPricePer1M: 0.8, currency: 'CNY' },
  { provider: 'doubao', model: 'doubao-1.5-lite', pricingMode: 'tokens', inputPricePer1M: 0.2, outputPricePer1M: 0.2, currency: 'CNY' },
  { provider: 'doubao', model: 'ep-', pricingMode: 'tokens', inputPricePer1M: 0.3, outputPricePer1M: 0.6, currency: 'CNY' },
];

export function calculateCost(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
  if (pricing.pricingMode === 'requests') {
    const rawCost = pricing.requestPrice ?? 0;
    const normalizedCost = pricing.currency === 'CNY'
      ? rawCost * CNY_TO_USD_RATE
      : rawCost;
    const totalCost = Math.round(normalizedCost * 1e8) / 1e8;
    return {
      inputCost: totalCost,
      outputCost: 0,
      totalCost,
    };
  }

  let inputCost = (inputTokens / 1_000_000) * pricing.inputPricePer1M;
  let outputCost = (outputTokens / 1_000_000) * pricing.outputPricePer1M;

  if (pricing.currency === 'CNY') {
    inputCost *= CNY_TO_USD_RATE;
    outputCost *= CNY_TO_USD_RATE;
  }

  return {
    inputCost: Math.round(inputCost * 1e8) / 1e8,
    outputCost: Math.round(outputCost * 1e8) / 1e8,
    totalCost: Math.round((inputCost + outputCost) * 1e8) / 1e8,
  };
}

export function findPricing(
  pricingTable: ModelPricing[],
  provider: string,
  model: string,
): ModelPricing | null {
  const pLower = provider.toLowerCase();
  const mLower = model.toLowerCase();

  const exact = pricingTable.find(
    (entry) => entry.provider.toLowerCase() === pLower && entry.model.toLowerCase() === mLower,
  );
  if (exact) return exact;

  const prefix = pricingTable.find(
    (entry) => entry.provider.toLowerCase() === pLower && mLower.startsWith(entry.model.toLowerCase()),
  );
  return prefix ?? null;
}

export async function loadPricingTable(dataDir: string): Promise<ModelPricing[]> {
  const pricingPath = path.resolve(dataDir, 'pricing.json');
  const raw = await fs.readFile(pricingPath, 'utf-8').catch(() => '');
  if (!raw.trim()) return DEFAULT_PRICING;

  try {
    const parsed = JSON.parse(raw) as ModelPricing[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PRICING;
  } catch {
    return DEFAULT_PRICING;
  }
}
