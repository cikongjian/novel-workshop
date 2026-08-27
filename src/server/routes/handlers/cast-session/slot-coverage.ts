import type { CharacterProfile, CharacterRole } from '../../../../novel/types.js';
import type { CastCharacterProposal, CastSlot } from './schemas.js';

export type SlotCoverageItem = {
  key: string;
  role: CharacterRole;
  required: boolean;
  expectedCount: number;
  matchedCount: number;
  matchedCharacters: string[];
};

export type SlotCoverageReport = {
  passed: boolean;
  missingRequired: string[];
  slots: SlotCoverageItem[];
  summary: string;
};

type SlotCandidate = {
  name: string;
  aliases: string[];
  role: CharacterRole;
  slot?: string;
};

export function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = normalizeNameKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function defaultCastSlots(): CastSlot[] {
  return [
    {
      key: '主角',
      role: 'protagonist',
      required: true,
      expectedCount: 1,
      description: '剧情核心视角角色',
    },
    {
      key: '核心反派',
      role: 'antagonist',
      required: true,
      expectedCount: 1,
      description: '主要对抗者',
    },
    {
      key: '关键盟友',
      role: 'ally',
      required: true,
      expectedCount: 1,
      description: '推动主线的关键辅助角色',
    },
  ];
}

export function normalizeCastSlots(input: CastSlot[] | undefined): CastSlot[] {
  const source = input && input.length > 0 ? input : defaultCastSlots();
  const slots: CastSlot[] = [];
  const seen = new Set<string>();
  for (const raw of source) {
    const key = raw.key.trim();
    if (!key) continue;
    const normalizedKey = normalizeNameKey(key);
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    slots.push({
      key,
      role: raw.role as CharacterRole,
      required: raw.required ?? true,
      expectedCount: raw.expectedCount ?? 1,
      fixedNames: dedupeStrings(raw.fixedNames ?? []),
      description: raw.description?.trim(),
    });
  }
  return slots.length > 0 ? slots : defaultCastSlots();
}

function normalizeSlotKey(value: string | undefined): string {
  return normalizeNameKey(value ?? '');
}

function toSlotCandidateFromCharacter(character: CharacterProfile): SlotCandidate {
  const slotTag = (character.tags ?? [])
    .find(tag => tag.toLowerCase().startsWith('slot:'))
    ?.slice('slot:'.length);
  return {
    name: character.name,
    aliases: [...(character.aliases ?? [])],
    role: character.role,
    slot: slotTag?.trim() || undefined,
  };
}

export function toSlotCandidateFromProposal(proposal: CastCharacterProposal): SlotCandidate {
  return {
    name: proposal.name.trim(),
    aliases: dedupeStrings(proposal.aliases ?? []),
    role: proposal.role as CharacterRole,
    slot: proposal.slot?.trim() || undefined,
  };
}

function isFixedNameMatch(candidate: SlotCandidate, slot: CastSlot): boolean {
  if (!slot.fixedNames || slot.fixedNames.length === 0) return false;
  const allNames = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeNameKey);
  const fixed = new Set(slot.fixedNames.map(normalizeNameKey));
  return allNames.some(name => fixed.has(name));
}

function doesCandidateMatchSlot(candidate: SlotCandidate, slot: CastSlot): boolean {
  const slotKey = normalizeSlotKey(slot.key);
  const candidateSlot = normalizeSlotKey(candidate.slot);
  if (candidateSlot && candidateSlot === slotKey) return true;
  if (slot.fixedNames && slot.fixedNames.length > 0) {
    return isFixedNameMatch(candidate, slot);
  }
  return candidate.role === slot.role;
}

export function evaluateSlotCoverage(
  slots: CastSlot[],
  candidates: SlotCandidate[],
): SlotCoverageReport {
  const coverage: SlotCoverageItem[] = slots.map((slot) => {
    const matched = candidates.filter(candidate => doesCandidateMatchSlot(candidate, slot));
    const matchedCharacters = dedupeStrings(matched.map(item => item.name));
    return {
      key: slot.key,
      role: slot.role as CharacterRole,
      required: slot.required ?? true,
      expectedCount: slot.expectedCount ?? 1,
      matchedCount: matchedCharacters.length,
      matchedCharacters,
    };
  });

  const missingRequired = coverage
    .filter(item => item.required && item.matchedCount < item.expectedCount)
    .map(item => item.key);

  const passed = missingRequired.length === 0;
  const summary = passed
    ? `关键角色槽位已覆盖（${coverage.length}）`
    : `缺失关键角色槽位：${missingRequired.join('、')}`;

  return {
    passed,
    missingRequired,
    slots: coverage,
    summary,
  };
}

export function buildProspectiveSlotCandidates(params: {
  existingCharacters: CharacterProfile[];
  proposals: CastCharacterProposal[];
  mode: 'append' | 'replace-duplicates';
}): SlotCandidate[] {
  const mapByCanonical = new Map<string, SlotCandidate>();
  const lookup = new Map<string, string>();
  for (const character of params.existingCharacters) {
    const candidate = toSlotCandidateFromCharacter(character);
    const canonical = normalizeNameKey(candidate.name);
    mapByCanonical.set(canonical, candidate);
    lookup.set(canonical, canonical);
    for (const alias of candidate.aliases) {
      lookup.set(normalizeNameKey(alias), canonical);
    }
  }

  for (const proposal of params.proposals) {
    const proposalCandidate = toSlotCandidateFromProposal(proposal);
    const proposalKey = normalizeNameKey(proposalCandidate.name);
    const canonical = lookup.get(proposalKey) ?? proposalKey;
    const existing = mapByCanonical.get(canonical);

    if (existing && params.mode === 'append') {
      continue;
    }

    if (existing && params.mode === 'replace-duplicates') {
      const merged: SlotCandidate = {
        ...existing,
        name: proposalCandidate.name || existing.name,
        role: proposalCandidate.role || existing.role,
        slot: proposalCandidate.slot || existing.slot,
        aliases: dedupeStrings([...(existing.aliases ?? []), ...(proposalCandidate.aliases ?? [])]),
      };
      mapByCanonical.set(canonical, merged);
      lookup.set(normalizeNameKey(merged.name), canonical);
      for (const alias of merged.aliases) {
        lookup.set(normalizeNameKey(alias), canonical);
      }
      continue;
    }

    mapByCanonical.set(canonical, proposalCandidate);
    lookup.set(normalizeNameKey(proposalCandidate.name), canonical);
    for (const alias of proposalCandidate.aliases) {
      lookup.set(normalizeNameKey(alias), canonical);
    }
  }

  return [...mapByCanonical.values()];
}
