import type { NovelMemory } from '../memory/novel-memory.js';
import { buildAutoExtractedCharacter } from '../novel/character-profile-factory.js';
import type { NovelManager, PendingCharacterCandidate } from '../novel/novel-manager.js';
import type { CharacterProfile } from '../novel/types.js';

const MAX_AUTO_CHARACTERS = 12;
const MAX_PROMOTIONS_PER_CHAPTER = 2;

export function selectRecurringCharacterCandidates(params: {
  candidates: PendingCharacterCandidate[];
  existingCharacters: CharacterProfile[];
  chapterNumber?: number;
  maxPromotions?: number;
}): PendingCharacterCandidate[] {
  const knownNames = new Set(
    params.existingCharacters.flatMap(character => [character.name, ...character.aliases]),
  );
  const availableSlots = Math.max(0, MAX_AUTO_CHARACTERS - params.existingCharacters.length);
  return params.candidates
    .filter(candidate => candidate.status === 'pending')
    .filter(candidate => params.chapterNumber == null || candidate.lastDetectedIn === params.chapterNumber)
    .filter(candidate => candidate.lastDetectedIn > candidate.firstDetectedIn)
    .filter(candidate => candidate.hitCount >= 2)
    .filter(candidate => !knownNames.has(candidate.name))
    .sort((left, right) => (
      right.hitCount - left.hitCount
      || left.firstDetectedIn - right.firstDetectedIn
      || left.name.localeCompare(right.name, 'zh-CN')
    ))
    .slice(0, Math.min(
      availableSlots,
      params.maxPromotions ?? MAX_PROMOTIONS_PER_CHAPTER,
    ));
}

export async function promoteRecurringCharacters(params: {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  novelId: string;
  chapterNumber?: number;
  maxPromotions?: number;
}): Promise<CharacterProfile[]> {
  const [candidates, existingCharacters] = await Promise.all([
    params.novelManager.getPendingCharacterCandidates(params.novelId),
    params.novelManager.getCharacters(params.novelId),
  ]);
  const selected = selectRecurringCharacterCandidates({
    candidates,
    existingCharacters,
    chapterNumber: params.chapterNumber,
    maxPromotions: params.maxPromotions,
  });
  const created: CharacterProfile[] = [];
  for (const candidate of selected) {
    const character = buildAutoExtractedCharacter({
      name: candidate.name,
      chapterNumber: candidate.firstDetectedIn,
      role: 'supporting',
      sourceTag: 'auto-recurring',
    });
    await params.novelManager.saveCharacter(params.novelId, character);
    await params.novelMemory?.indexCharacter(params.novelId, character).catch(() => undefined);
    created.push(character);
  }
  if (created.length > 0) {
    await params.novelManager.markPendingCharacterCandidates(
      params.novelId,
      created.map(character => character.name),
      'approved',
    );
  }
  return created;
}
