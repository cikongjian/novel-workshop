import type { AgentRole } from '../types';

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value;
  }
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trimProgressLine(text: string): string {
  const compact = compactWhitespace(text);
  if (compact.length <= 140) return compact;
  return `${compact.slice(0, 140).trimEnd()}…`;
}

function isLikelyNoise(text: string): boolean {
  if (!text) return true;
  if (/summarysummary/i.test(text)) return true;
  if (/^[\[\]{},"':\\\s-]+$/.test(text)) return true;
  if ((text.match(/["{}[\]\\]/g) ?? []).length >= Math.max(6, Math.floor(text.length / 6))) return true;
  if (/"\s*:\s*"/.test(text)) return true;
  return false;
}

function extractJsonFieldLines(text: string): string[] {
  const lines: string[] = [];
  const fieldMatches = Array.from(
    text.matchAll(/"(summary|message|status|statusUpdate|progress|content)"\s*:\s*"((?:\\.|[^"\\])*)"/gi),
  );

  for (const match of fieldMatches) {
    const decoded = decodeJsonString(match[2] ?? '')
      .replace(/\\n/g, '\n')
      .split(/\r?\n/)
      .map(line => compactWhitespace(line))
      .filter(Boolean);
    lines.push(...decoded);
  }

  return lines;
}

function normalizeProgressCandidates(text: string): string[] {
  const normalized = text
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
  if (!normalized) return [];

  const candidates = [
    ...extractJsonFieldLines(normalized),
    ...normalized.split(/\r?\n/),
  ];

  const cleaned: string[] = [];
  for (const candidate of candidates) {
    const line = compactWhitespace(
      candidate
        .replace(/^[,.;:，。；："'`]+/, '')
        .replace(/[,.;:，。；："'`]+$/, ''),
    );
    if (!line || isLikelyNoise(line)) continue;
    cleaned.push(trimProgressLine(line));
  }

  return cleaned;
}

export function extractProgressLines(text: string): string[] {
  const unique: string[] = [];
  for (const line of normalizeProgressCandidates(text)) {
    if (!unique.includes(line)) unique.push(line);
  }
  return unique;
}

export function resolvePreferredActiveRole(activeRoles: readonly AgentRole[]): AgentRole | null {
  if (activeRoles.length === 0) return null;
  return activeRoles.find((role) => role !== 'writing-assistant') ?? activeRoles[0] ?? null;
}

export function mergeRecentProgressLines(sources: readonly string[][], maxLines = 4): string[] {
  const merged: string[] = [];

  for (const group of sources) {
    for (const line of group) {
      if (!line || merged.includes(line)) continue;
      merged.push(line);
    }
  }

  return merged.slice(-maxLines);
}
