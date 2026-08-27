import { describe, expect, it } from 'vitest';
import { normalizeStoryStateSnapshotCandidate } from './story-state-snapshot-normalizer.js';

describe('story-state-snapshot-normalizer', () => {
  it('clamps relationship vectors and maps common enum aliases', () => {
    const candidate = {
      characters: [
        {
          characterId: null,
          name: '林澄',
          relationshipChanges: [
            {
              vector: {
                trust: 120,
                affection: 130,
                respect: 150,
                obligation: 101,
                fear: -1,
                rivalry: 105,
              },
            },
          ],
        },
      ],
      factions: [
        {
          phase: 'active',
          powerLevel: 140,
          objectiveProgress: 101,
          internalStability: -5,
          relations: [
            { type: 'subordinate' },
            { type: 'patron' },
            { type: 'consumer' },
            { type: 'symbiotic' },
            { type: 'victim' },
            { type: 'hunter' },
            { type: 'unknown' },
            { type: 'inheritor' },
            { type: 'legacy' },
          ],
        },
      ],
      plot: {
        tensionLevel: 12,
        activeThreads: [
          { status: 'simmering' },
          { status: 'resolved' },
        ],
        pendingForeshadowing: [
          { hint: 'keep', plantedInChapter: 1, urgency: 'high' },
          { hint: 'drop', plantedInChapter: 2, urgency: 'resolved' },
        ],
      },
    };

    const normalized = normalizeStoryStateSnapshotCandidate(candidate);

    expect(normalized.characters[0].relationshipChanges[0].vector).toEqual({
      trust: 100,
      affection: 100,
      respect: 100,
      obligation: 100,
      fear: 0,
      rivalry: 100,
    });
    expect(normalized.characters[0].characterId).toBe('林澄');
    expect(normalized.factions[0]).toEqual(expect.objectContaining({
      phase: 'rising',
      powerLevel: 100,
      objectiveProgress: 100,
      internalStability: 0,
    }));
    expect(normalized.factions[0].relations[0].type).toBe('vassal');
    expect(normalized.factions[0].relations[1].type).toBe('overlord');
    expect(normalized.factions[0].relations[2].type).toBe('neutral');
    expect(normalized.factions[0].relations[3].type).toBe('ally');
    expect(normalized.factions[0].relations[4].type).toBe('enemy');
    expect(normalized.factions[0].relations[5].type).toBe('enemy');
    expect(normalized.factions[0].relations[6].type).toBe('neutral');
    expect(normalized.factions[0].relations[7].type).toBe('neutral');
    expect(normalized.factions[0].relations[8].type).toBe('neutral');
    expect(normalized.plot.tensionLevel).toBe(10);
    expect(normalized.plot.activeThreads.map(thread => thread.status)).toEqual(['active', 'cooling']);
    expect(normalized.plot.pendingForeshadowing).toEqual([
      { hint: 'keep', plantedInChapter: 1, urgency: 'high' },
    ]);
  });

  it('normalizes workplace tracker aliases that would otherwise fail schema parsing', () => {
    const candidate = {
      characters: [
        { characterId: null, name: '客户经理', relationshipChanges: [] },
        { characterId: '', name: '', relationshipChanges: [] },
      ],
      factions: [
        {
          factionName: '项目组',
          phase: 'stable',
          powerLevel: 60,
          objectiveProgress: 50,
          internalStability: 70,
          relations: [
            { targetFaction: '客户侧', type: 'alliance' },
            { targetFaction: '物业侧', type: 'negotiation' },
            { targetFaction: '外围供应商', type: 'indirect' },
            { targetFaction: '材料供应商', type: 'supplier' },
            { targetFaction: '合同法务', type: 'contract_negotiation' },
            { targetFaction: '物流团队', type: 'logistics_dependency' },
            { targetFaction: '交易对手', type: 'transaction' },
            { targetFaction: '协同方', type: 'coordination' },
          ],
        },
      ],
    };

    const normalized = normalizeStoryStateSnapshotCandidate(candidate);

    expect(normalized.characters.map(character => character.characterId)).toEqual(['客户经理', 'character-2']);
    expect(normalized.factions[0].phase).toBe('peak');
    expect(normalized.factions[0].relations.map(relation => relation.type)).toEqual([
      'ally',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
    ]);
  });
});
