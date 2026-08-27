/**
 * 结构化 Reader 输出解析器
 *
 * 解析 Reader Agent 的结构化 JSON 输出，提取维度评分。
 * 解析失败时安全降级为 null（使用旧版 Reader 输出）。
 */

import { createLogger } from '../utils/logger.js';
import type { AuditDimensionId, AuditDimensionResult } from './audit-dimension-types.js';
import { AUDIT_DIMENSIONS } from './audit-dimension-types.js';

const log = createLogger('audit-report-builder');

// ==================== 结构化 Reader 输出类型 ====================

/** Reader Agent 扩展 JSON 输出格式 */
type StructuredReaderOutput = {
  overallScore: number;
  pacing?: string;
  engagement?: string;
  characterization?: string;
  emotion?: string;
  prose?: string;
  /** 扩展：维度评分 */
  dimensions?: Record<string, {
    score: number;
    findings?: string[];
  }>;
  issues?: string[];
  highlights?: string[];
  suggestions?: string[];
};

// ==================== 解析函数 ====================

/**
 * 从 Reader Agent 的 JSON 输出中解析结构化维度评分。
 *
 * @param readerJson - Reader Agent 输出的原始文本（应为 JSON）
 * @returns 维度结果数组，解析失败时返回 null
 */
export function parseStructuredReaderOutput(
  readerJson: string,
): AuditDimensionResult[] | null {
  try {
    // 尝试提取 JSON（可能被 markdown 代码块包裹）
    const jsonStr = extractJsonFromText(readerJson);
    if (!jsonStr) return null;

    const parsed: StructuredReaderOutput = JSON.parse(jsonStr);

    // 必须有 dimensions 字段才视为结构化输出
    if (!parsed.dimensions || typeof parsed.dimensions !== 'object') {
      return null;
    }

    const results: AuditDimensionResult[] = [];

    for (const dim of AUDIT_DIMENSIONS) {
      const entry = parsed.dimensions[dim.id];
      if (!entry || typeof entry.score !== 'number') continue;

      const score = Math.max(0, Math.min(10, entry.score));
      results.push({
        dimensionId: dim.id as AuditDimensionId,
        score,
        findings: Array.isArray(entry.findings) ? entry.findings : [],
        passed: score >= dim.passThreshold,
      });
    }

    // 至少需要 3 个维度才有意义
    if (results.length < 3) {
      log.debug('结构化输出维度不足', { count: results.length });
      return null;
    }

    // 补充传统 5 字段到对应维度
    const fallbackMappings: Array<[string, AuditDimensionId]> = [
      ['pacing', 'pacing_rhythm'],
      ['characterization', 'character_consistency'],
      ['emotion', 'emotional_authenticity'],
      ['prose', 'prose_quality'],
    ];

    for (const [field, dimId] of fallbackMappings) {
      const fallbackText = (parsed as Record<string, unknown>)[field];
      if (!results.find(r => r.dimensionId === dimId) && typeof fallbackText === 'string') {
        // 如果维度结果中没有该维度但传统字段有文本，使用 overallScore 作为默认分数
        const dim = AUDIT_DIMENSIONS.find(d => d.id === dimId);
        if (dim) {
          results.push({
            dimensionId: dimId,
            score: parsed.overallScore,
            findings: [fallbackText],
            passed: parsed.overallScore >= dim.passThreshold,
          });
        }
      }
    }

    return results;
  } catch (err) {
    log.debug('解析结构化 Reader 输出失败', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ==================== 辅助函数 ====================

/**
 * 从可能包含 markdown 代码块的文本中提取 JSON。
 */
function extractJsonFromText(text: string): string | null {
  // 尝试直接解析
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;

  // 尝试从 ```json ... ``` 中提取
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // 尝试找到第一个 { 和最后一个 }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}
