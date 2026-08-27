import type { CharacterGrowthMilestone } from '../novel/types.js';

type ChapterHistoryEntry = {
  chapter: number;
  text: string;
};

const CHAPTER_ENTRY_RE = /\[第(\d+)章\][\s\S]*?(?=\s*\[第\d+章\]|$)/gu;

function normalizeText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\r\n?/gu, '\n').trim()
    : '';
}

function parseChapterHistory(value: unknown): {
  prefix: string[];
  entries: ChapterHistoryEntry[];
} {
  const text = normalizeText(value);
  if (!text) return { prefix: [], entries: [] };

  const entries: ChapterHistoryEntry[] = [];
  let firstEntryIndex = -1;
  for (const match of text.matchAll(CHAPTER_ENTRY_RE)) {
    if (firstEntryIndex < 0) firstEntryIndex = match.index ?? 0;
    entries.push({
      chapter: Number(match[1]),
      text: match[0].trim(),
    });
  }

  const prefixText = firstEntryIndex >= 0 ? text.slice(0, firstEntryIndex).trim() : text;
  const prefix = prefixText
    ? prefixText.split('\n').map(line => line.trim()).filter(Boolean)
    : [];
  return { prefix, entries };
}

function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.map(line => line.trim()).filter(Boolean))];
}

/**
 * 合并逐章状态：历史中每章只保留一个最新条目，重复定稿时替换同章状态。
 * 若 Agent 回传了整段历史，仅采用其中最新章节，避免旧历史被再次灌入。
 */
export function mergeChapterHistory(existing: unknown, incoming: unknown): string {
  const current = parseChapterHistory(existing);
  const next = parseChapterHistory(incoming);
  const byChapter = new Map<number, string>();

  for (const entry of current.entries) {
    byChapter.set(entry.chapter, entry.text);
  }

  if (next.entries.length > 0) {
    const latestChapter = Math.max(...next.entries.map(entry => entry.chapter));
    const latestEntry = [...next.entries].reverse().find(entry => entry.chapter === latestChapter);
    if (latestEntry) byChapter.set(latestChapter, latestEntry.text);
  }

  const unversioned = uniqueLines([
    ...current.prefix,
    ...(next.entries.length === 0 ? next.prefix : []),
  ]);
  const history = [...byChapter.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, text]) => text);

  return [...unversioned, ...history].join('\n').trim();
}

/** 合并自由文本列表，避免相同内容在重复定稿时持续追加。 */
export function mergeDistinctText(existing: unknown, incoming: unknown): string {
  return uniqueLines([
    ...normalizeText(existing).split('\n'),
    ...normalizeText(incoming).split('\n'),
  ]).join('\n');
}

/** 每个角色每章只保留一个成长里程碑，重新定稿时以最新结果替换。 */
export function mergeGrowthMilestones(
  existing: CharacterGrowthMilestone[] | undefined,
  incoming: CharacterGrowthMilestone[] | undefined,
): CharacterGrowthMilestone[] {
  const byChapter = new Map<number, CharacterGrowthMilestone>();
  for (const milestone of existing ?? []) {
    byChapter.set(milestone.chapter, milestone);
  }
  for (const milestone of incoming ?? []) {
    byChapter.set(milestone.chapter, milestone);
  }
  return [...byChapter.values()].sort((left, right) => left.chapter - right.chapter);
}

/** 归档摘要以分号为边界去重，避免里程碑归档重复膨胀。 */
export function mergeArchivedMilestoneSummary(existing: unknown, incoming: unknown): string {
  const segments = [normalizeText(existing), normalizeText(incoming)]
    .flatMap(value => value.split(/[;；]/u))
    .map(value => value.trim())
    .filter(Boolean);
  return [...new Set(segments)].join('; ');
}
