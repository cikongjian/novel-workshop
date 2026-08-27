import { http } from './http';
import type { CharacterProfile, CharacterRole } from '../types';

export type PendingCharacterCandidate = {
  name: string;
  firstDetectedIn: number;
  lastDetectedIn: number;
  hitCount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export type CastSessionCharacterProposal = {
  name: string;
  aliases?: string[];
  role: CharacterRole;
  age?: string;
  gender?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  motivation?: string;
  abilities?: string[];
  speechStyle?: string;
  tags?: string[];
  firstAppearance?: number;
  slot?: string;
};

export type CastSessionPowerParameters = {
  systemType?: string;
  tierNames?: string[];
  maxTier?: number;
  resourceName?: string;
  recoveryPerChapter?: string;
  defaultCost?: string;
  cooldownRule?: string;
  riskRule?: string;
  breakthroughRule?: string;
  forbiddenActions?: string[];
  keyVerbs?: string[];
};

export type CastSessionPowerProposal = {
  name: string;
  description: string;
  constraints?: string[];
  consequences?: string[];
  tags?: string[];
  parameters?: CastSessionPowerParameters;
};

export type CastSessionRelationshipSeed = {
  from: string;
  to: string;
  type: string;
  description?: string;
};

export type CastSessionProposal = {
  characters: CastSessionCharacterProposal[];
  powerSystem: CastSessionPowerProposal[];
  relationshipSeeds: CastSessionRelationshipSeed[];
};

export type CastSessionSlot = {
  key: string;
  role: CharacterRole;
  required?: boolean;
  expectedCount?: number;
  fixedNames?: string[];
  description?: string;
};

export type CastSessionSlotCoverageItem = {
  key: string;
  role: CharacterRole;
  required: boolean;
  expectedCount: number;
  matchedCount: number;
  matchedCharacters: string[];
};

export type CastSessionSlotCoverage = {
  passed: boolean;
  missingRequired: string[];
  slots: CastSessionSlotCoverageItem[];
  summary: string;
};

export type CharacterEvent = {
  id: string;
  characterId: string;
  chapterNumber: number;
  summary: string;
  type: 'action' | 'encounter' | 'relationship' | 'revelation' | 'achievement' | 'loss';
  relatedCharacterIds: string[];
  importance: number;
  createdAt: string;
};

export async function fetchCharacters(novelId: string): Promise<CharacterProfile[]> {
  const { data } = await http.get<CharacterProfile[]>(`/novels/${novelId}/characters`);
  return data;
}

export async function fetchPendingCharacterCandidates(novelId: string): Promise<PendingCharacterCandidate[]> {
  const { data } = await http.get<PendingCharacterCandidate[]>(`/novels/${novelId}/characters/pending-candidates`);
  return data;
}

export async function approvePendingCharacterCandidates(
  novelId: string,
  params?: {
    names?: string[];
    role?: CharacterRole;
  },
): Promise<{
  approvedCount: number;
  skippedExistingCount: number;
  missingCount: number;
  approvedCharacters: CharacterProfile[];
  skippedExisting: string[];
  missingNames: string[];
  pendingCandidates: PendingCharacterCandidate[];
}> {
  const { data } = await http.post(`/novels/${novelId}/characters/pending-candidates/approve`, params ?? {});
  return data;
}

export async function rejectPendingCharacterCandidates(
  novelId: string,
  params?: { names?: string[] },
): Promise<{
  rejectedCount: number;
  rejectedNames: string[];
  pendingCandidates: PendingCharacterCandidate[];
}> {
  const { data } = await http.post(`/novels/${novelId}/characters/pending-candidates/reject`, params ?? {});
  return data;
}

export async function createCharacter(
  novelId: string,
  params: Omit<CharacterProfile, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<CharacterProfile> {
  const { data } = await http.post<CharacterProfile>(`/novels/${novelId}/characters`, params);
  return data;
}

export async function updateCharacter(
  novelId: string,
  characterId: string,
  params: Partial<CharacterProfile>,
): Promise<CharacterProfile> {
  const { data } = await http.put<CharacterProfile>(`/novels/${novelId}/characters/${characterId}`, params);
  return data;
}

export async function deleteCharacter(novelId: string, characterId: string): Promise<void> {
  await http.delete(`/novels/${novelId}/characters/${characterId}`);
}

export async function mergeCharacters(
  novelId: string,
  params: { sourceCharacterId: string; targetCharacterId: string }
): Promise<{
  success: boolean;
  message: string;
  targetCharacter: CharacterProfile;
  mergedAliases: string[];
}> {
  const { data } = await http.post(`/novels/${novelId}/characters/merge`, params);
  return data;
}

export async function batchMergeCharacters(
  novelId: string,
  groups: { ids: string[]; names: string[] }[]
): Promise<{
  success: boolean;
  message: string;
  results: { targetName: string; mergedNames: string[] }[];
}> {
  const { data } = await http.post(`/novels/${novelId}/characters/batch-merge`, { groups });
  return data;
}

export async function detectDuplicateCharacters(
  novelId: string
): Promise<{
  groups: { ids: string[]; names: string[]; reason: string }[];
}> {
  const { data } = await http.post(`/novels/${novelId}/characters/detect-duplicates`);
  return data;
}

export async function backfillCharacterTTS(novelId: string, force = false): Promise<{
  updated: number;
  message: string;
}> {
  const url = force
    ? `/novels/${novelId}/characters/backfill-tts?force=true`
    : `/novels/${novelId}/characters/backfill-tts`;
  const { data } = await http.post<{ updated: number; message: string }>(
    url,
    {},
    { timeout: 120000 },
  );
  return data;
}

export async function backfillCharacterPosition(novelId: string, force = false, characterIds?: string[]): Promise<{
  updated: number;
  message: string;
}> {
  const url = force
    ? `/novels/${novelId}/characters/backfill-position?force=true`
    : `/novels/${novelId}/characters/backfill-position`;
  const { data } = await http.post<{ updated: number; message: string }>(
    url,
    characterIds?.length ? { characterIds } : {},
    { timeout: 120000 },
  );
  return data;
}

export async function proposeCastSession(
  novelId: string,
  params: {
    conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxCharacters?: number;
    focus?: 'roles-only' | 'roles-and-power';
    slots?: CastSessionSlot[];
  },
): Promise<{
  proposal: CastSessionProposal;
  slotsUsed: CastSessionSlot[];
  slotCoverage: CastSessionSlotCoverage;
  model: string;
  usage?: unknown;
}> {
  const { data } = await http.post(`/novels/${novelId}/cast-session/propose`, params, { timeout: 120000 });
  return data;
}

export async function confirmCastSession(
  novelId: string,
  params: {
    proposal: CastSessionProposal;
    mode?: 'append' | 'replace-duplicates';
    slots?: CastSessionSlot[];
  },
): Promise<{
  slotsUsed: CastSessionSlot[];
  slotCoverage: CastSessionSlotCoverage;
  characterResult: {
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    skippedNames: string[];
  };
  powerResult: {
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    skippedNames: string[];
  };
  relationshipResult: {
    appliedCount: number;
  };
}> {
  const { data } = await http.post(`/novels/${novelId}/cast-session/confirm`, params, { timeout: 120000 });
  return data;
}

export async function fetchCharacterEvents(novelId: string, characterId?: string): Promise<CharacterEvent[]> {
  const params: Record<string, string> = {};
  if (characterId) params.characterId = characterId;
  const { data } = await http.get(`/novels/${novelId}/character-events`, { params });
  return data;
}

/** AI 润色人物介绍的结果 */
export type PolishIntroResult = {
  introParagraph: string;
  oneLiner: string;
  polishedFields: {
    personality?: string;
    backstory?: string;
    motivation?: string;
    appearance?: string;
    publicPersona?: string;
    privatePersona?: string;
    reputation?: string;
    speechStyle?: string;
    worldview?: string;
  };
  suggestedTags: string[];
};

/** 请求 AI 润色指定角色的人物介绍 */
export async function polishCharacterIntro(
  novelId: string,
  characterId: string,
): Promise<PolishIntroResult> {
  const { data } = await http.post<PolishIntroResult>(
    `/novels/${novelId}/characters/${characterId}/polish-intro`,
    {},
    { timeout: 120000 },
  );
  return data;
}
