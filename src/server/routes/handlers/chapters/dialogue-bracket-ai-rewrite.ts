import type { ChatMessage, ModelClient } from '../../../../models/types.js';
import {
  AI_REWRITE_SYSTEM_PROMPT,
  buildPrefixReplacement,
  buildSuffixReplacement,
  extractNarration,
  extractRoleMarkerBefore,
  hasRoleMarkerBefore,
  rebuildPrefixFromNarration,
  rebuildSuffixFromNarration,
  withTimeout,
} from './dialogue-bracket-cleaner-support.js';
import type { Candidate } from './dialogue-bracket-cleaner-types.js';

export async function buildAIReplacementForCandidate(
  content: string,
  candidate: Candidate,
  modelClient: ModelClient,
  aiCache?: Map<string, string>,
  aiState?: {
    callCount: number;
    maxAiCalls: number;
    perCallTimeoutMs: number;
  },
): Promise<string | null> {
  const quoteChar = candidate.patternType === 'prefix'
    ? (content[candidate.end - 1] || '“')
    : (content[candidate.start] || '”');
  const cacheKey = `${candidate.patternType}:${candidate.tagText}:${quoteChar}:${hasRoleMarkerBefore(content, candidate.start)}`;
  const cached = aiCache?.get(cacheKey);
  if (cached) return cached;

  const fallback = candidate.patternType === 'prefix'
    ? buildPrefixReplacement(candidate.tagText, quoteChar, 'rewrite', hasRoleMarkerBefore(content, candidate.start))
    : buildSuffixReplacement(candidate.tagText, quoteChar, 'rewrite');
  if (aiState && aiState.callCount >= aiState.maxAiCalls) {
    aiCache?.set(cacheKey, fallback);
    return fallback;
  }

  const roleMarker = extractRoleMarkerBefore(content, candidate.start);
  const messages: ChatMessage[] = [
    { role: 'system', content: AI_REWRITE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({
        patternType: candidate.patternType,
        tagText: candidate.tagText,
        quoteChar,
        roleMarker: roleMarker ?? '',
        lineNumber: candidate.lineNumber,
        schema: { narration: 'string' },
      }),
    },
  ];

  try {
    if (aiState) aiState.callCount += 1;
    const response = await withTimeout(
      modelClient.chat(messages, {
        temperature: 0.1,
        maxTokens: 80,
      }),
      aiState?.perCallTimeoutMs ?? 1600,
    );
    const narrationRaw = extractNarration(response.content);
    if (!narrationRaw) {
      aiCache?.set(cacheKey, fallback);
      return fallback;
    }
    const rebuilt = candidate.patternType === 'prefix'
      ? rebuildPrefixFromNarration(narrationRaw, quoteChar)
      : rebuildSuffixFromNarration(narrationRaw, quoteChar);
    const normalized = rebuilt || fallback;
    aiCache?.set(cacheKey, normalized);
    return normalized;
  } catch {
    aiCache?.set(cacheKey, fallback);
    return fallback;
  }
}
