import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { NovelManager, PendingCharacterCandidate } from '../../../../novel/novel-manager.js';
import type { CharacterProfile, CharacterRole } from '../../../../novel/types.js';
import { buildAutoExtractedCharacter } from '../../../../novel/character-profile-factory.js';

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = normalizeNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export function buildPendingCandidateCharacter(params: {
  name: string;
  chapterNumber?: number;
  role?: CharacterRole;
  now?: string;
}): CharacterProfile {
  return buildAutoExtractedCharacter(params);
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
    // 记忆索引失败不影响主流程
  }
}

export function resolvePendingCandidateTargetNames(params: {
  candidates: PendingCharacterCandidate[];
  names?: string[];
}): string[] {
  return dedupeNames(
    params.names && params.names.length > 0
      ? params.names
      : params.candidates.filter((item) => item.status === 'pending').map((item) => item.name),
  );
}

function buildExistingCharacterNameKeySet(characters: CharacterProfile[]): Set<string> {
  const result = new Set<string>();
  for (const character of characters) {
    result.add(normalizeNameKey(character.name));
    for (const alias of character.aliases ?? []) {
      result.add(normalizeNameKey(alias));
    }
  }
  return result;
}

export async function approvePendingCandidates(params: {
  novelId: string;
  novelManager: Pick<NovelManager, 'getCharacters' | 'saveCharacter' | 'markPendingCharacterCandidates'>;
  novelMemory?: NovelMemory;
  candidates: PendingCharacterCandidate[];
  targetNames: string[];
  role?: CharacterRole;
}): Promise<{
  approvedCharacters: CharacterProfile[];
  skippedExisting: string[];
  missingNames: string[];
  pendingCandidates: PendingCharacterCandidate[];
}> {
  const candidateByKey = new Map(params.candidates.map((item) => [normalizeNameKey(item.name), item]));
  const existingCharacters = await params.novelManager.getCharacters(params.novelId);
  const existingNameKeySet = buildExistingCharacterNameKeySet(existingCharacters);
  const approvedCharacters: CharacterProfile[] = [];
  const skippedExisting: string[] = [];
  const missingNames: string[] = [];
  const shouldMarkApproved: string[] = [];

  for (const targetName of params.targetNames) {
    const key = normalizeNameKey(targetName);
    const candidate = candidateByKey.get(key);
    if (!candidate) {
      missingNames.push(targetName);
      continue;
    }

    shouldMarkApproved.push(candidate.name);
    if (existingNameKeySet.has(key)) {
      skippedExisting.push(candidate.name);
      continue;
    }

    const character = buildPendingCandidateCharacter({
      name: candidate.name,
      chapterNumber: candidate.firstDetectedIn,
      role: params.role,
    });
    await params.novelManager.saveCharacter(params.novelId, character);
    await tryIndexCharacter(params.novelMemory, params.novelId, character);
    approvedCharacters.push(character);
    existingNameKeySet.add(key);
  }

  return {
    approvedCharacters,
    skippedExisting,
    missingNames,
    pendingCandidates: shouldMarkApproved.length > 0
      ? await params.novelManager.markPendingCharacterCandidates(
        params.novelId,
        dedupeNames(shouldMarkApproved),
        'approved',
      )
      : params.candidates,
  };
}

export async function rejectPendingCandidates(params: {
  novelId: string;
  novelManager: Pick<NovelManager, 'markPendingCharacterCandidates'>;
  candidates: PendingCharacterCandidate[];
  targetNames: string[];
}): Promise<{
  rejectedCount: number;
  rejectedNames: string[];
  pendingCandidates: PendingCharacterCandidate[];
}> {
  if (params.targetNames.length === 0) {
    return {
      rejectedCount: 0,
      rejectedNames: [],
      pendingCandidates: params.candidates,
    };
  }

  return {
    rejectedCount: params.targetNames.length,
    rejectedNames: params.targetNames,
    pendingCandidates: await params.novelManager.markPendingCharacterCandidates(
      params.novelId,
      params.targetNames,
      'rejected',
    ),
  };
}

export function isNotFoundLikeError(message: string): boolean {
  return message.includes('不存在') || message.includes('not found');
}
