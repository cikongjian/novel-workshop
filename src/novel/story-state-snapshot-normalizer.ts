const FACTION_PHASES = new Set(['dormant', 'rising', 'peak', 'declining', 'collapsed']);
const RELATION_TYPES = new Set(['ally', 'neutral', 'rival', 'enemy', 'vassal', 'overlord']);
const THREAD_STATUSES = new Set(['active', 'climax', 'cooling']);

function clamp(value: unknown, min: number, max: number): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.max(min, Math.min(max, value));
}

function normalizeFactionPhase(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (FACTION_PHASES.has(value)) return value;
  if (value === 'active') return 'rising';
  if (value === 'inactive') return 'dormant';
  if (value === 'broken') return 'collapsed';
  if (value === 'stable') return 'peak';
  return value;
}

function normalizeRelationType(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (RELATION_TYPES.has(value)) return value;
  if (value === 'subordinate') return 'vassal';
  if (value === 'patron' || value === 'sponsor') return 'overlord';
  if (
    value === 'consumer'
    || value === 'customer'
    || value === 'supplier'
    || value === 'audience'
    || value === 'fan'
    || value === 'unknown'
    || value === 'inheritor'
    || value === 'legacy'
  ) return 'neutral';
  if (value === 'symbiotic' || value === 'partner' || value === 'cooperative' || value === 'collaborator' || value === 'alliance') return 'ally';
  if (value === 'dominant') return 'overlord';
  if (value === 'hostile' || value === 'victim' || value === 'hunter') return 'enemy';
  if (value === 'competing') return 'rival';
  if (value === 'negotiation' || value === 'indirect') return 'neutral';
  if (value.includes('negotiation') || value.includes('dependency')) return 'neutral';
  return 'neutral';
}

function normalizeThreadStatus(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (THREAD_STATUSES.has(value)) return value;
  if (value === 'simmering' || value === 'developing' || value === 'ongoing') return 'active';
  if (value === 'resolved' || value === 'settling') return 'cooling';
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeStoryStateSnapshotCandidate<T = unknown>(candidate: T): T {
  const root = asRecord(candidate);
  if (!root) return candidate;

  const characters = Array.isArray(root.characters) ? root.characters : [];
  characters.forEach((character, index) => {
    const characterRecord = asRecord(character);
    if (!characterRecord) return;
    if (typeof characterRecord.characterId !== 'string' || !characterRecord.characterId.trim()) {
      characterRecord.characterId = typeof characterRecord.name === 'string' && characterRecord.name.trim()
        ? characterRecord.name.trim()
        : `character-${index + 1}`;
    }
    const relationships = Array.isArray(characterRecord.relationshipChanges)
      ? characterRecord.relationshipChanges
      : [];
    for (const relationship of relationships) {
      const relationshipRecord = asRecord(relationship);
      const vector = asRecord(relationshipRecord?.vector);
      if (!vector) continue;
      vector.trust = clamp(vector.trust, -100, 100);
      vector.affection = clamp(vector.affection, -100, 100);
      vector.respect = clamp(vector.respect, -100, 100);
      vector.obligation = clamp(vector.obligation, 0, 100);
      vector.fear = clamp(vector.fear, 0, 100);
      vector.rivalry = clamp(vector.rivalry, 0, 100);
    }
  });

  const factions = Array.isArray(root.factions) ? root.factions : [];
  for (const faction of factions) {
    const factionRecord = asRecord(faction);
    if (!factionRecord) continue;
    factionRecord.phase = normalizeFactionPhase(factionRecord.phase);
    factionRecord.powerLevel = clamp(factionRecord.powerLevel, 0, 100);
    factionRecord.objectiveProgress = clamp(factionRecord.objectiveProgress, 0, 100);
    factionRecord.internalStability = clamp(factionRecord.internalStability, 0, 100);
    const relations = Array.isArray(factionRecord.relations) ? factionRecord.relations : [];
    for (const relation of relations) {
      const relationRecord = asRecord(relation);
      if (!relationRecord) continue;
      relationRecord.type = normalizeRelationType(relationRecord.type);
    }
  }

  const plot = asRecord(root.plot);
  const activeThreads = Array.isArray(plot?.activeThreads) ? plot.activeThreads : [];
  for (const thread of activeThreads) {
    const threadRecord = asRecord(thread);
    if (!threadRecord) continue;
    threadRecord.status = normalizeThreadStatus(threadRecord.status);
  }
  if (plot) {
    plot.tensionLevel = clamp(plot.tensionLevel, 0, 10);
    if (Array.isArray(plot.pendingForeshadowing)) {
      plot.pendingForeshadowing = plot.pendingForeshadowing.filter((item) => {
        const itemRecord = asRecord(item);
        return itemRecord?.urgency !== 'resolved';
      });
    }
  }

  return candidate;
}
