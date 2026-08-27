import type { WorldEntry, WorldEntrySource } from './types.js';

const NUMBER_PREFIX_RE = /^\s*(?:[-*•]\s*)?(?:(?:\d+|[①②③④⑤⑥⑦⑧⑨⑩])[\.、:：\s]+)+/;
const MARKDOWN_PREFIX_RE = /^\s*#{1,6}\s*/;
const MARKDOWN_INLINE_RE = /(\*\*|__|`|~~|\[|\]|\(|\))/g;
const MULTI_SPACE_RE = /\s+/g;
const INVALID_SYMBOL_RE = /[*#`[\]{}<>]/;
const GENERIC_NAME_RE = /(场景环境|背景知识|一致性检查|新增设定建议|适用规则)/;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export function sanitizeWorldEntryName(rawName: string): string {
  let name = rawName.trim();
  name = name.replace(MARKDOWN_PREFIX_RE, '');
  name = name.replace(NUMBER_PREFIX_RE, '');
  name = name.replace(MARKDOWN_INLINE_RE, '');
  name = name.replace(/^[："“”"'`]+|[："“”"'`]+$/g, '');
  name = name.replace(/\s*[-:：]\s*$/, '');
  name = name.replace(MULTI_SPACE_RE, ' ').trim();
  if (name.length > 48) {
    name = name.slice(0, 48).trim();
  }
  return name;
}

export function isDirtyWorldEntryName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (trimmed.length > 48) return true;
  if (NUMBER_PREFIX_RE.test(trimmed)) return true;
  if (MARKDOWN_PREFIX_RE.test(trimmed)) return true;
  if (INVALID_SYMBOL_RE.test(trimmed)) return true;
  if (GENERIC_NAME_RE.test(trimmed)) return true;
  return false;
}

function parseChapterTags(tags: string[]): number[] {
  const chapters: number[] = [];
  for (const tag of tags) {
    const match = tag.match(/^chapter-(\d+)$/);
    if (!match) continue;
    const chapter = Number.parseInt(match[1], 10);
    if (Number.isFinite(chapter) && chapter > 0) {
      chapters.push(chapter);
    }
  }
  return chapters;
}

function inferSource(tags: string[]): WorldEntrySource {
  if (tags.includes('auto-generated')) return 'auto-generated';
  if (tags.includes('auto-extracted')) return 'auto-extracted';
  if (tags.includes('merged')) return 'merged';
  return 'manual';
}

function calculateWorldEntryQualityScore(entry: WorldEntry): number {
  const name = entry.name.trim();
  const descriptionLen = entry.description.trim().length;
  const relatedCount = entry.relatedEntries.length;

  let nameScore = 1;
  if (name.length < 2) nameScore = 0.1;
  else if (name.length > 24) nameScore = 0.65;
  else if (name.length > 16) nameScore = 0.8;
  if (isDirtyWorldEntryName(name)) nameScore *= 0.35;

  let descriptionScore = 1;
  if (descriptionLen < 20) descriptionScore = 0.2;
  else if (descriptionLen < 60) descriptionScore = 0.6;
  else if (descriptionLen > 1200) descriptionScore = 0.55;

  const categoryScore = entry.category === 'other' ? 0.65 : 1;
  const relationScore = clamp01(relatedCount / 3);

  const source = entry.source ?? inferSource(entry.tags);
  const sourceScore = source === 'manual' ? 1 : source === 'merged' ? 0.92 : 0.82;

  const score = (
    nameScore * 0.35 +
    descriptionScore * 0.3 +
    categoryScore * 0.15 +
    relationScore * 0.1 +
    sourceScore * 0.1
  );
  return Number(clamp01(score).toFixed(3));
}

export function normalizeWorldEntry(entry: WorldEntry): WorldEntry {
  const cleanedName = sanitizeWorldEntryName(entry.name);
  const tags = unique(entry.tags.slice());
  const aliases = entry.aliases ? entry.aliases.slice() : [];

  if (cleanedName && cleanedName !== entry.name.trim() && !aliases.includes(entry.name.trim())) {
    aliases.push(entry.name.trim());
  }

  if (isDirtyWorldEntryName(entry.name) || cleanedName !== entry.name.trim()) {
    if (!tags.includes('dirty-name')) tags.push('dirty-name');
  } else {
    const dirtyIdx = tags.indexOf('dirty-name');
    if (dirtyIdx >= 0) tags.splice(dirtyIdx, 1);
  }

  const chapterTags = parseChapterTags(tags);
  const introducedIn = entry.introducedIn ?? (chapterTags.length > 0 ? Math.min(...chapterTags) : undefined);
  const lastUsedIn = entry.lastUsedIn ?? (chapterTags.length > 0 ? Math.max(...chapterTags) : introducedIn);
  const useCount = entry.useCount ?? (introducedIn ? Math.max(1, (lastUsedIn ?? introducedIn) - introducedIn + 1) : 0);

  const normalized: WorldEntry = {
    ...entry,
    name: cleanedName || entry.name.trim(),
    aliases: aliases.length > 0 ? unique(aliases) : undefined,
    source: entry.source ?? inferSource(tags),
    introducedIn,
    lastUsedIn,
    useCount,
    tags,
  };
  normalized.qualityScore = calculateWorldEntryQualityScore(normalized);
  return normalized;
}
