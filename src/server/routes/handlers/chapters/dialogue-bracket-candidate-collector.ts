import {
  buildEditId,
  buildPrefixReplacement,
  buildSuffixReplacement,
  DIALOGUE_PREFIX_BRACKET_RE,
  DIALOGUE_SUFFIX_BRACKET_RE,
  hasRoleMarkerBefore,
  isCandidateTag,
  isRecommendedTag,
  locatePosition,
} from './dialogue-bracket-cleaner-support.js';
import type { Candidate, DialogueBracketTransformMode } from './dialogue-bracket-cleaner-types.js';

export function collectCandidates(content: string, mode: DialogueBracketTransformMode): Candidate[] {
  const candidates: Candidate[] = [];

  DIALOGUE_PREFIX_BRACKET_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIALOGUE_PREFIX_BRACKET_RE.exec(content)) !== null) {
    const inner = (match[1] ?? '').trim();
    const quoteStart = match[2] ?? '“';
    if (!isCandidateTag(inner)) continue;
    const start = match.index;
    const end = start + match[0].length;
    const position = locatePosition(content, start);
    candidates.push({
      id: buildEditId('prefix', start, end, inner),
      start,
      end,
      replacement: buildPrefixReplacement(inner, quoteStart, mode, hasRoleMarkerBefore(content, start)),
      tagText: inner,
      patternType: 'prefix',
      recommended: isRecommendedTag(inner),
      lineNumber: position.lineNumber,
      columnNumber: position.columnNumber,
      paragraphNumber: position.paragraphNumber,
    });
  }

  DIALOGUE_SUFFIX_BRACKET_RE.lastIndex = 0;
  while ((match = DIALOGUE_SUFFIX_BRACKET_RE.exec(content)) !== null) {
    const quoteEnd = match[1] ?? '”';
    const inner = (match[2] ?? '').trim();
    if (!isCandidateTag(inner)) continue;
    const start = match.index;
    const end = start + match[0].length;
    const position = locatePosition(content, start);
    candidates.push({
      id: buildEditId('suffix', start, end, inner),
      start,
      end,
      replacement: buildSuffixReplacement(inner, quoteEnd, mode),
      tagText: inner,
      patternType: 'suffix',
      recommended: isRecommendedTag(inner),
      lineNumber: position.lineNumber,
      columnNumber: position.columnNumber,
      paragraphNumber: position.paragraphNumber,
    });
  }

  candidates.sort((a, b) => a.start - b.start);
  const deduped: Candidate[] = [];
  let lastEnd = -1;
  for (const item of candidates) {
    if (item.start < lastEnd) continue;
    deduped.push(item);
    lastEnd = item.end;
  }
  return deduped;
}
