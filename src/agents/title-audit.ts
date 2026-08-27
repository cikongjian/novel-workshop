import type { TitleStrategyParams } from './title-generation-strategy.js';
import { inspectGeneratedTitle } from './title-generation-strategy.js';
import { evaluateGeneratedTitle, type TitleQualityEvaluation } from './title-quality-evaluator.js';

export const DEFAULT_TITLE_REWRITE_SCORE = 70;
export const MIN_ACCEPTABLE_GENERATED_TITLE_SCORE = 65;
// 当章节原标题为空或为占位符（"第X章"）时，回填门槛更低，避免回填失败
export const MIN_ACCEPTABLE_EMPTY_TITLE_SCORE = 45;
export const MIN_SIGNIFICANT_TITLE_IMPROVEMENT = 5;

export type ChapterTitleAuditInput = {
  genre?: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
  chapterNumber?: number;
  startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
  outline?: string;
  summary?: string;
  fullContent?: string;
  recentTitles?: string[];
};

export function buildChapterTitleStrategyParams(input: ChapterTitleAuditInput): TitleStrategyParams {
  return {
    genre: input.genre,
    novelTitle: input.novelTitle,
    novelSynopsis: input.novelSynopsis,
    novelTags: input.novelTags,
    constitutionTags: input.constitutionTags,
    chapterNumber: input.chapterNumber,
    recentTitles: input.recentTitles ?? [],
    fullContent: input.fullContent ?? '',
  };
}

export function evaluateChapterTitle(
  title: string,
  input: ChapterTitleAuditInput,
): TitleQualityEvaluation {
  return evaluateGeneratedTitle(title, buildChapterTitleStrategyParams(input));
}

export function isPlaceholderChapterTitle(title: string): boolean {
  const normalized = title.trim();
  return !normalized
    || /^第\s*\d+\s*章$/u.test(normalized)
    || (normalized.length >= 4 && inspectGeneratedTitle(normalized).mechanical);
}

export type ChapterTitleReplacementDecision = {
  accept: boolean;
  currentScore: number | null;
  generatedScore: number;
  reasons: string[];
};

export function shouldAdoptGeneratedChapterTitle(input: {
  currentTitle?: string;
  generatedTitle: string;
  auditInput: ChapterTitleAuditInput;
}): ChapterTitleReplacementDecision {
  const currentTitle = input.currentTitle?.trim() ?? '';
  const generatedTitle = input.generatedTitle.trim();
  const generatedEvaluation = evaluateChapterTitle(generatedTitle, input.auditInput);
  const reasons: string[] = [];

  if (!generatedTitle) {
    return {
      accept: false,
      currentScore: currentTitle ? evaluateChapterTitle(currentTitle, input.auditInput).score : null,
      generatedScore: generatedEvaluation.score,
      reasons: ['生成标题为空'],
    };
  }

  if (currentTitle === generatedTitle) {
    return {
      accept: false,
      currentScore: currentTitle ? evaluateChapterTitle(currentTitle, input.auditInput).score : null,
      generatedScore: generatedEvaluation.score,
      reasons: ['生成标题与原标题相同'],
    };
  }

  const currentExists = currentTitle.length > 0 && !isPlaceholderChapterTitle(currentTitle);
  const currentEvaluation = currentExists ? evaluateChapterTitle(currentTitle, input.auditInput) : null;

  // 当章节标题原本为空或为占位符时，使用更低的门槛，避免回填失败
  const effectiveMinScore = currentExists
    ? MIN_ACCEPTABLE_GENERATED_TITLE_SCORE
    : MIN_ACCEPTABLE_EMPTY_TITLE_SCORE;
  if (generatedEvaluation.mechanical) {
    reasons.push(`生成标题未通过机械质量检查：${generatedEvaluation.issues.join('、')}`);
  }
  if (generatedEvaluation.score < effectiveMinScore) {
    reasons.push(`生成标题分数 ${generatedEvaluation.score} 低于门槛 ${effectiveMinScore}`);
  }

  if (!currentEvaluation) {
    return {
      accept: reasons.length === 0,
      currentScore: null,
      generatedScore: generatedEvaluation.score,
      reasons,
    };
  }

  if (generatedEvaluation.score <= currentEvaluation.score) {
    reasons.push('生成标题没有超过原标题');
  }

  if (
    currentEvaluation.score >= MIN_ACCEPTABLE_GENERATED_TITLE_SCORE
    && generatedEvaluation.score - currentEvaluation.score < MIN_SIGNIFICANT_TITLE_IMPROVEMENT
  ) {
    reasons.push(`生成标题提升幅度不足 ${MIN_SIGNIFICANT_TITLE_IMPROVEMENT} 分`);
  }

  return {
    accept: reasons.length === 0,
    currentScore: currentEvaluation.score,
    generatedScore: generatedEvaluation.score,
    reasons,
  };
}
