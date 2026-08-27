import { v4 as uuidv4 } from 'uuid';
import { projectCharacterIdentityLabels } from './character-identity-labels.js';
import type { CharacterProfile, CharacterRole } from './types.js';

export function buildAutoExtractedCharacter(params: {
  name: string;
  chapterNumber?: number;
  role?: CharacterRole;
  sourceTag?: string;
  now?: string;
}): CharacterProfile {
  const timestamp = params.now ?? new Date().toISOString();
  const character: CharacterProfile = {
    id: uuidv4(),
    name: params.name.trim(),
    aliases: [],
    role: params.role ?? 'supporting',
    position: '',
    appearance: '',
    personality: '',
    personalityTraits: [],
    speechStyle: '',
    speechExamples: [],
    backstory: '',
    motivation: '',
    abilities: [],
    relationships: [],
    drives: { want: '', need: '', taboo: [] },
    personalityModel: { traits: [], innerContradictions: [], moralBoundary: [] },
    speechDNA: { lexicon: [], tempo: 'mid', tone: [], tics: [] },
    ttsProfile: {
      baseVoice: 'default',
      prosodyRange: { rate: [0.9, 1.1], pitch: [-2, 2] },
      emotionMap: {},
    },
    arc: '',
    currentState: params.chapterNumber
      ? `auto-extracted from chapter ${params.chapterNumber}`
      : '',
    firstAppearance: params.chapterNumber,
    tags: ['auto-extracted', params.sourceTag ?? 'candidate-approved'],
    voiceDesignStatus: 'none',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  character.identityLabels = projectCharacterIdentityLabels(character);
  return character;
}
