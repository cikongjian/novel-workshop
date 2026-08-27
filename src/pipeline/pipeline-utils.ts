const INLINE_SPEAKER_MARKER_RE = /[\(\uFF08]\s*[#\uFF03][^()\uFF08\uFF09\n]{1,30}\s*[\)\uFF09]/g;

export function countInlineSpeakerMarkers(text: string): number {
  return text.match(INLINE_SPEAKER_MARKER_RE)?.length ?? 0;
}

export function buildDomainStructureKeywords(params: {
  requiredPayoffKeywords?: string[];
  requiredSceneKeywords?: string[];
}): string[] {
  return [...new Set([
    ...(params.requiredPayoffKeywords ?? []),
    ...(params.requiredSceneKeywords ?? []),
  ].map(keyword => keyword.trim()).filter(Boolean))].slice(0, 32);
}
