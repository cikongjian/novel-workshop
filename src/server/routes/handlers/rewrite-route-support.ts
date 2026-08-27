import type { Request } from 'express';
import { saveGenerationResultsFull } from '../../../services/generation-result-service.js';
import { buildChapterCost } from '../../../cost/build-chapter-cost.js';
import type { GenerateDeps } from './types.js';

const REWRITE_SOURCE_CHAR_LIMIT = 5000;
const REWRITE_SIMILARITY_THRESHOLD = 0.92;
export const REWRITE_PREVIEW_TTL_MS = 10 * 60_000;
export const REWRITE_PREVIEW_CACHE_LIMIT = 64;

export type RewriteRequestPayload = {
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  userDirection?: string;
  maxWordCount?: number;
  stylePreset?:
    | 'auto'
    | 'serious'
    | 'comedy'
    | 'wacky'
    | 'historical'
    | 'xianxia'
    | 'wuxia'
    | 'suspense'
    | 'horror'
    | 'campus'
    | 'workplace'
    | 'political'
    | 'hard-scifi'
    | 'romance-sweet'
    | 'romance-angst';
  styleNotes?: string;
  modelOverride?: import('../../../models/types.js').ModelClient;
};

type RewriteAssessment = {
  changed: boolean;
  similarity: number;
  reason: string;
};

export type RewritePreviewResult = {
  chapterContent: string;
  editedContent: string;
  readerFeedback: string;
  similarity: number;
  similarityReason: string;
  usedDefaultDirection: boolean;
  result: any;
};

export type CachedRewritePreview = RewritePreviewResult & {
  createdAt: number;
};

function normalizeForSimilarity(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/\s+/g, '')
    .replace(/[，。！？；：、“”‘’（）《》【】「」『』,.;:!?()[\]{}<>"'`~@#$%^&*_+=|\\/.-]/g, '');
}

function buildNgramFrequency(input: string, ngramSize: number): Map<string, number> {
  const freq = new Map<string, number>();
  if (!input) return freq;

  if (input.length <= ngramSize) {
    freq.set(input, 1);
    return freq;
  }

  for (let i = 0; i <= input.length - ngramSize; i += 1) {
    const gram = input.slice(i, i + ngramSize);
    freq.set(gram, (freq.get(gram) ?? 0) + 1);
  }

  return freq;
}

function computeDiceSimilarity(aFreq: Map<string, number>, bFreq: Map<string, number>): number {
  if (aFreq.size === 0 && bFreq.size === 0) return 1;

  let overlap = 0;
  let aTotal = 0;
  let bTotal = 0;

  for (const count of aFreq.values()) aTotal += count;
  for (const count of bFreq.values()) bTotal += count;

  for (const [gram, aCount] of aFreq) {
    const bCount = bFreq.get(gram);
    if (!bCount) continue;
    overlap += Math.min(aCount, bCount);
  }

  const denom = aTotal + bTotal;
  return denom > 0 ? (2 * overlap) / denom : 0;
}

function computeTextSimilarity(original: string, rewritten: string): number {
  const normalizedOriginal = normalizeForSimilarity(original);
  const normalizedRewritten = normalizeForSimilarity(rewritten);

  if (!normalizedOriginal && !normalizedRewritten) return 1;
  if (!normalizedOriginal || !normalizedRewritten) return 0;
  if (normalizedOriginal === normalizedRewritten) return 1;

  const ngramSize = Math.min(normalizedOriginal.length, normalizedRewritten.length) >= 600 ? 3 : 2;
  const originalFreq = buildNgramFrequency(normalizedOriginal, ngramSize);
  const rewrittenFreq = buildNgramFrequency(normalizedRewritten, ngramSize);
  return computeDiceSimilarity(originalFreq, rewrittenFreq);
}

function assessRewriteChange(original: string, rewritten: string): RewriteAssessment {
  const originalTrimmed = original.trim();
  const rewrittenTrimmed = rewritten.trim();

  if (!rewrittenTrimmed) {
    return {
      changed: false,
      similarity: 1,
      reason: '重写结果为空',
    };
  }

  if (rewrittenTrimmed === originalTrimmed) {
    return {
      changed: false,
      similarity: 1,
      reason: '重写结果与原文完全一致',
    };
  }

  const similarity = computeTextSimilarity(originalTrimmed, rewrittenTrimmed);
  const minLength = Math.min(originalTrimmed.length, rewrittenTrimmed.length);
  const threshold = minLength < 1500 ? 0.95 : REWRITE_SIMILARITY_THRESHOLD;

  if (similarity >= threshold) {
    return {
      changed: false,
      similarity,
      reason: `重写相似度过高（${Math.round(similarity * 100)}%）`,
    };
  }

  return {
    changed: true,
    similarity,
    reason: `改写有效（相似度 ${Math.round(similarity * 100)}%）`,
  };
}

function buildRewriteDirection(payload: {
  chapterNumber: number;
  chapterContent: string;
  userDirection?: string;
}): { direction: string; usedDefaultDirection: boolean } {
  const { chapterNumber, chapterContent } = payload;
  const trimmedDirection = payload.userDirection?.trim() ?? '';
  const excerpt = chapterContent.trim().slice(0, REWRITE_SOURCE_CHAR_LIMIT);
  const continuityRule = chapterNumber > 1
    ? `必须严格承接第 ${chapterNumber - 1} 章既有事实、角色状态与时间顺序。`
    : '这是第一章，需确保开篇清晰建立主角、冲突与钩子。';

  const lines: string[] = [
    `你正在重写第 ${chapterNumber} 章。`,
    '【执行优先级】用户额外要求 > 重写约束 > 其余优化。',
  ];

  if (trimmedDirection) {
    lines.push(
      '【用户重点要求（必须逐条兑现）】',
      trimmedDirection,
    );
  }

  lines.push(
    '重写要求：',
    '1. 保留本章核心事件、人物关系与关键信息，不得改写事实结果。',
    `2. ${continuityRule}`,
    '3. 必须重构叙事节奏、镜头组织与语言表达，不得照抄原句。',
    '4. 避免连续 12 个字与原文完全相同（专有名词、固定术语除外）。',
  );

  lines.push('', '【当前章节原文（重写依据）】', excerpt);

  return {
    direction: lines.join('\n'),
    usedDefaultDirection: trimmedDirection.length === 0,
  };
}

export function buildRewriteRequesterKey(req: Request): string {
  const userId = req.auth?.id?.trim();
  if (userId) return `uid:${userId}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

export function buildPreviewCacheKey(novelId: string, chapterNumber: number, requesterKey: string): string {
  return `${requesterKey}:${novelId}:${chapterNumber}`;
}

export function purgeExpiredPreviews(previewCache: Map<string, CachedRewritePreview>, now = Date.now()): void {
  for (const [key, preview] of previewCache) {
    if (now - preview.createdAt > REWRITE_PREVIEW_TTL_MS) {
      previewCache.delete(key);
    }
  }
}

export function trimPreviewCache(previewCache: Map<string, CachedRewritePreview>): void {
  while (previewCache.size > REWRITE_PREVIEW_CACHE_LIMIT) {
    const oldestKey = previewCache.keys().next().value;
    if (!oldestKey) break;
    previewCache.delete(oldestKey);
  }
}

export async function previewRewriteChapter(
  deps: GenerateDeps,
  payload: RewriteRequestPayload,
): Promise<RewritePreviewResult> {
  const { chapterPipeline, broadcast } = deps;

  const { direction, usedDefaultDirection } = buildRewriteDirection({
    chapterNumber: payload.chapterNumber,
    chapterContent: payload.chapterContent,
    userDirection: payload.userDirection,
  });
  const isolatedChapterPipeline = chapterPipeline.fork();

  const result = await isolatedChapterPipeline.generateChapter({
    novelId: payload.novelId,
    chapterNumber: payload.chapterNumber,
    userDirection: direction,
    maxWordCount: payload.maxWordCount,
    stylePreset: payload.stylePreset,
    styleNotes: payload.styleNotes,
    modelOverride: payload.modelOverride,
    skipStrictGate: true,
    skipLengthGuard: true,
    onEvent: (event) => {
      broadcast(event);
    },
  });

  const assessment = assessRewriteChange(payload.chapterContent, result.chapterContent);

  return {
    chapterContent: result.chapterContent,
    editedContent: result.editedContent,
    readerFeedback: result.readerFeedback,
    similarity: assessment.similarity,
    similarityReason: assessment.reason,
    usedDefaultDirection,
    result,
  };
}

export async function confirmRewriteChapter(
  deps: GenerateDeps,
  payload: {
    novelId: string;
    chapterNumber: number;
    result: any;
  },
): Promise<void> {
  const { novelManager, novelMemory, agents, modelClient, storyStateManager, broadcast } = deps;

  await saveGenerationResultsFull(
    novelManager,
    novelMemory,
    payload.novelId,
    payload.chapterNumber,
    payload.result,
    agents,
    modelClient,
    storyStateManager,
  );

  const costSummary = buildChapterCost(payload.novelId, payload.chapterNumber, payload.result.agentOutputs, {
    operationType: 'rewrite',
    operationLabel: '章节重写',
  });
  await novelManager.appendChapterCost(payload.novelId, costSummary);

  broadcast({
    type: 'pipeline:complete',
    agentRole: 'writer',
    novelId: payload.novelId,
    chapterNumber: payload.chapterNumber,
    data: JSON.stringify({ chapterNumber: payload.chapterNumber, cost: costSummary, mode: 'rewrite' }),
    timestamp: new Date().toISOString(),
  });
}
