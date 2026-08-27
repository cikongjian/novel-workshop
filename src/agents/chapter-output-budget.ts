const DEFAULT_MAX_COMPLETION_TOKENS = 8192;

export type ChapterOutputStage = 'writer' | 'editor' | 'resizer-compress' | 'resizer-expand';

const MIN_STAGE_TOKENS: Record<ChapterOutputStage, number> = {
  writer: 2400,
  editor: 2200,
  'resizer-compress': 1800,
  'resizer-expand': 2400,
};

const SAFE_CHARS_PER_TOKEN: Record<ChapterOutputStage, number> = {
  writer: 0.56,
  editor: 0.58,
  'resizer-compress': 0.72,
  'resizer-expand': 0.56,
};

const STAGE_HEADROOM: Record<ChapterOutputStage, number> = {
  writer: 1.08,
  editor: 1.04,
  'resizer-compress': 1,
  'resizer-expand': 1.08,
};

export function estimateChapterOutputMaxTokens(params: {
  targetChars?: number;
  stage: ChapterOutputStage;
  hardCap?: number;
}): number {
  const hardCap = Math.max(1024, Math.floor(params.hardCap ?? DEFAULT_MAX_COMPLETION_TOKENS));
  const targetChars = Math.max(0, Math.round(params.targetChars ?? 0));
  if (targetChars <= 0) return hardCap;

  const stage = params.stage;
  const estimated = Math.ceil((targetChars / SAFE_CHARS_PER_TOKEN[stage]) * STAGE_HEADROOM[stage]);
  return Math.min(hardCap, Math.max(MIN_STAGE_TOKENS[stage], estimated));
}
