import type { NovelMemory } from '../memory/novel-memory.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { buildAutoExtractedCharacter } from '../novel/character-profile-factory.js';
import type { CharacterProfile } from '../novel/types.js';

const INVALID_CORE_NAME_RE = /^(?:他|她|它|他们|她们|自己|众人|有人|无人|对方|男人|女人|老人|少年|少女|青年|领班|队长|医生|都尉)$/u;

function countLiteral(text: string, value: string): number {
  return text.split(value).length - 1;
}

export function selectCoreCharacterCandidates(params: {
  names: string[];
  chapterContent: string;
  novelContext?: string;
  limit?: number;
}): Array<{ name: string; mentions: number }> {
  const uniqueNames = [...new Set(params.names.map(name => name.trim()).filter(Boolean))];
  return uniqueNames
    .filter(name => /^[\p{Script=Han}]{2,3}$/u.test(name))
    .filter(name => !INVALID_CORE_NAME_RE.test(name))
    .map(name => ({
      name,
      mentions: countLiteral(params.chapterContent, name),
      contextMentions: countLiteral(params.novelContext ?? '', name),
    }))
    .filter(item => item.mentions >= 2)
    .sort((left, right) => (
      right.contextMentions - left.contextMentions
      || right.mentions - left.mentions
      || left.name.localeCompare(right.name, 'zh-CN')
    ))
    .slice(0, params.limit ?? 2)
    .map(({ name, mentions }) => ({ name, mentions }));
}

export async function bootstrapCoreCharacters(params: {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  candidateNames: string[];
  novelContext?: string;
}): Promise<CharacterProfile[]> {
  if (params.chapterNumber > 2 || params.candidateNames.length === 0) return [];
  const existing = await params.novelManager.getCharacters(params.novelId);
  if (existing.length >= 2) return [];
  const existingNames = new Set(existing.flatMap(character => [character.name, ...character.aliases]));

  const selected = selectCoreCharacterCandidates({
    names: params.candidateNames.filter(name => !existingNames.has(name)),
    chapterContent: params.chapterContent,
    novelContext: params.novelContext,
    limit: 2 - existing.length,
  });
  const created: CharacterProfile[] = [];
  const hasProtagonist = existing.some(character => character.role === 'protagonist');
  for (const [index, item] of selected.entries()) {
    const character = buildAutoExtractedCharacter({
      name: item.name,
      chapterNumber: params.chapterNumber,
      role: !hasProtagonist && index === 0 ? 'protagonist' : 'supporting',
      sourceTag: 'auto-core',
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
