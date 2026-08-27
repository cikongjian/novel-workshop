import { parseJsonWithRepair } from '../utils/json-repair.js';

const SEPARATOR = '---STATE_SNAPSHOT---';
const EXCERPT_CHARS = 320;

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function extractFencedJson(value: string): string | null {
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(value);
  return match?.[1]?.trim() ?? null;
}

function extractBalancedObject(value: string): string | null {
  const start = value.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, i + 1);
      }
    }
  }

  return value.slice(start);
}

function repairJsonClosers(value: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') stack.push('}');
    if (ch === '[') stack.push(']');
    if ((ch === '}' || ch === ']') && stack[stack.length - 1] === ch) {
      stack.pop();
    }
  }

  return value.replace(/,\s*$/, '') + stack.reverse().join('');
}

function normalizeLikelyJsonPunctuation(value: string): string {
  return value
    .replace(/([\[,{:]\s*)[\u201c\u201d]/gu, '$1"')
    .replace(/[\u201c\u201d]\s*，/gu, '",')
    .replace(/[\u201c\u201d](\s*[,}\]])/gu, '"$1');
}

function normalizeBroadSmartQuotes(value: string): string {
  return value
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/"\s*，/gu, '",');
}

export function extractStoryStateSnapshotJson(rawContent: string): string | null {
  const separatorIdx = rawContent.indexOf(SEPARATOR);
  const candidate = separatorIdx >= 0
    ? rawContent.slice(separatorIdx + SEPARATOR.length)
    : rawContent;

  const fenced = extractFencedJson(candidate);
  if (fenced) return stripCodeFence(fenced);

  const balanced = extractBalancedObject(candidate);
  if (balanced) return stripCodeFence(balanced);

  return null;
}

export function parseStoryStateSnapshotCandidate<T = unknown>(rawContent: string): T | null {
  const json = extractStoryStateSnapshotJson(rawContent);
  if (!json) return null;
  const parsed = parseJsonWithRepair<T>(json);
  if (parsed) return parsed;

  const normalized = normalizeLikelyJsonPunctuation(json);
  if (normalized !== json) {
    const normalizedParsed = parseJsonWithRepair<T>(normalized);
    if (normalizedParsed) return normalizedParsed;
  }

  const broadNormalized = normalizeBroadSmartQuotes(json);
  if (broadNormalized !== normalized && broadNormalized !== json) {
    const broadParsed = parseJsonWithRepair<T>(broadNormalized);
    if (broadParsed) return broadParsed;
  }

  try {
    return JSON.parse(repairJsonClosers(broadNormalized)) as T;
  } catch {
    return null;
  }
}

export function buildStoryStateTrackerDiagnostic(params: {
  rawContent: string;
  chapterNumber: number;
  parsed: boolean;
  failureReason?: string;
}): {
  mode: 'observe';
  chapterNumber: number;
  parsed: boolean;
  outputChars: number;
  hasSeparator: boolean;
  hasFence: boolean;
  firstObjectOffset: number | null;
  extractedJsonChars?: number;
  failureReason?: string;
  headExcerpt?: string;
  tailExcerpt?: string;
  checkedAt: string;
} {
  const { rawContent, chapterNumber, parsed, failureReason } = params;
  const extracted = extractStoryStateSnapshotJson(rawContent);
  const firstObjectOffset = rawContent.indexOf('{');
  return {
    mode: 'observe',
    chapterNumber,
    parsed,
    outputChars: Array.from(rawContent).length,
    hasSeparator: rawContent.includes(SEPARATOR),
    hasFence: /```(?:json)?/i.test(rawContent),
    firstObjectOffset: firstObjectOffset >= 0 ? firstObjectOffset : null,
    extractedJsonChars: extracted ? Array.from(extracted).length : 0,
    failureReason,
    headExcerpt: rawContent.slice(0, EXCERPT_CHARS),
    tailExcerpt: rawContent.length > EXCERPT_CHARS
      ? rawContent.slice(Math.max(0, rawContent.length - EXCERPT_CHARS))
      : undefined,
    checkedAt: new Date().toISOString(),
  };
}
