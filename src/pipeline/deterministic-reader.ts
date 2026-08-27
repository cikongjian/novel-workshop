/**
 * 确定性 Reader — 零 LLM 成本的章节评分合成器
 *
 * 从管线已有的门禁报告（Quality Gate, AI Trace Gate, Continuity Gate,
 * World Contract, Outline Contract 等）合成一个综合评分和结构化反馈，
 * 替代 LLM Reader Agent 在默认模式下的角色。
 *
 * 输出格式与 LLM Reader 完全兼容：JSON 格式，包含 overallScore + dimensions + issues/highlights，
 * 可被 parseReaderScore() 和 parseStructuredReaderOutput() 直接解析。
 */

import type { AiTraceGateReport } from './ai-trace-gate.js';
import type { QualityGateReport } from './quality-gate.js';
import type { ContinuityGateReport } from './continuity-gate.js';
import type { CommercialGateReport } from './commercial-gate.js';
import type { WorldContractFulfillment } from './world-contract.js';
import type { OutlineContractFulfillment } from './outline-gate.js';
import type { PowerRuleGateReport } from './power-rule-gate.js';
import type { SpeakerWhitelistReport } from './types.js';

// ==================== 类型 ====================

export type DeterministicReaderInput = {
  /** 章节正文（用于基础文本统计） */
  chapterContent: string;
  /** 各门禁报告（均为可选） */
  qualityReport?: QualityGateReport;
  aiTraceReport?: AiTraceGateReport;
  continuityReport?: ContinuityGateReport;
  commercialReport?: CommercialGateReport;
  worldFulfillment?: WorldContractFulfillment;
  outlineFulfillment?: OutlineContractFulfillment;
  powerRuleReport?: PowerRuleGateReport;
  speakerWhitelistReport?: SpeakerWhitelistReport;
};

type DimensionEntry = {
  score: number;
  findings: string[];
};

// ==================== 常量 ====================

/** 各维度在综合分中的权重 */
const DIMENSION_WEIGHTS: Record<string, number> = {
  prose_quality: 1.5,         // 文笔质量权重最高
  pacing_rhythm: 1.2,         // 节奏
  emotional_authenticity: 1.0, // 情感
  character_consistency: 1.0,  // 角色
  setting_coherence: 0.8,     // 设定
  timeline_continuity: 0.8,   // 时间线
  ai_trace_score: 1.3,        // AI 痕迹
  commercial_appeal: 0.6,     // 商业性
  hook_effectiveness: 0.8,    // 钩子
};

// ==================== 评分合成 ====================

/**
 * 将 0-100 的门禁分数映射到 0-10 的 Reader 维度分
 */
function gateScoreTo10(score: number): number {
  return Math.round(Math.max(0, Math.min(10, score / 10)) * 10) / 10;
}

/**
 * 将 boolean passed 转为基础分数
 */
function passedToScore(passed: boolean, baseScore: number = 7): number {
  return passed ? baseScore : 4;
}

/**
 * 从各门禁报告合成确定性 Reader 评分
 */
export function synthesizeDeterministicReader(input: DeterministicReaderInput): string {
  const dimensions: Record<string, DimensionEntry> = {};
  const issues: string[] = [];
  const highlights: string[] = [];

  // 1. 从 Quality Gate 提取文笔、结构、情感维度
  if (input.qualityReport) {
    const q = input.qualityReport;
    const findingMsgs = q.findings.map(f => f.message);
    dimensions['prose_quality'] = {
      score: gateScoreTo10(q.styleScore ?? 70),
      findings: findingMsgs.filter(m => /文风|用词|修辞|语言|表达/.test(m)),
    };
    dimensions['pacing_rhythm'] = {
      score: gateScoreTo10(q.structureScore ?? 70),
      findings: findingMsgs.filter(m => /节奏|结构|拖沓|仓促|冗长/.test(m)),
    };
    dimensions['emotional_authenticity'] = {
      score: gateScoreTo10(q.emotionScore ?? 70),
      findings: findingMsgs.filter(m => /情感|共鸣|张力|感染/.test(m)),
    };

    if (!q.passed) {
      issues.push(`质量门禁未通过 (${q.overallScore}分)`);
    } else {
      highlights.push(`质量门禁通过 (${q.overallScore}分)`);
    }
  }

  // 2. 从 AI Trace Gate 提取 AI 痕迹维度
  if (input.aiTraceReport) {
    const a = input.aiTraceReport;
    dimensions['ai_trace_score'] = {
      score: gateScoreTo10(a.score),
      findings: a.violations.map(v => `${v.ruleName}：${v.details}`),
    };

    if (a.violations.length > 0) {
      const errorCount = a.violations.filter(v => v.severity === 'error').length;
      if (errorCount > 0) {
        issues.push(`${errorCount} 项严重 AI 痕迹`);
      }
    } else {
      highlights.push('AI 痕迹检测全部通过');
    }
  }

  // 3. 从 Continuity Gate 提取时间线和角色一致性
  if (input.continuityReport) {
    const c = input.continuityReport;
    dimensions['timeline_continuity'] = {
      score: passedToScore(c.passed, 8),
      findings: c.findings.map(f => f.message),
    };
    dimensions['character_consistency'] = {
      score: passedToScore(c.passed, 7.5),
      findings: c.findings.filter(f => /角色|称谓|身份/.test(f.message)).map(f => f.message),
    };

    if (!c.passed) {
      issues.push(`连贯性门禁：${c.summary}`);
    }
  }

  // 4. 从 World Contract 提取设定一致性
  if (input.worldFulfillment) {
    const w = input.worldFulfillment;
    dimensions['setting_coherence'] = {
      score: passedToScore(w.passed, 8),
      findings: w.findings.map(f => f.message),
    };

    if (!w.passed) {
      issues.push('世界观一致性门禁未通过');
    }
  }

  // 5. 从 Commercial Gate 提取商业性和钩子
  if (input.commercialReport) {
    const cm = input.commercialReport;
    // CommercialGateReport 没有统一 score 字段，用通过/不通过计算
    const commercialScore = cm.passed ? 7.5 : 5;
    dimensions['commercial_appeal'] = {
      score: commercialScore,
      findings: cm.findings.map(f => f.message),
    };
    dimensions['hook_effectiveness'] = {
      score: cm.endingHook ? 8 : 5,
      findings: cm.endingHook ? ['章末有有效钩子'] : ['缺少章末钩子'],
    };
  }

  // 6. 从 Outline Fulfillment 提取信息边界
  if (input.outlineFulfillment) {
    const o = input.outlineFulfillment;
    dimensions['information_boundary'] = {
      score: passedToScore(o.passed, 7.5),
      findings: [],
    };
  }

  // 7. 文本基础统计（填补缺失维度）
  const text = input.chapterContent;
  if (text.length > 0) {
    // 填充缺少的维度（给予中性默认分）
    const defaultDims = [
      'prose_quality', 'pacing_rhythm', 'emotional_authenticity',
      'character_consistency', 'timeline_continuity', 'setting_coherence',
      'hook_effectiveness',
    ];
    for (const dimId of defaultDims) {
      if (!dimensions[dimId]) {
        dimensions[dimId] = { score: 7.0, findings: [] };
      }
    }
  }

  // 8. 计算加权综合分
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [dimId, entry] of Object.entries(dimensions)) {
    const weight = DIMENSION_WEIGHTS[dimId] ?? 1.0;
    weightedSum += entry.score * weight;
    weightTotal += weight;
  }
  const overallScore = weightTotal > 0
    ? Math.round((weightedSum / weightTotal) * 10) / 10
    : 7.0;

  // 9. 构建 suggestions
  const suggestions: string[] = [];
  for (const [dimId, entry] of Object.entries(dimensions)) {
    if (entry.score < 6) {
      suggestions.push(`${dimId} 维度评分偏低 (${entry.score})，需重点关注`);
    }
  }

  // 10. 构建 Reader 兼容 JSON 输出
  const output = {
    overallScore,
    pacing: buildDimensionNarrative('pacing_rhythm', dimensions),
    engagement: `综合评分 ${overallScore}/10，基于 ${Object.keys(dimensions).length} 个维度的确定性评估`,
    characterization: buildDimensionNarrative('character_consistency', dimensions),
    emotion: buildDimensionNarrative('emotional_authenticity', dimensions),
    prose: buildDimensionNarrative('prose_quality', dimensions),
    dimensions,
    issues,
    highlights,
    suggestions,
    _source: 'deterministic',
  };

  return JSON.stringify(output, null, 2);
}

/**
 * 为单个维度生成叙述性文本
 */
function buildDimensionNarrative(
  dimId: string,
  dimensions: Record<string, DimensionEntry>,
): string {
  const dim = dimensions[dimId];
  if (!dim) return '未评估';

  const level = dim.score >= 8 ? '优秀' : dim.score >= 6 ? '良好' : dim.score >= 4 ? '需改进' : '较差';
  const findingsText = dim.findings.length > 0
    ? `。发现：${dim.findings.slice(0, 2).join('；')}`
    : '';
  return `${level} (${dim.score}/10)${findingsText}`;
}
