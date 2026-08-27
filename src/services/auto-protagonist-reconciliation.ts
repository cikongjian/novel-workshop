import type { NovelMemory } from '../memory/novel-memory.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { projectCharacterIdentityLabels } from '../novel/character-identity-labels.js';
import type { Chapter, CharacterProfile } from '../novel/types.js';

export type CharacterCentrality = {
  characterId: string;
  name: string;
  chapterPresence: number;
  openingPresence: number;
  mentions: number;
};

export type AutoProtagonistReconciliationPlan = {
  currentProtagonistId: string;
  nextProtagonistId: string;
  current: CharacterCentrality;
  next: CharacterCentrality;
};

function countLiteral(text: string, value: string): number {
  return text.split(value).length - 1;
}

function measureCentrality(character: CharacterProfile, chapters: Chapter[]): CharacterCentrality {
  let chapterPresence = 0;
  let openingPresence = 0;
  let mentions = 0;
  for (const chapter of chapters) {
    const chapterMentions = countLiteral(chapter.content, character.name);
    if (chapterMentions > 0) chapterPresence += 1;
    if (chapter.content.slice(0, 600).includes(character.name)) openingPresence += 1;
    mentions += chapterMentions;
  }
  return { characterId: character.id, name: character.name, chapterPresence, openingPresence, mentions };
}

function isAutoManaged(character: CharacterProfile): boolean {
  return character.tags.includes('auto-extracted')
    && !character.tags.includes('user-curated')
    && !character.identityLabels?.some(label => label.userLocked);
}

export function planAutoProtagonistReconciliation(params: {
  characters: CharacterProfile[];
  chapters: Chapter[];
}): AutoProtagonistReconciliationPlan | null {
  const current = params.characters.find(character => character.role === 'protagonist');
  if (!current || !isAutoManaged(current) || params.chapters.length < 3) return null;
  const currentCentrality = measureCentrality(current, params.chapters);
  const candidates = params.characters
    .filter(character => character.id !== current.id && isAutoManaged(character))
    .map(character => measureCentrality(character, params.chapters))
    .filter(candidate => candidate.chapterPresence >= 3)
    .filter(candidate => candidate.chapterPresence >= currentCentrality.chapterPresence)
    .filter(candidate => candidate.openingPresence >= currentCentrality.openingPresence)
    .filter(candidate => candidate.mentions >= Math.max(
      currentCentrality.mentions + 2,
      Math.ceil(currentCentrality.mentions * 1.25),
    ))
    .sort((left, right) => (
      right.chapterPresence - left.chapterPresence
      || right.openingPresence - left.openingPresence
      || right.mentions - left.mentions
    ));
  const next = candidates[0];
  return next
    ? {
        currentProtagonistId: current.id,
        nextProtagonistId: next.characterId,
        current: currentCentrality,
        next,
      }
    : null;
}

export async function loadAutoProtagonistReconciliationPlan(params: {
  novelManager: NovelManager;
  novelId: string;
  characters?: CharacterProfile[];
}): Promise<AutoProtagonistReconciliationPlan | null> {
  const characters = params.characters ?? await params.novelManager.getCharacters(params.novelId);
  if (characters.length < 2) return null;
  const summaries = await params.novelManager.listChapters(params.novelId);
  const chapters = (await Promise.all(summaries.map(summary => (
    params.novelManager.getChapter(params.novelId, summary.chapterNumber).catch(() => null)
  )))).filter((chapter): chapter is Chapter => chapter !== null && chapter.content.trim().length > 0);
  return planAutoProtagonistReconciliation({ characters, chapters });
}

export async function applyAutoProtagonistReconciliation(params: {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  novelId: string;
  plan: AutoProtagonistReconciliationPlan;
}): Promise<CharacterProfile[]> {
  const characters = await params.novelManager.getCharacters(params.novelId);
  const changed = characters
    .filter(character => (
      character.id === params.plan.currentProtagonistId
      || character.id === params.plan.nextProtagonistId
    ))
    .map(character => {
      const next: CharacterProfile = {
        ...character,
        role: character.id === params.plan.nextProtagonistId ? 'protagonist' : 'supporting',
        tags: [...new Set([...character.tags, 'auto-role-reconciled'])],
      };
      next.identityLabels = projectCharacterIdentityLabels(next);
      return next;
    });
  if (changed.length !== 2) return [];
  for (const character of changed) {
    await params.novelManager.saveCharacter(params.novelId, character);
    await params.novelMemory?.indexCharacter(params.novelId, character).catch(() => undefined);
  }
  return changed;
}
