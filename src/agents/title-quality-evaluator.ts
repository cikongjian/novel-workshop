/**
 * 标题质量评估 — 精简版
 *
 * 只做基础质量检查：长度、抽象词、套路检测、重复检测。
 * 具体的题材匹配、动作感、锚点等交给 LLM 三层思考链自行判断。
 */

import {
  inspectGeneratedTitle,
  sanitizeGeneratedTitle,
  type TitleStrategyParams,
} from './title-generation-strategy.js';

export type TitleQualityEvaluation = {
  score: number;
  issues: string[];
  strengths: string[];
  mechanical: boolean;
};

const ABSTRACT_WORDS = ['真相', '危机', '希望', '守护', '逆袭', '反击', '反转', '惊变', '秘密', '抉择', '命运'];
const BANNED_OPENERS = ['竟', '竟然', '原来', '终于', '开始了'];

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function countIncludes(title: string, words: string[]): number {
  return words.filter((word) => title.includes(word)).length;
}

function evaluateTitleQuality(title: string, params: TitleStrategyParams): TitleQualityEvaluation {
  const normalized = sanitizeGeneratedTitle(title);
  const inspection = inspectGeneratedTitle(normalized, params.recentTitles ?? []);
  const issues = [...inspection.reasons];
  const strengths: string[] = [];
  let score = 58;

  // 长度评估
  if (normalized.length >= 4 && normalized.length <= 12) {
    score += 12;
    strengths.push('长度克制');
  } else if (normalized.length <= 16) {
    score += 4;
  } else {
    issues.push('长度拖沓');
    score -= 6;
  }

  // 抽象词惩罚
  const abstractCount = countIncludes(normalized, ABSTRACT_WORDS);
  if (abstractCount > 0) {
    issues.push('抽象词偏多');
    score -= Math.min(12, abstractCount * 4);
  }

  // 禁忌开头
  if (BANNED_OPENERS.some((word) => normalized.startsWith(word))) {
    issues.push('开头像套路文案');
    score -= 10;
  }

  // 如果没有机械问题且长度合适，给予基础加分
  if (!inspection.mechanical) {
    score += 8;
    strengths.push('通过基础质量检查');
  }

  return {
    score: clampScore(score - inspection.reasons.length * 4),
    issues: Array.from(new Set(issues)),
    strengths: Array.from(new Set(strengths)),
    mechanical: inspection.mechanical,
  };
}

export function evaluateGeneratedTitle(title: string, params: TitleStrategyParams): TitleQualityEvaluation {
  return evaluateTitleQuality(title, params);
}
