import { describe, expect, it, vi } from 'vitest';
import { CharacterProfile, type Chapter } from '../novel/types.js';
import {
  applyAutoProtagonistReconciliation,
  planAutoProtagonistReconciliation,
} from './auto-protagonist-reconciliation.js';

const OLD_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ID = '22222222-2222-4222-8222-222222222222';

function character(id: string, name: string, role: CharacterProfile['role']): CharacterProfile {
  return CharacterProfile.parse({
    id,
    name,
    aliases: [],
    role,
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
    arc: '',
    currentState: '',
    tags: ['auto-extracted'],
    voiceDesignStatus: 'none',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  });
}

function chapter(chapterNumber: number, content: string): Chapter {
  return {
    novelId: 'novel-1',
    chapterNumber,
    title: `chapter ${chapterNumber}`,
    content,
    wordCount: content.length,
    status: 'finalized',
    agentComments: [],
    revisionCount: 0,
    summary: '',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  };
}

describe('auto protagonist reconciliation', () => {
  it('replaces an auto-selected lead only when another character clearly dominates', () => {
    const plan = planAutoProtagonistReconciliation({
      characters: [character(OLD_ID, '张明', 'protagonist'), character(NEXT_ID, '林念', 'supporting')],
      chapters: [1, 2, 3].map(number => chapter(
        number,
        `林念推动交付，林念公开表态，林念承担责任。张明提出反对。`,
      )),
    });

    expect(plan).toMatchObject({
      currentProtagonistId: OLD_ID,
      nextProtagonistId: NEXT_ID,
      current: { chapterPresence: 3, openingPresence: 3, mentions: 3 },
      next: { chapterPresence: 3, openingPresence: 3, mentions: 9 },
    });
  });

  it('does not change a user-curated protagonist', () => {
    const current = character(OLD_ID, '张明', 'protagonist');
    current.tags.push('user-curated');
    expect(planAutoProtagonistReconciliation({
      characters: [current, character(NEXT_ID, '林念', 'supporting')],
      chapters: [1, 2, 3].map(number => chapter(number, '林念林念林念。张明。')),
    })).toBeNull();
  });

  it('persists both role changes and refreshes their memory entries', async () => {
    const characters = [character(OLD_ID, '张明', 'protagonist'), character(NEXT_ID, '林念', 'supporting')];
    const novelManager = {
      getCharacters: vi.fn().mockResolvedValue(characters),
      saveCharacter: vi.fn().mockResolvedValue(undefined),
    };
    const novelMemory = { indexCharacter: vi.fn().mockResolvedValue(undefined) };
    const changed = await applyAutoProtagonistReconciliation({
      novelManager: novelManager as any,
      novelMemory: novelMemory as any,
      novelId: 'novel-1',
      plan: {
        currentProtagonistId: OLD_ID,
        nextProtagonistId: NEXT_ID,
        current: { characterId: OLD_ID, name: '张明', chapterPresence: 3, openingPresence: 3, mentions: 3 },
        next: { characterId: NEXT_ID, name: '林念', chapterPresence: 3, openingPresence: 3, mentions: 9 },
      },
    });

    expect(changed.map(item => [item.name, item.role])).toEqual([
      ['张明', 'supporting'],
      ['林念', 'protagonist'],
    ]);
    expect(novelManager.saveCharacter).toHaveBeenCalledTimes(2);
    expect(novelMemory.indexCharacter).toHaveBeenCalledTimes(2);
  });
});
