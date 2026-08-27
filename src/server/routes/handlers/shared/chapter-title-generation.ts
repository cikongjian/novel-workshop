import type { ModelClient } from '../../../../models/types.js';
import type { NovelAgent } from '../../../../agents/types.js';
import {
  sanitizeGeneratedTitle,
  type TitleStrategyParams,
} from '../../../../agents/title-generation-strategy.js';
import { evaluateGeneratedTitle } from '../../../../agents/title-quality-evaluator.js';

const MAX_RETRY_ATTEMPTS = 2;
const MIN_ACCEPTABLE_SCORE = 60;

export async function getRecentChapterTitles(
  novelManager: import('../../../../novel/novel-manager.js').NovelManager,
  novelId: string,
  chapterNumber: number,
  limit = 3,
): Promise<string[]> {
  const titles: string[] = [];
  for (let current = chapterNumber - 1; current >= 1 && titles.length < limit; current -= 1) {
    const chapter = await novelManager.getChapter(novelId, current);
    const title = chapter?.title?.trim();
    if (title) {
      titles.unshift(title);
    }
  }
  return titles;
}

function extractGeneratedTitle(raw: string): string {
  let generatedTitle = '';
  try {
    const parsed = JSON.parse(raw.trim());
    generatedTitle = parsed.title || '';
  } catch {
    const match = raw.match(/"title"\s*:\s*"([^"]+)"/);
    if (match) generatedTitle = match[1];
  }
  return sanitizeGeneratedTitle(generatedTitle);
}

function buildStrategyParams(params: {
  novelTitle: string;
  novelSynopsis: string;
  genre: string;
  chapterNumber: number;
  recentTitles: string[];
  fullContent: string;
}): TitleStrategyParams {
  return {
    genre: params.genre,
    novelTitle: params.novelTitle,
    novelSynopsis: params.novelSynopsis,
    chapterNumber: params.chapterNumber,
    recentTitles: params.recentTitles,
    fullContent: params.fullContent,
  };
}

export async function generateTitleWithRetry(params: {
  titleAgent: NovelAgent;
  novelId: string;
  novelTitle: string;
  novelSynopsis: string;
  genre: string;
  chapterNumber: number;
  recentTitles: string[];
  previousTitle: string;
  fullContent: string;
  modelClient: ModelClient;
  userDirection?: string;
}): Promise<string> {
  const strategyParams = buildStrategyParams({
    novelTitle: params.novelTitle,
    novelSynopsis: params.novelSynopsis,
    genre: params.genre,
    chapterNumber: params.chapterNumber,
    recentTitles: params.recentTitles,
    fullContent: params.fullContent,
  });

  const baseInput = {
    fullContent: params.fullContent,
    previousTitle: params.previousTitle,
    recentTitles: params.recentTitles,
  };

  const executeOnce = async (userDirection = ''): Promise<string> => {
    const titleResult = await params.titleAgent.execute(
      {
        novelId: params.novelId,
        novelTitle: params.novelTitle,
        novelSynopsis: params.novelSynopsis,
        genre: params.genre,
        chapterNumber: params.chapterNumber,
        userDirection,
        inputText: JSON.stringify(baseInput),
      },
      params.modelClient,
    );
    return extractGeneratedTitle(titleResult.content);
  };

  // 首次生成
  const firstTitle = await executeOnce(params.userDirection);
  const firstEvaluation = evaluateGeneratedTitle(firstTitle, strategyParams);

  if (firstEvaluation.score >= MIN_ACCEPTABLE_SCORE && !firstEvaluation.mechanical) {
    return firstTitle;
  }

  // 首次质量不够，重试一次，附带问题反馈
  const retryDirection = [
    `上一版标题存在问题：${firstEvaluation.issues.join('、')}。`,
    '请重写一个更具体、更有悬念的标题，避免空泛大词和摘要式表达。',
  ].join('');

  const retryTitle = await executeOnce(retryDirection);
  if (!retryTitle) return firstTitle;

  const retryEvaluation = evaluateGeneratedTitle(retryTitle, strategyParams);

  // 选更好的那个
  if (retryEvaluation.score > firstEvaluation.score) {
    return retryTitle;
  }
  return firstTitle;
}
