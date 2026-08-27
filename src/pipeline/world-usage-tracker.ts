import type { WorldEntry } from '../novel/types.js';
import type { ChapterNarrativeAudit } from './narrative-audit.js';

const EFFECTIVE_USAGE_LEVELS = new Set(['constraint', 'conflict', 'cost']);

export type WorldUsageUpdate = {
  entry: WorldEntry;
  usageLevel: ChapterNarrativeAudit['worldMentions'][number]['usageLevel'];
};

function chapterTags(tags: string[]): Set<number> {
  const chapters = new Set<number>();
  for (const tag of tags) {
    const match = tag.match(/^chapter-(\d+)$/);
    if (!match) continue;
    const chapterNumber = Number.parseInt(match[1], 10);
    if (chapterNumber > 0) chapters.add(chapterNumber);
  }
  return chapters;
}

export function buildWorldUsageUpdates(params: {
  entries: WorldEntry[];
  audit: ChapterNarrativeAudit;
  chapterNumber: number;
  timestamp?: string;
}): WorldUsageUpdate[] {
  const effectiveUsageByName = new Map(
    params.audit.worldMentions
      .filter(mention => EFFECTIVE_USAGE_LEVELS.has(mention.usageLevel)
        && (mention.usedAsConstraint || mention.usedAsConflict || mention.usedAsConsequence))
      .map(mention => [mention.name, mention.usageLevel] as const),
  );
  const chapterTag = `chapter-${params.chapterNumber}`;
  const timestamp = params.timestamp ?? new Date().toISOString();

  return params.entries.flatMap((entry) => {
    const usageLevel = effectiveUsageByName.get(entry.name);
    if (!usageLevel) return [];

    const usedChapters = chapterTags(entry.tags);
    const alreadyTracked = usedChapters.has(params.chapterNumber);
    usedChapters.add(params.chapterNumber);
    const tags = alreadyTracked ? entry.tags : [...entry.tags, chapterTag];
    const useCount = alreadyTracked
      ? Math.max(entry.useCount ?? 0, usedChapters.size)
      : Math.max(entry.useCount ?? 0, usedChapters.size - 1) + 1;

    return [{
      usageLevel,
      entry: {
        ...entry,
        tags,
        introducedIn: Math.min(entry.introducedIn ?? Number.POSITIVE_INFINITY, ...usedChapters),
        lastUsedIn: Math.max(entry.lastUsedIn ?? 0, params.chapterNumber),
        useCount,
        updatedAt: timestamp,
      },
    }];
  });
}

export async function persistWorldUsageUpdates(params: {
  entries: WorldEntry[];
  audit: ChapterNarrativeAudit;
  chapterNumber: number;
  saveEntry: (entry: WorldEntry) => Promise<void>;
  indexEntry?: (entry: WorldEntry) => Promise<void>;
}): Promise<WorldUsageUpdate[]> {
  const updates = buildWorldUsageUpdates(params);
  for (const update of updates) {
    await params.saveEntry(update.entry);
    await params.indexEntry?.(update.entry);
  }
  return updates;
}
