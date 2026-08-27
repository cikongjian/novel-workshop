import { randomUUID } from 'crypto';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import {
  normalizePowerParams,
  writePowerParamsToDetails,
} from '../../../../novel/power-params.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CharacterProfile, WorldEntry } from '../../../../novel/types.js';
import {
  buildCharacterFromProposal,
  dedupeStrings,
  normalizeNameKey,
  tryIndexCharacter,
  tryIndexWorldEntry,
  type CastProposal,
} from './route-support.js';

export function buildCharacterLookup(existingCharacters: CharacterProfile[]): Map<string, CharacterProfile> {
  const characterByNameKey = new Map<string, CharacterProfile>();
  for (const character of existingCharacters) {
    characterByNameKey.set(normalizeNameKey(character.name), character);
    for (const alias of character.aliases ?? []) {
      const key = normalizeNameKey(alias);
      if (!characterByNameKey.has(key)) {
        characterByNameKey.set(key, character);
      }
    }
  }
  return characterByNameKey;
}

export function dedupeCharacterProposals(proposal: CastProposal): CastProposal['characters'] {
  return proposal.characters.filter((item, idx, arr) => (
    arr.findIndex(candidate => normalizeNameKey(candidate.name) === normalizeNameKey(item.name)) === idx
  ));
}

export async function applyCharacterProposals(params: {
  novelId: string;
  timestamp: string;
  proposals: CastProposal['characters'];
  mode: 'append' | 'replace-duplicates';
  characterByNameKey: Map<string, CharacterProfile>;
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
}): Promise<{
  createdCharacters: CharacterProfile[];
  updatedCharacters: CharacterProfile[];
  skippedCharacters: string[];
}> {
  const { characterByNameKey, mode, novelId, novelManager, novelMemory, proposals, timestamp } = params;
  const createdCharacters: CharacterProfile[] = [];
  const updatedCharacters: CharacterProfile[] = [];
  const skippedCharacters: string[] = [];

  for (const charProposal of proposals) {
    const key = normalizeNameKey(charProposal.name);
    const existing = characterByNameKey.get(key);

    if (existing && mode === 'append') {
      skippedCharacters.push(charProposal.name.trim());
      continue;
    }

    if (existing && mode === 'replace-duplicates') {
      const updated: CharacterProfile = {
        ...existing,
        name: charProposal.name.trim(),
        aliases: dedupeStrings([...(existing.aliases ?? []), ...(charProposal.aliases ?? [])]),
        role: charProposal.role ?? existing.role,
        age: charProposal.age?.trim() || existing.age,
        gender: charProposal.gender?.trim() || existing.gender,
        appearance: charProposal.appearance?.trim() ?? existing.appearance,
        personality: charProposal.personality?.trim() ?? existing.personality,
        backstory: charProposal.backstory?.trim() ?? existing.backstory,
        motivation: charProposal.motivation?.trim() ?? existing.motivation,
        abilities: dedupeStrings([...(existing.abilities ?? []), ...(charProposal.abilities ?? [])]),
        speechStyle: charProposal.speechStyle?.trim() ?? existing.speechStyle,
        firstAppearance: charProposal.firstAppearance ?? existing.firstAppearance,
        tags: dedupeStrings([
          ...(existing.tags ?? []),
          ...(charProposal.tags ?? []),
          charProposal.slot?.trim() ? `slot:${charProposal.slot.trim()}` : '',
          'cast-session',
        ]),
        updatedAt: timestamp,
      };

      await novelManager.saveCharacter(novelId, updated);
      await tryIndexCharacter(novelMemory, novelId, updated);
      updatedCharacters.push(updated);
      characterByNameKey.set(key, updated);
      continue;
    }

    const created = buildCharacterFromProposal(charProposal, timestamp);
    await novelManager.saveCharacter(novelId, created);
    await tryIndexCharacter(novelMemory, novelId, created);
    createdCharacters.push(created);
    characterByNameKey.set(key, created);
    for (const alias of created.aliases) {
      const aliasKey = normalizeNameKey(alias);
      if (!characterByNameKey.has(aliasKey)) {
        characterByNameKey.set(aliasKey, created);
      }
    }
  }

  return {
    createdCharacters,
    updatedCharacters,
    skippedCharacters,
  };
}

export async function applyPowerSystemProposals(params: {
  novelId: string;
  timestamp: string;
  proposals: CastProposal['powerSystem'];
  mode: 'append' | 'replace-duplicates';
  existingWorldEntries: WorldEntry[];
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
}): Promise<{
  createdPowerEntries: WorldEntry[];
  updatedPowerEntries: WorldEntry[];
  skippedPowerEntries: string[];
}> {
  const worldPowerByNameKey = new Map<string, WorldEntry>();
  for (const entry of params.existingWorldEntries) {
    if (entry.category !== 'power') continue;
    worldPowerByNameKey.set(normalizeNameKey(entry.name), entry);
  }

  const createdPowerEntries: WorldEntry[] = [];
  const updatedPowerEntries: WorldEntry[] = [];
  const skippedPowerEntries: string[] = [];

  for (const powerProposal of params.proposals) {
    const key = normalizeNameKey(powerProposal.name);
    const existing = worldPowerByNameKey.get(key);
    const powerParams = normalizePowerParams(powerProposal.parameters);

    if (existing && params.mode === 'append') {
      skippedPowerEntries.push(powerProposal.name.trim());
      continue;
    }

    if (existing && params.mode === 'replace-duplicates') {
      const updated: WorldEntry = {
        ...existing,
        name: powerProposal.name.trim(),
        category: 'power',
        description: powerProposal.description.trim(),
        constraints: dedupeStrings(powerProposal.constraints ?? []),
        consequences: dedupeStrings(powerProposal.consequences ?? []),
        details: writePowerParamsToDetails(existing.details ?? {}, powerParams),
        tags: dedupeStrings([
          ...(existing.tags ?? []),
          ...(powerProposal.tags ?? []),
          powerParams ? 'power-v2' : '',
          'cast-session',
        ]),
        source: 'manual',
        updatedAt: params.timestamp,
      };
      await params.novelManager.saveWorldEntry(params.novelId, updated);
      await tryIndexWorldEntry(params.novelMemory, params.novelId, updated);
      updatedPowerEntries.push(updated);
      worldPowerByNameKey.set(key, updated);
      continue;
    }

    const created: WorldEntry = {
      id: randomUUID(),
      category: 'power',
      name: powerProposal.name.trim(),
      description: powerProposal.description.trim(),
      constraints: dedupeStrings(powerProposal.constraints ?? []),
      consequences: dedupeStrings(powerProposal.consequences ?? []),
      details: writePowerParamsToDetails({}, powerParams),
      relatedEntries: [],
      dependencies: [],
      conflicts: [],
      tags: dedupeStrings([
        ...(powerProposal.tags ?? []),
        powerParams ? 'power-v2' : '',
        'cast-session',
      ]),
      source: 'manual',
      createdAt: params.timestamp,
      updatedAt: params.timestamp,
    };
    await params.novelManager.saveWorldEntry(params.novelId, created);
    await tryIndexWorldEntry(params.novelMemory, params.novelId, created);
    createdPowerEntries.push(created);
    worldPowerByNameKey.set(key, created);
  }

  return {
    createdPowerEntries,
    updatedPowerEntries,
    skippedPowerEntries,
  };
}

export async function applyRelationshipSeeds(params: {
  novelId: string;
  timestamp: string;
  proposal: CastProposal;
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
}): Promise<number> {
  if (params.proposal.relationshipSeeds.length === 0) {
    return 0;
  }

  const latestCharacters = await params.novelManager.getCharacters(params.novelId);
  const latestMapByName = new Map<string, CharacterProfile>();
  for (const character of latestCharacters) {
    latestMapByName.set(normalizeNameKey(character.name), character);
    for (const alias of character.aliases ?? []) {
      const aliasKey = normalizeNameKey(alias);
      if (!latestMapByName.has(aliasKey)) {
        latestMapByName.set(aliasKey, character);
      }
    }
  }

  let relationshipApplied = 0;
  const patchedById = new Map<string, CharacterProfile>();
  for (const seed of params.proposal.relationshipSeeds) {
    const from = latestMapByName.get(normalizeNameKey(seed.from));
    const to = latestMapByName.get(normalizeNameKey(seed.to));
    if (!from || !to || from.id === to.id) continue;

    const base = patchedById.get(from.id) ?? { ...from };
    const relType = seed.type.trim();
    if (!relType) continue;
    const exists = base.relationships.some(rel => rel.targetId === to.id && rel.type === relType);
    if (exists) continue;

    base.relationships = [
      ...base.relationships,
      {
        targetId: to.id,
        type: relType,
        description: seed.description?.trim() ?? '',
      },
    ];
    base.updatedAt = params.timestamp;
    patchedById.set(from.id, base);
    relationshipApplied += 1;
  }

  for (const patched of patchedById.values()) {
    await params.novelManager.saveCharacter(params.novelId, patched);
    await tryIndexCharacter(params.novelMemory, params.novelId, patched);
  }

  return relationshipApplied;
}
