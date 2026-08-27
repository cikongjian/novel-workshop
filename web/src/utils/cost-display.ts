export const USD_TO_CNY_RATE = 7.2;

export function convertUsdCostToCny(costUsd: number): number {
  return Math.round(costUsd * USD_TO_CNY_RATE * 1e8) / 1e8;
}

export function formatCostCny(costUsd: number, digits = 4): string {
  return `¥${convertUsdCostToCny(costUsd).toFixed(digits)}`;
}
