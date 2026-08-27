/**
 * 章节质量度量收集与分析
 *
 * 从管线结果中提取各类度量指标，持久化存储并计算趋势。
 */

import { promises as fs } from 'fs';
import path from 'path';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import type {
  ChapterQualityMetrics,
  QualityGateScores,
  AiTraceScores,
  GateResult,
} from './quality-metrics-types.js';
import type { ChapterGenerationResult } from './types.js';
import type { AiTraceGateReport } from './ai-trace-gate.js';
import type { AuditDimensionScore } from './quality-metrics-types.js';

// ==================== 常量 ====================

const METRICS_FILENAME = 'quality-metrics.json';
function getMetricsFilePath(novelsDir: string, novelId: string): string {
  return path.join(resolveNovelStorageDir(novelsDir, novelId), METRICS_FILENAME);
}

// ==================== 度量收集 ====================

/**
 * 从管线结果中提取章节质量度量
 */
export function collectChapterMetrics(
  result: ChapterGenerationResult,
  chapterNumber: number,
  aiTraceReport?: AiTraceGateReport,
): ChapterQualityMetrics {
  // 提取质量门禁分数
  let qualityGate: QualityGateScores | undefined;
  if (result.qualityReport) {
    qualityGate = {
      overall: result.qualityReport.overallScore ?? 0,
      structure: result.qualityReport.structureScore ?? 0,
      style: result.qualityReport.styleScore ?? 0,
      emotion: result.qualityReport.emotionScore ?? 0,
    };
  }

  // 提取 Reader 评分
  let readerScore: number | undefined;
  if (result.autoRevision) {
    readerScore = result.autoRevision.finalScore;
  }

  // 提取 AI 痕迹分数
  let aiTrace: AiTraceScores | undefined;
  if (aiTraceReport) {
    aiTrace = {
      score: aiTraceReport.score,
      violations: aiTraceReport.violations.length,
      passedRules: aiTraceReport.passedRules,
      totalRules: aiTraceReport.totalRules,
    };
  }

  // 汇总门禁结果
  const gateResults: Record<string, GateResult> = {};
  if (result.qualityReport) {
    gateResults['quality'] = {
      mode: result.qualityReport.gateMode ?? 'unknown',
      passed: result.qualityReport.passed ?? true,
    };
  }
  if (result.outlineFulfillment) {
    gateResults['outline'] = {
      mode: 'active',
      passed: result.outlineFulfillment.passed ?? true,
    };
  }
  if (result.worldFulfillment) {
    gateResults['world'] = {
      mode: 'active',
      passed: result.worldFulfillment.passed ?? true,
    };
  }
  if (result.continuityReport) {
    gateResults['continuity'] = {
      mode: result.continuityReport.gateMode ?? 'unknown',
      passed: result.continuityReport.passed ?? true,
    };
  }
  if (result.powerRuleReport) {
    gateResults['powerRule'] = {
      mode: result.powerRuleReport.gateMode ?? 'unknown',
      passed: result.powerRuleReport.passed ?? true,
    };
  }
  if (aiTraceReport) {
    gateResults['aiTrace'] = {
      mode: aiTraceReport.gateMode,
      passed: aiTraceReport.passed,
    };
  }

  // 提取审计维度分数 (Phase 3)
  let auditDimensions: Record<string, AuditDimensionScore> | undefined;
  if (result.auditReport) {
    auditDimensions = {};
    const weights = new Map(
      result.auditReport.dimensions.map(d => [d.dimensionId, 1.0])
    );
    for (const dim of result.auditReport.dimensions) {
      auditDimensions[dim.dimensionId] = {
        score: dim.score,
        weight: weights.get(dim.dimensionId) ?? 1.0,
        passed: dim.passed,
      };
    }
  }

  return {
    chapterNumber,
    generatedAt: new Date().toISOString(),
    qualityGate,
    readerScore,
    aiTrace,
    auditDimensions,
    gateResults,
  };
}

// ==================== 持久化 ====================

/**
 * 保存章节度量到文件
 * 追加模式：读取现有数据 → 替换或追加当前章节 → 写回
 */
export async function saveChapterMetrics(
  novelId: string,
  metrics: ChapterQualityMetrics,
  novelsDir: string,
): Promise<void> {
  const filePath = getMetricsFilePath(novelsDir, novelId);

  let existing: ChapterQualityMetrics[] = [];
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      existing = parsed;
    }
  } catch {
    // 文件不存在或格式错误，从空数组开始
  }

  // 替换已有章节的度量，或追加新章节
  const idx = existing.findIndex(m => m.chapterNumber === metrics.chapterNumber);
  if (idx >= 0) {
    existing[idx] = metrics;
  } else {
    existing.push(metrics);
  }

  // 按章节号排序
  existing.sort((a, b) => a.chapterNumber - b.chapterNumber);

  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8');
}


