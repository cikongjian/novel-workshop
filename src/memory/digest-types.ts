import { jsonrepair } from 'jsonrepair';

export type ChapterDigest = {
  plotSummary: string;
  keyEvents: string[];
  characterStateChanges: Array<{
    name: string;
    change: string;
  }>;
  worldStateChanges: Array<{
    entity: string;
    change: string;
  }>;
  unresolvedThreads: string[];
  causalLinks: Array<{
    fromChapter: number;
    event: string;
    effect: string;
  }>;
};

/**
 * 解析 Agent 原始输出为 ChapterDigest。
 * 兼容 markdown 代码块包裹、前后缀文本和少量常见字段别名。
 */
export function parseChapterDigest(raw: string): ChapterDigest | null {
  let jsonStr = raw.trim();

  // 去除 markdown 代码块
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const extracted = extractFirstJsonObject(jsonStr) ?? extractUnclosedJsonObjectCandidate(jsonStr);
  if (!extracted) {
    return null;
  }
  jsonStr = extracted;

  try {
    const parsed = parseDigestJsonObject(jsonStr);
    return {
      plotSummary: readString(parsed, ['plotSummary', 'summary', 'plot', 'plot_summary', '剧情摘要', '摘要']),
      keyEvents: readStringArray(parsed, ['keyEvents', 'events', 'key_events', '关键事件']),
      characterStateChanges: readObjectArray(parsed, ['characterStateChanges', 'characterChanges', 'characters', '角色状态变化'])
        .map(normalizeCharacterChange)
        .filter((item): item is ChapterDigest['characterStateChanges'][number] => Boolean(item)),
      worldStateChanges: readObjectArray(parsed, ['worldStateChanges', 'worldChanges', 'world', '世界状态变化'])
        .map(normalizeWorldChange)
        .filter((item): item is ChapterDigest['worldStateChanges'][number] => Boolean(item)),
      unresolvedThreads: readStringArray(parsed, ['unresolvedThreads', 'threads', 'openThreads', '悬念']),
      causalLinks: readObjectArray(parsed, ['causalLinks', 'causality', 'links', '因果链'])
        .map(normalizeCausalLink)
        .filter((item): item is ChapterDigest['causalLinks'][number] => Boolean(item)),
    };
  } catch {
    return null;
  }
}

function parseDigestJsonObject(jsonStr: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // 尝试用 jsonrepair 兜底修复模型输出的尾逗号、单引号、裸 key 等常见问题。
  }

  const repaired = JSON.parse(jsonrepair(jsonStr));
  if (!isRecord(repaired)) {
    throw new Error('chapter digest json is not an object');
  }
  return repaired;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractUnclosedJsonObjectCandidate(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) {
    return null;
  }

  const candidate = text.slice(start).trim();
  if (!candidate.startsWith('{')) {
    return null;
  }
  return candidate;
}

function readString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function readStringArray(source: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
  }
  return [];
}

function readObjectArray(source: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCharacterChange(item: Record<string, unknown>): ChapterDigest['characterStateChanges'][number] | null {
  const name = readString(item, ['name', 'character', 'role', '角色', '人物']);
  const change = readString(item, ['change', 'stateChange', 'status', '变化']);
  return name ? { name, change } : null;
}

function normalizeWorldChange(item: Record<string, unknown>): ChapterDigest['worldStateChanges'][number] | null {
  const entity = readString(item, ['entity', 'name', 'target', '地点/势力/物品名', '实体']);
  const change = readString(item, ['change', 'stateChange', 'status', '变化']);
  return entity ? { entity, change } : null;
}

function normalizeCausalLink(item: Record<string, unknown>): ChapterDigest['causalLinks'][number] | null {
  const event = readString(item, ['event', 'cause', '事件']);
  const effect = readString(item, ['effect', 'result', '影响']);
  const rawChapter = item.fromChapter ?? item.chapter ?? item['章节'];
  const fromChapter = typeof rawChapter === 'number'
    ? rawChapter
    : typeof rawChapter === 'string'
      ? Number.parseInt(rawChapter, 10)
      : 0;
  return effect ? {
    fromChapter: Number.isFinite(fromChapter) ? fromChapter : 0,
    event,
    effect,
  } : null;
}
