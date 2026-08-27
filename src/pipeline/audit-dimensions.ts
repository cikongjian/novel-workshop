/**
 * 审计维度权重解析与报告构建
 *
 * 将类型特定权重覆盖与默认权重合并，
 * 构建标准化审计报告。
 */

import type {
  AuditDimensionId,
  AuditDimensionResult,
  AuditReport,
} from './audit-dimension-types.js';
import {
  AUDIT_DIMENSIONS,
  GENRE_DIMENSION_ADJUSTMENTS,
} from './audit-dimension-types.js';
import type { AiTraceReport } from './ai-trace-detector.js';

// ==================== 权重解析 ====================

/**
 * 解析最终维度权重：默认 → 类型调整 → 用户覆盖。
 */
function resolveAuditDimensionWeights(
  genre?: string,
  customWeights?: Partial<Record<AuditDimensionId, number>>,
): Map<AuditDimensionId, number> {
  const weights = new Map<AuditDimensionId, number>();

  // 1. 默认权重
  for (const dim of AUDIT_DIMENSIONS) {
    weights.set(dim.id, dim.defaultWeight);
  }

  // 2. 类型调整
  if (genre) {
    const adjustments = GENRE_DIMENSION_ADJUSTMENTS[genre];
    if (adjustments) {
      for (const [dimId, delta] of Object.entries(adjustments)) {
        const current = weights.get(dimId as AuditDimensionId) ?? 0;
        weights.set(dimId as AuditDimensionId, current + delta);
      }
    }
  }

  // 3. 用户覆盖（直接替换而非增量）
  if (customWeights) {
    for (const [dimId, weight] of Object.entries(customWeights)) {
      weights.set(dimId as AuditDimensionId, weight);
    }
  }

  return weights;
}

// ==================== 报告构建 ====================

/**
 * 构建完整审计报告。
 *
 * @param dimensionResults - 各维度评审结果（来自结构化 Reader 输出）
 * @param genre - 小说类型
 * @param legacyReaderScore - 旧版 Reader overallScore（保持兼容）
 * @param customWeights - 用户自定义权重覆盖
 */
export function buildAuditReport(
  dimensionResults: AuditDimensionResult[],
  genre: string,
  legacyReaderScore: number,
  customWeights?: Partial<Record<AuditDimensionId, number>>,
): AuditReport {
  const weights = resolveAuditDimensionWeights(genre, customWeights);

  let weightedSum = 0;
  let totalWeight = 0;
  let passedCount = 0;

  for (const result of dimensionResults) {
    const weight = weights.get(result.dimensionId) ?? 0;
    weightedSum += result.score * weight;
    totalWeight += weight;
    if (result.passed) passedCount++;
  }

  const weightedTotal = totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 100) / 100
    : legacyReaderScore;

  return {
    dimensions: dimensionResults,
    weightedTotal,
    legacyReaderScore,
    passedCount,
    totalCount: dimensionResults.length,
    genre,
  };
}

// ==================== AI 痕迹桥接 ====================

/**
 * 从 Phase 1 的 AiTraceReport 构建 ai_trace_score 维度结果。
 * 将 0-100 分映射到 0-10 分。
 */
export function dimensionResultFromAiTrace(
  traceReport: AiTraceReport,
): AuditDimensionResult {
  const score10 = Math.round(traceReport.score / 10 * 10) / 10;
  const dim = AUDIT_DIMENSIONS.find(d => d.id === 'ai_trace_score')!;

  const findings: string[] = [];
  for (const v of traceReport.violations) {
    if (v.severity === 'error' || v.severity === 'warn') {
      findings.push(`[${v.ruleName}] ${v.details}`);
    }
  }

  return {
    dimensionId: 'ai_trace_score',
    score: score10,
    findings,
    passed: score10 >= dim.passThreshold,
  };
}

// ==================== 维度标签查询 ====================

/** 获取维度中文标签 */
export function getDimensionLabel(id: AuditDimensionId): string {
  const dim = AUDIT_DIMENSIONS.find(d => d.id === id);
  return dim?.label ?? id;
}
