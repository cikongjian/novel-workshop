import type { ModelClient } from '../../../../models/types.js';
import { buildAIReplacementForCandidate } from './dialogue-bracket-ai-rewrite.js';
import { collectCandidates } from './dialogue-bracket-candidate-collector.js';
import { snippetAround } from './dialogue-bracket-cleaner-support.js';
import type {
  Candidate,
  DialogueBracketCleanupResult,
  DialogueBracketTransformMode,
} from './dialogue-bracket-cleaner-types.js';

export function cleanDialogueBracketTags(
  content: string,
  selectedIds?: Set<string>,
  applyMode = false,
  transformMode: DialogueBracketTransformMode = 'clean',
): DialogueBracketCleanupResult {
  const candidates = collectCandidates(content, transformMode);
  return applyCandidates(content, candidates, selectedIds, applyMode);
}

export async function rewriteDialogueBracketTagsWithAI(
  content: string,
  modelClient: ModelClient,
  selectedIds?: Set<string>,
  applyMode = false,
  aiCache?: Map<string, string>,
  options?: {
    maxAiCalls?: number;
    perCallTimeoutMs?: number;
  },
): Promise<DialogueBracketCleanupResult> {
  const maxAiCalls = Math.max(0, options?.maxAiCalls ?? 30);
  const perCallTimeoutMs = Math.max(300, options?.perCallTimeoutMs ?? 1600);
  const aiState = { callCount: 0, maxAiCalls, perCallTimeoutMs };
  const candidates = collectCandidates(content, 'rewrite');
  if (candidates.length === 0) {
    return emptyCleanupResult(content);
  }

  const appliedCandidates: Candidate[] = [];
  let output = '';
  let cursor = 0;
  let replacements = 0;
  let beforeSample = '';
  let afterSample = '';

  for (const candidate of candidates) {
    const shouldApply = !applyMode || Boolean(selectedIds?.has(candidate.id));
    if (!shouldApply) continue;

    let replacement = candidate.replacement;
    const aiReplacement = await buildAIReplacementForCandidate(
      content,
      candidate,
      modelClient,
      aiCache,
      aiState,
    );
    if (aiReplacement) {
      replacement = aiReplacement;
    }

    output += content.slice(cursor, candidate.start);
    output += replacement;
    cursor = candidate.end;
    replacements += 1;

    const applied: Candidate = {
      ...candidate,
      replacement,
    };
    appliedCandidates.push(applied);

    if (!beforeSample) {
      beforeSample = snippetAround(content, candidate.start, candidate.end);
      const replaced = `${content.slice(0, candidate.start)}${replacement}${content.slice(candidate.end)}`;
      afterSample = snippetAround(replaced, candidate.start, candidate.start + replacement.length);
    }
  }

  if (replacements === 0) {
    return emptyCleanupResult(content);
  }

  output += content.slice(cursor);
  return {
    content: output,
    replacements,
    examples: buildExamples(content, appliedCandidates),
    beforeSample,
    afterSample,
  };
}

export function buildDialogueBracketCleanupSummary(params: {
  applied: boolean;
  totalScanned: number;
  affected: number;
  replacements: number;
  mode?: DialogueBracketTransformMode;
}): string {
  const mode = params.mode ?? 'clean';
  const modeLabel = mode === 'ai-rewrite' ? 'AI改写' : mode === 'rewrite' ? '改写' : '清洗';
  if (params.affected === 0) {
    return `已扫描 ${params.totalScanned} 章，未发现需要${modeLabel}的括号动作标签。`;
  }
  const action = params.applied ? `已应用${modeLabel}` : `预览发现可${modeLabel}`;
  return `${action} ${params.affected} 章，共处理 ${params.replacements} 处括号动作标签。`;
}

function applyCandidates(
  content: string,
  candidates: Candidate[],
  selectedIds?: Set<string>,
  applyMode = false,
): DialogueBracketCleanupResult {
  if (candidates.length === 0) {
    return emptyCleanupResult(content);
  }

  let output = '';
  let cursor = 0;
  let replacements = 0;
  let beforeSample = '';
  let afterSample = '';
  const appliedCandidates: Candidate[] = [];

  for (const candidate of candidates) {
    const shouldApply = !applyMode || Boolean(selectedIds?.has(candidate.id));
    if (!shouldApply) continue;

    output += content.slice(cursor, candidate.start);
    output += candidate.replacement;
    cursor = candidate.end;
    replacements += 1;
    appliedCandidates.push(candidate);

    if (!beforeSample) {
      beforeSample = snippetAround(content, candidate.start, candidate.end);
      const replaced = `${content.slice(0, candidate.start)}${candidate.replacement}${content.slice(candidate.end)}`;
      afterSample = snippetAround(replaced, candidate.start, candidate.start + candidate.replacement.length);
    }
  }

  if (replacements === 0) {
    return emptyCleanupResult(content);
  }

  output += content.slice(cursor);
  return {
    content: output,
    replacements,
    examples: buildExamples(content, appliedCandidates),
    beforeSample,
    afterSample,
  };
}

function buildExamples(
  content: string,
  candidates: Candidate[],
): DialogueBracketCleanupResult['examples'] {
  const examples: DialogueBracketCleanupResult['examples'] = [];
  for (const candidate of candidates.slice(0, 40)) {
    const replaced = `${content.slice(0, candidate.start)}${candidate.replacement}${content.slice(candidate.end)}`;
    examples.push({
      id: candidate.id,
      before: snippetAround(content, candidate.start, candidate.end),
      after: snippetAround(replaced, candidate.start, candidate.start + candidate.replacement.length),
      tagText: candidate.tagText,
      recommended: candidate.recommended,
      patternType: candidate.patternType,
      lineNumber: candidate.lineNumber,
      columnNumber: candidate.columnNumber,
      paragraphNumber: candidate.paragraphNumber,
    });
  }
  return examples;
}

function emptyCleanupResult(content: string): DialogueBracketCleanupResult {
  return {
    content,
    replacements: 0,
    examples: [],
    beforeSample: '',
    afterSample: '',
  };
}
