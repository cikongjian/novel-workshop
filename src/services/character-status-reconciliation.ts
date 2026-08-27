import type { NovelMemory } from '../memory/novel-memory.js';
import { projectCharacterIdentityLabels } from '../novel/character-identity-labels.js';
import { extractFactsFromChapter } from '../novel/fact-graph-builder.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { Chapter, CharacterProfile } from '../novel/types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CharacterStatusReconciliation');

export type CharacterStatusReconciliationPlan = {
  characterId: string;
  name: string;
  chapterNumber: number;
  nextStatus: 'dead' | 'active';
  nextRole: CharacterProfile['role'];
  evidence: string;
};

export type CharacterResurrectionConflict = {
  characterId: string;
  name: string;
  deathChapterNumber: number;
  appearanceChapterNumber: number;
  deathEvidence: string;
  appearanceEvidence: string;
};

function shouldDemoteAutoCore(character: CharacterProfile): boolean {
  return character.role === 'deuteragonist'
    && character.tags.includes('auto-extracted')
    && character.tags.includes('auto-core')
    && !character.tags.includes('user-curated')
    && !character.identityLabels?.some(label => label.userLocked);
}

export function planCharacterStatusReconciliation(params: {
  characters: CharacterProfile[];
  chapters: Chapter[];
}): CharacterStatusReconciliationPlan[] {
  const byName = new Map(params.characters.map(character => [character.name, character]));
  const plans = new Map<string, CharacterStatusReconciliationPlan>();
  const characterNames = [...byName.keys()];

  const chapterFacts = [...params.chapters]
    .sort((left, right) => left.chapterNumber - right.chapterNumber)
    .map(chapter => ({
      chapter,
      facts: extractFactsFromChapter({
        chapterContent: chapter.content,
        chapterNumber: chapter.chapterNumber,
        characterNames,
      }),
    }));
  const conflicts = findCharacterResurrectionConflictsFromFacts(params.characters, chapterFacts);
  const conflictKeys = new Set(conflicts.map(conflict => (
    `${conflict.characterId}:${conflict.deathChapterNumber}`
  )));

  for (const { chapter, facts } of chapterFacts) {
    for (const change of facts.characterStateChanges) {
      if (
        change.newState !== 'dead'
        || change.certainty !== 'confirmed'
      ) continue;
      const character = byName.get(change.characterName);
      if (!character || plans.has(character.id)) continue;
      if (conflictKeys.has(`${character.id}:${chapter.chapterNumber}`)) continue;
      const hasLaterResolution = chapterFacts.some(item => (
        item.facts.characterStateChanges.some(stateChange => (
          stateChange.characterName === character.name
          && (stateChange.newState === 'alive' || stateChange.newState === 'healed')
          && stateChange.certainty !== 'rumored'
          && (
            item.chapter.chapterNumber > chapter.chapterNumber
            || (
              item.chapter.chapterNumber === chapter.chapterNumber
              && stateChange.sentenceIndex > change.sentenceIndex
            )
          )
        ))
      ));
      if (hasLaterResolution) continue;
      const nextRole = shouldDemoteAutoCore(character) ? 'minor' : character.role;
      if (character.status === 'dead' && character.role === nextRole) continue;
      plans.set(character.id, {
        characterId: character.id,
        name: character.name,
        chapterNumber: chapter.chapterNumber,
        nextStatus: 'dead',
        nextRole,
        evidence: change.evidence,
      });
    }
  }

  for (const character of params.characters) {
    if (character.status !== 'dead' || plans.has(character.id)) continue;
    const latestResolution = chapterFacts
      .flatMap(item => item.facts.characterStateChanges)
      .filter(change => (
        change.characterName === character.name
        && (change.newState === 'alive' || change.newState === 'healed')
        && change.certainty !== 'rumored'
      ))
      .sort((left, right) => right.chapterNumber - left.chapterNumber || right.sentenceIndex - left.sentenceIndex)[0];
    if (!latestResolution) continue;
    const latestDeath = chapterFacts
      .flatMap(item => item.facts.characterStateChanges)
      .filter(change => (
        change.characterName === character.name
        && change.newState === 'dead'
        && change.certainty === 'confirmed'
      ))
      .sort((left, right) => right.chapterNumber - left.chapterNumber || right.sentenceIndex - left.sentenceIndex)[0];
    if (
      latestDeath
      && (
        latestResolution.chapterNumber < latestDeath.chapterNumber
        || (
          latestResolution.chapterNumber === latestDeath.chapterNumber
          && latestResolution.sentenceIndex <= latestDeath.sentenceIndex
        )
      )
    ) continue;
    plans.set(character.id, {
      characterId: character.id,
      name: character.name,
      chapterNumber: latestResolution.chapterNumber,
      nextStatus: 'active',
      nextRole: character.role,
      evidence: latestResolution.evidence,
    });
  }
  return [...plans.values()];
}

export function findCharacterResurrectionConflicts(params: {
  characters: CharacterProfile[];
  chapters: Chapter[];
}): CharacterResurrectionConflict[] {
  const characterNames = params.characters.map(character => character.name);
  const chapterFacts = [...params.chapters]
    .sort((left, right) => left.chapterNumber - right.chapterNumber)
    .map(chapter => ({
      chapter,
      facts: extractFactsFromChapter({
        chapterContent: chapter.content,
        chapterNumber: chapter.chapterNumber,
        characterNames,
      }),
    }));
  return findCharacterResurrectionConflictsFromFacts(params.characters, chapterFacts);
}

function findCharacterResurrectionConflictsFromFacts(
  characters: CharacterProfile[],
  chapterFacts: Array<{ chapter: Chapter; facts: ReturnType<typeof extractFactsFromChapter> }>,
): CharacterResurrectionConflict[] {
  const byName = new Map(characters.map(character => [character.name, character]));
  const conflicts = new Map<string, CharacterResurrectionConflict>();

  for (const { chapter, facts } of chapterFacts) {
    for (const change of facts.characterStateChanges) {
      if (change.newState !== 'dead' || change.certainty !== 'confirmed') continue;
      const character = byName.get(change.characterName);
      if (!character) continue;
      const laterAppearance = chapterFacts
        .filter(item => item.chapter.chapterNumber > chapter.chapterNumber)
        .flatMap(item => item.facts.characterAppearances)
        .find(appearance => (
          appearance.characterName === character.name
          && (appearance.mentionType === 'onstage' || appearance.mentionType === 'dialogue')
          && !chapterFacts.some(item => (
            item.chapter.chapterNumber > chapter.chapterNumber
            && item.chapter.chapterNumber <= appearance.chapterNumber
            && item.facts.characterStateChanges.some(stateChange => (
              stateChange.characterName === character.name
              && (stateChange.newState === 'alive' || stateChange.newState === 'healed')
              && stateChange.certainty !== 'rumored'
            ))
          ))
        ));
      if (!laterAppearance) continue;
      const key = `${character.id}:${chapter.chapterNumber}`;
      if (conflicts.has(key)) continue;
      conflicts.set(key, {
        characterId: character.id,
        name: character.name,
        deathChapterNumber: chapter.chapterNumber,
        appearanceChapterNumber: laterAppearance.chapterNumber,
        deathEvidence: change.evidence,
        appearanceEvidence: laterAppearance.evidence,
      });
    }
  }
  return [...conflicts.values()];
}

export async function reconcileConfirmedCharacterStatusesFromChapter(params: {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
}): Promise<CharacterProfile[]> {
  const characters = await params.novelManager.getCharacters(params.novelId);
  const facts = extractFactsFromChapter({
    chapterContent: params.chapterContent,
    chapterNumber: params.chapterNumber,
    characterNames: characters.map(character => character.name),
  });
  const confirmedNames = new Set(facts.characterStateChanges
    .filter(change => (
      (change.newState === 'dead' && change.certainty === 'confirmed')
      || ((change.newState === 'alive' || change.newState === 'healed') && change.certainty !== 'rumored')
    ))
    .map(change => change.characterName));
  if (confirmedNames.size === 0) return [];

  const plans = planCharacterStatusReconciliation({
    characters,
    chapters: [{
      novelId: params.novelId,
      chapterNumber: params.chapterNumber,
      title: '',
      summary: '',
      content: params.chapterContent,
      wordCount: params.chapterContent.length,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  }).filter(plan => confirmedNames.has(plan.name));

  return applyCharacterStatusReconciliation({
    novelManager: params.novelManager,
    novelMemory: params.novelMemory,
    novelId: params.novelId,
    plans,
  });
}

export async function loadCharacterStatusReconciliationPlan(params: {
  novelManager: NovelManager;
  novelId: string;
  characters?: CharacterProfile[];
}): Promise<CharacterStatusReconciliationPlan[]> {
  const [characters, summaries] = await Promise.all([
    params.characters ?? params.novelManager.getCharacters(params.novelId),
    params.novelManager.listChapters(params.novelId),
  ]);
  const chapters = (await Promise.all(summaries.map(summary => (
    params.novelManager.getChapter(params.novelId, summary.chapterNumber).catch(() => null)
  )))).filter((chapter): chapter is Chapter => Boolean(chapter?.content.trim()));
  return planCharacterStatusReconciliation({ characters, chapters });
}

export async function applyCharacterStatusReconciliation(params: {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  novelId: string;
  plans: CharacterStatusReconciliationPlan[];
}): Promise<CharacterProfile[]> {
  if (params.plans.length === 0) return [];
  const characters = await params.novelManager.getCharacters(params.novelId);
  const planById = new Map(params.plans.map(plan => [plan.characterId, plan]));
  const changed: CharacterProfile[] = [];
  for (const character of characters) {
    const plan = planById.get(character.id);
    if (!plan) continue;
    const stateTag = plan.nextStatus === 'dead' ? '【状态：已死亡】' : '';
    const currentState = plan.nextStatus === 'active'
      ? character.currentState.replaceAll('【状态：已死亡】', '').trim()
      : character.currentState;
    const stateEntry = plan.nextStatus === 'dead'
      ? `[第${plan.chapterNumber}章] 正文确认：已死亡。${stateTag}`
      : `[第${plan.chapterNumber}章] 正文确认：已复活并恢复活动。`;
    const next: CharacterProfile = {
      ...character,
      role: plan.nextRole,
      status: plan.nextStatus,
      currentState: stateTag && currentState.includes(stateTag)
        ? currentState
        : [
            currentState,
            stateEntry,
          ].filter(Boolean).join('\n'),
      tags: [...new Set([...character.tags, 'auto-status-reconciled'])],
      updatedAt: new Date().toISOString(),
    };
    next.identityLabels = projectCharacterIdentityLabels(next);
    await params.novelManager.saveCharacter(params.novelId, next);
    await params.novelMemory?.indexCharacter(params.novelId, next).catch((error) => {
      logger.warn('角色状态已回填，但记忆索引更新失败', {
        novelId: params.novelId,
        characterId: next.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    changed.push(next);
  }
  return changed;
}
