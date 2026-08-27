import type { CharacterProfile, WorldEntry } from '../novel/types.js';
import { extractChapterFacts } from '../novel/chapter-fact-extractor.js';
import { evaluateAiTrace, type GenreTraceOverrides } from './ai-trace-detector.js';

export type RewriteRegressionGuardResult = {
  passed: boolean;
  summary: string;
  issues: string[];
};

export type AiMarkerComparisonResult = {
  beforeScore: number;
  afterScore: number;
  delta: number;
  increased: boolean;
  summary: string;
};

const TIME_TOKEN_RE = /凌晨|清晨|上午|正午|午后|下午|傍晚|夜晚|深夜|翌日|次日|第二天|当日|今日|今夜|昨夜|昨日|明日|翌晨/g;

function collectNames(characters: CharacterProfile[]): string[] {
  const names = characters.flatMap(character => [character.name, ...(character.aliases ?? [])]);
  return [...new Set(names.map(name => name.trim()).filter(Boolean))];
}

function collectWorldNames(worldEntries: WorldEntry[]): string[] {
  return [...new Set(worldEntries.map(item => item.name.trim()).filter(Boolean))];
}

function collectExistingTokens(text: string, candidates: string[]): string[] {
  return candidates.filter(token => token && text.includes(token));
}

function collectTimeTokens(text: string): string[] {
  const matched = text.match(TIME_TOKEN_RE) ?? [];
  return [...new Set(matched)];
}

function retentionRatio(tokens: string[], newText: string): number {
  if (tokens.length === 0) return 1;
  const retained = tokens.filter(token => newText.includes(token)).length;
  return retained / tokens.length;
}

export function verifyRewriteRegression(params: {
  beforeText: string;
  afterText: string;
  characters: CharacterProfile[];
  worldEntries: WorldEntry[];
}): RewriteRegressionGuardResult {
  const { beforeText, afterText, characters, worldEntries } = params;
  const issues: string[] = [];

  const characterTokens = collectExistingTokens(beforeText, collectNames(characters));
  const worldTokens = collectExistingTokens(beforeText, collectWorldNames(worldEntries));
  const timeTokens = collectTimeTokens(beforeText);
  const beforeFact = extractChapterFacts({
    chapterContent: beforeText,
    characters,
    worldEntries,
  });
  const afterFact = extractChapterFacts({
    chapterContent: afterText,
    characters,
    worldEntries,
  });

  const charRetention = retentionRatio(characterTokens, afterText);
  const worldRetention = retentionRatio(worldTokens, afterText);
  const timeRetention = retentionRatio(timeTokens, afterText);

  if (characterTokens.length >= 2 && charRetention < 0.85) {
    issues.push(`角色名保留率过低（${Math.round(charRetention * 100)}%）`);
  }
  if (worldTokens.length >= 2 && worldRetention < 0.75) {
    issues.push(`地点/设定名保留率过低（${Math.round(worldRetention * 100)}%）`);
  }
  if (timeTokens.length >= 1 && timeRetention < 0.8) {
    issues.push(`时间锚点保留率过低（${Math.round(timeRetention * 100)}%）`);
  }
  if (beforeFact.locations.length > 0) {
    const retained = beforeFact.locations.filter(location => afterFact.locations.includes(location)).length;
    const ratio = retained / beforeFact.locations.length;
    if (ratio < 0.75) {
      issues.push(`地点事实保留率过低（${Math.round(ratio * 100)}%）`);
    }
  }
  if (beforeFact.items.length > 0) {
    const beforeItems = beforeFact.items.map(item => item.name);
    const afterItems = new Set(afterFact.items.map(item => item.name));
    const retained = beforeItems.filter(item => afterItems.has(item)).length;
    const ratio = retained / beforeItems.length;
    if (ratio < 0.7) {
      issues.push(`道具事实保留率过低（${Math.round(ratio * 100)}%）`);
    }
  }

  const passed = issues.length === 0;
  const summary = passed
    ? '回归保护通过：关键实体、地点与时间锚点保持稳定'
    : `回归保护触发回滚：${issues.join('；')}`;

  return { passed, summary, issues };
}

/**
 * 对比修订前后的 AI 标记数量
 *
 * 如果修订后 AI 标记增多，说明修订引入了更多 AI 痕迹，应该拒绝修订
 *
 * @param params.beforeText - 修订前的文本
 * @param params.afterText - 修订后的文本
 * @param params.genreOverrides - 题材特定的规则覆盖
 * @returns AI 标记对比结果
 */
export function compareAiMarkerCount(params: {
  beforeText: string;
  afterText: string;
  genreOverrides?: GenreTraceOverrides;
}): AiMarkerComparisonResult {
  const { beforeText, afterText, genreOverrides } = params;

  // 评估修订前后的 AI 痕迹分数
  const beforeReport = evaluateAiTrace(beforeText, genreOverrides);
  const afterReport = evaluateAiTrace(afterText, genreOverrides);

  const beforeScore = beforeReport.score;
  const afterScore = afterReport.score;
  const delta = afterScore - beforeScore;
  const increased = delta < 0; // 分数降低 = AI 标记增多

  let summary: string;
  if (increased) {
    const increaseAmount = Math.abs(delta);
    summary = `修订后 AI 标记增多（分数下降 ${increaseAmount.toFixed(1)} 分），从 ${beforeScore.toFixed(1)} 降至 ${afterScore.toFixed(1)}`;
  } else if (delta > 0) {
    summary = `修订后 AI 标记减少（分数提升 ${delta.toFixed(1)} 分），从 ${beforeScore.toFixed(1)} 升至 ${afterScore.toFixed(1)}`;
  } else {
    summary = `修订前后 AI 标记数量基本持平（${beforeScore.toFixed(1)} 分）`;
  }

  return {
    beforeScore,
    afterScore,
    delta,
    increased,
    summary,
  };
}
