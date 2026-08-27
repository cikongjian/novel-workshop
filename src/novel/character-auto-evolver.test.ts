import { describe, expect, it, vi } from 'vitest';
import { evolveCharactersAuto, type EvolverNovelManager } from './character-auto-evolver.js';
import { CharacterProfile, CharacterStateSnapshot } from './types.js';

const NOVEL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHARACTER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TIMESTAMP = '2026-07-12T00:00:00.000Z';

function buildCharacter() {
  return CharacterProfile.parse({
    id: CHARACTER_ID,
    name: '顾临川',
    aliases: [],
    role: 'protagonist',
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
    tags: [],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  });
}

function buildSnapshot(chapterNumber: number, overrides: Record<string, unknown> = {}) {
  return CharacterStateSnapshot.parse({
    id: `00000000-0000-4000-8000-${String(chapterNumber).padStart(12, '0')}`,
    novelId: NOVEL_ID,
    characterId: CHARACTER_ID,
    chapterNumber,
    emotionState: { primary: 'fear', intensity: 80 },
    goalProgress: 30,
    stress: 85,
    trustChanges: [],
    beliefShift: '',
    evidence: [{ paragraphIdx: 0, reason: 'name mention' }],
    isCritical: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  });
}

function buildManager(snapshots: ReturnType<typeof buildSnapshot>[]) {
  const saveCharacter = vi.fn().mockResolvedValue(undefined);
  const manager: EvolverNovelManager = {
    getCharacters: vi.fn().mockResolvedValue([buildCharacter()]),
    getCharacterStateSnapshots: vi.fn().mockResolvedValue(snapshots),
    saveCharacter,
  };
  return { manager, saveCharacter };
}

describe('evolveCharactersAuto', () => {
  it('does not invent personality or coping changes from high stress alone', async () => {
    const { manager, saveCharacter } = buildManager([
      buildSnapshot(1),
      buildSnapshot(2),
      buildSnapshot(3),
    ]);

    await expect(evolveCharactersAuto(manager, NOVEL_ID, 3)).resolves.toEqual([]);
    expect(saveCharacter).not.toHaveBeenCalled();
  });

  it('applies high-stress changes only when snapshot evidence names them', async () => {
    const { manager, saveCharacter } = buildManager([
      buildSnapshot(1, { beliefShift: '他开始焦虑，并试图回避现实。' }),
      buildSnapshot(2, { beliefShift: '他再次借酒消愁。' }),
    ]);

    const result = await evolveCharactersAuto(manager, NOVEL_ID, 2);

    expect(result[0]?.changes.map(change => change.after)).toEqual(expect.arrayContaining([
      ['焦虑'],
      ['逃避'],
    ]));
    const saved = saveCharacter.mock.calls[0]?.[1];
    expect(saved.personalityModel.traits).toContain('焦虑');
    expect(saved.psychology.copingMechanisms).toContain('逃避');
  });

  it('does not create a generic milestone without event evidence', async () => {
    const { manager, saveCharacter } = buildManager([
      buildSnapshot(4, { stress: 20, isCritical: true }),
    ]);

    await expect(evolveCharactersAuto(manager, NOVEL_ID, 4)).resolves.toEqual([]);
    expect(saveCharacter).not.toHaveBeenCalled();
  });

  it('uses a relationship reason as the milestone event', async () => {
    const { manager, saveCharacter } = buildManager([
      buildSnapshot(5, {
        stress: 40,
        isCritical: true,
        trustChanges: [{
          targetId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          delta: -20,
          reason: '发现盟友隐瞒了关键证据',
        }],
      }),
    ]);

    await evolveCharactersAuto(manager, NOVEL_ID, 5);

    const saved = saveCharacter.mock.calls[0]?.[1];
    expect(saved.growthTrack.milestones).toEqual([{
      chapter: 5,
      event: '发现盟友隐瞒了关键证据',
      insight: '',
    }]);
  });
});
