import type { WorldEntry } from '../../../novel/types.js';
import { normalizeFactionNameForCurate, sanitizeCuratedFactionEntries } from '../../../utils/curate-faction-utils.js';
import { replaceWorldCategoryEntries } from '../../../utils/curate-shared.js';
import type { GenerateDeps } from './types.js';
import { CuratedFactionItem } from './world-schemas.js';
import { z } from 'zod';

type CuratedFactionSeed = z.infer<typeof CuratedFactionItem>;

export async function replaceFactionEntries(params: {
  novelId: string;
  novelManager: GenerateDeps['novelManager'];
  nextFactionEntries: WorldEntry[];
  existingWorldEntries: WorldEntry[];
}): Promise<void> {
  const { existingWorldEntries, nextFactionEntries, novelId, novelManager } = params;
  await replaceWorldCategoryEntries({
    novelId,
    novelManager,
    category: 'faction',
    nextCategoryEntries: nextFactionEntries,
    existingWorldEntries,
  });
}

export function applyFactionFallbackProtection(params: {
  factionEntries: WorldEntry[];
  sanitizedEntries: WorldEntry[];
  maxItems: number;
}): {
  sanitizedEntries: WorldEntry[];
  fallbackApplied: boolean;
} {
  const minFinalKeep = params.factionEntries.length <= 6
    ? 1
    : Math.max(6, Math.ceil(params.factionEntries.length * 0.45));
  if (!(params.factionEntries.length > 0 && params.sanitizedEntries.length > 0 && params.sanitizedEntries.length < minFinalKeep)) {
    return {
      sanitizedEntries: params.sanitizedEntries,
      fallbackApplied: false,
    };
  }

  const merged = [...params.sanitizedEntries];
  const seen = new Set(merged.map(item => normalizeFactionNameForCurate(item.name)));
  const sortedExisting = [...params.factionEntries].sort((a, b) => {
    const aScore = typeof a.qualityScore === 'number' ? a.qualityScore : 0;
    const bScore = typeof b.qualityScore === 'number' ? b.qualityScore : 0;
    if (aScore !== bScore) return bScore - aScore;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  for (const item of sortedExisting) {
    if (merged.length >= params.maxItems) break;
    const key = normalizeFactionNameForCurate(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return {
    sanitizedEntries: merged.slice(0, params.maxItems),
    fallbackApplied: true,
  };
}

export function sanitizeFactionEntriesWithFallback(params: {
  curated: CuratedFactionSeed[];
  factionEntries: WorldEntry[];
  worldEntries: WorldEntry[];
  maxItems: number;
}): {
  sanitizedEntries: WorldEntry[];
  fallbackApplied: boolean;
} {
  const sanitizedEntries = sanitizeCuratedFactionEntries({
    curated: params.curated,
    existingFaction: params.factionEntries,
    allEntries: params.worldEntries,
    maxItems: params.maxItems,
  });
  return applyFactionFallbackProtection({
    factionEntries: params.factionEntries,
    sanitizedEntries,
    maxItems: params.maxItems,
  });
}

export async function applyCuratedFactionEntries(params: {
  novelId: string;
  deps: GenerateDeps;
  worldEntries: WorldEntry[];
  entries: CuratedFactionSeed[];
  maxItems: number;
  summary: string;
}): Promise<{
  applied: true;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
}> {
  const factionEntries = params.worldEntries.filter(item => item.category === 'faction');
  const sanitizedEntries = sanitizeCuratedFactionEntries({
    curated: params.entries,
    existingFaction: factionEntries,
    allEntries: params.worldEntries,
    maxItems: params.maxItems,
  });
  if (sanitizedEntries.length === 0) {
    throw new Error('势力体系梳理结果为空，已拒绝覆盖原数据');
  }

  await replaceFactionEntries({
    novelId: params.novelId,
    novelManager: params.deps.novelManager,
    nextFactionEntries: sanitizedEntries,
    existingWorldEntries: params.worldEntries,
  });
  if (params.deps.novelMemory) {
    await Promise.all(sanitizedEntries.map(item =>
      params.deps.novelMemory!.indexWorldEntry(params.novelId, item).catch(() => {}),
    ));
  }

  return {
    applied: true,
    summary: params.summary,
    beforeCount: factionEntries.length,
    afterCount: sanitizedEntries.length,
    entries: sanitizedEntries,
  };
}
