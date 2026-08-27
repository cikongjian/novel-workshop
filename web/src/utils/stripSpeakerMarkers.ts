const MARKER_STRIP_RE = /[\(\uFF08]\s*[#\uFF03]\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]/g;

export function stripSpeakerMarkers(content: string): string {
  return content
    .replace(MARKER_STRIP_RE, '')
    .replace(/ {2,}/g, ' ');
}
