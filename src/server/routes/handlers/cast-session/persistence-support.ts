import { v4 as uuidv4 } from 'uuid';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { CharacterProfile, CharacterRole, WorldEntry } from '../../../../novel/types.js';
import { dedupeStrings } from './slot-coverage.js';
import type { CastCharacterProposal } from './schemas.js';

export function buildCharacterFromProposal(
  proposal: CastCharacterProposal,
  timestamp: string,
): CharacterProfile {
  const cleanedName = proposal.name.trim();
  const aliases = dedupeStrings(proposal.aliases ?? []);
  const slotTag = proposal.slot?.trim() ? `slot:${proposal.slot.trim()}` : '';
  const tags = dedupeStrings([...(proposal.tags ?? []), 'cast-session', slotTag]);

  return {
    id: uuidv4(),
    name: cleanedName,
    aliases,
    role: proposal.role as CharacterRole,
    position: '',
    age: proposal.age?.trim() || undefined,
    gender: proposal.gender?.trim() || undefined,
    appearance: proposal.appearance?.trim() ?? '',
    personality: proposal.personality?.trim() ?? '',
    personalityTraits: [],
    speechStyle: proposal.speechStyle?.trim() ?? '',
    speechExamples: [],
    backstory: proposal.backstory?.trim() ?? '',
    motivation: proposal.motivation?.trim() ?? '',
    abilities: dedupeStrings(proposal.abilities ?? []),
    relationships: [],
    drives: {
      want: proposal.motivation?.trim() ?? '',
      need: '',
      taboo: [],
    },
    personalityModel: {
      traits: [],
      innerContradictions: [],
      moralBoundary: [],
    },
    speechDNA: {
      lexicon: [],
      tempo: 'mid',
      tone: [],
      tics: [],
    },
    ttsProfile: {
      baseVoice: 'default',
      prosodyRange: {
        rate: [0.9, 1.1],
        pitch: [-2, 2],
      },
      emotionMap: {},
    },
    arc: '',
    currentState: 'cast-session initialized',
    firstAppearance: proposal.firstAppearance,
    tags,
    voiceDesignStatus: 'none',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function tryIndexCharacter(
  novelMemory: NovelMemory | undefined,
  novelId: string,
  character: CharacterProfile,
): Promise<void> {
  if (!novelMemory) return;
  try {
    await novelMemory.indexCharacter(novelId, character);
  } catch {
    // no-op
  }
}

export async function tryIndexWorldEntry(
  novelMemory: NovelMemory | undefined,
  novelId: string,
  entry: WorldEntry,
): Promise<void> {
  if (!novelMemory) return;
  try {
    await novelMemory.indexWorldEntry(novelId, entry);
  } catch {
    // no-op
  }
}
