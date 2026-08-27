import type { WorldCategory, WorldEntry, WorldStoryRole } from '../novel/types.js';

const WORLD_CATEGORIES = new Set<WorldCategory>([
  'geography',
  'history',
  'faction',
  'power',
  'culture',
  'rule',
  'other',
]);

const WORLD_STORY_ROLES = new Set<WorldStoryRole>([
  'anchor',
  'conflict',
  'mystery',
  'resource',
  'constraint',
]);

export type WorldMergeAction = {
  action?: unknown;
  id?: unknown;
  name?: unknown;
  category?: unknown;
  description?: unknown;
  storyRole?: unknown;
  constraints?: unknown;
  consequences?: unknown;
  details?: unknown;
  geoType?: unknown;
  relatedNames?: unknown;
};

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getWorldMergeActionName(action: WorldMergeAction): string | undefined {
  return optionalString(action.name);
}

export function isFactionActionForKnownCharacter(
  action: WorldMergeAction,
  knownCharacterNames: ReadonlySet<string>,
): boolean {
  const name = getWorldMergeActionName(action);
  return Boolean(name && action.category === 'faction' && knownCharacterNames.has(name));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(optionalString).filter((item): item is string => Boolean(item))));
}

function normalizeDetails(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const details: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    if (typeof raw === 'string' && raw.trim()) {
      details[normalizedKey] = raw.trim();
    } else if (typeof raw === 'number' || typeof raw === 'boolean') {
      details[normalizedKey] = String(raw);
    }
  }
  return details;
}

function normalizeCategory(value: unknown, fallback: WorldCategory): WorldCategory {
  return typeof value === 'string' && WORLD_CATEGORIES.has(value as WorldCategory)
    ? value as WorldCategory
    : fallback;
}

function normalizeStoryRole(value: unknown): WorldStoryRole | undefined {
  return typeof value === 'string' && WORLD_STORY_ROLES.has(value as WorldStoryRole)
    ? value as WorldStoryRole
    : undefined;
}

function mergeStringArrays(existing: string[] | undefined, incoming: unknown): string[] | undefined {
  const merged = Array.from(new Set([...(existing ?? []), ...normalizeStringArray(incoming)]));
  return merged.length > 0 ? merged : undefined;
}

function buildMergedDetails(existing: WorldEntry, action: WorldMergeAction): Record<string, string> {
  const details = {
    ...existing.details,
    ...normalizeDetails(action.details),
  };
  const geoType = optionalString(action.geoType);
  const category = normalizeCategory(action.category, existing.category);
  if (geoType && category === 'geography') {
    details.type = geoType;
  }
  return details;
}

export function buildUpdatedWorldEntryFromMerge(
  existing: WorldEntry,
  action: WorldMergeAction,
  timestamp: string,
): WorldEntry {
  const isBaselineEntry = existing.baseline === true;
  const actionDescription = optionalString(action.description);
  const details = buildMergedDetails(existing, action);

  if (isBaselineEntry && actionDescription && actionDescription !== existing.description) {
    details.baselineAppendix = [existing.details.baselineAppendix, actionDescription]
      .filter(Boolean)
      .join('\n');
  }

  return {
    ...existing,
    name: isBaselineEntry ? existing.name : (optionalString(action.name) ?? existing.name),
    category: isBaselineEntry
      ? existing.category
      : normalizeCategory(action.category, existing.category),
    description: isBaselineEntry
      ? existing.description
      : (actionDescription ?? existing.description),
    storyRole: normalizeStoryRole(action.storyRole) ?? existing.storyRole,
    constraints: mergeStringArrays(existing.constraints, action.constraints),
    consequences: mergeStringArrays(existing.consequences, action.consequences),
    details,
    updatedAt: timestamp,
  };
}

export function buildCreatedWorldEntryFromMerge(
  action: WorldMergeAction,
  chapterNumber: number,
  timestamp: string,
  id: string,
): WorldEntry {
  const category = normalizeCategory(action.category, 'other');
  const details = normalizeDetails(action.details);
  const geoType = optionalString(action.geoType);
  if (geoType && category === 'geography') {
    details.type = geoType;
  }

  return {
    id,
    name: optionalString(action.name) ?? '未命名世界设定',
    category,
    description: optionalString(action.description) ?? '',
    storyRole: normalizeStoryRole(action.storyRole),
    constraints: mergeStringArrays(undefined, action.constraints),
    consequences: mergeStringArrays(undefined, action.consequences),
    details,
    dependencies: [],
    conflicts: [],
    relatedEntries: [],
    tags: ['auto-extracted', `chapter-${chapterNumber}`],
    source: 'auto-extracted',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
