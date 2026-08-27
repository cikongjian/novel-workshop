import { describe, expect, it, vi } from 'vitest';
import {
  batchMergeCharacterGroups,
  buildDuplicateCharacterPrompt,
  dedupeNames,
  detectDuplicateCharacterGroups,
  mergeCharacterPair,
} from './merge-support.js';

describe('character merge support', () => {
  it('dedupes aliases and merges one character into another', async () => {
    const source = {
      id: 'source',
      name: '陆焰',
      aliases: ['阿焰'],
      relationships: [],
    };
    const target = {
      id: 'target',
      name: '陆炎',
      aliases: ['小炎'],
      relationships: [],
    };
    const witness = {
      id: 'w1',
      name: '苏晚',
      aliases: [],
      relationships: [{ targetId: 'source', type: 'ally', description: '' }],
      updatedAt: 'old',
    };
    const saveCharacter = vi.fn();
    const deleteCharacter = vi.fn();
    const indexCharacter = vi.fn();

    const result = await mergeCharacterPair({
      novelId: 'novel-1',
      novelManager: {
        getCharacters: vi.fn().mockResolvedValue([source, target, witness]),
        saveCharacter,
        deleteCharacter,
      } as any,
      novelMemory: { indexCharacter } as any,
      sourceCharacterId: 'source',
      targetCharacterId: 'target',
    });

    expect(dedupeNames([' 小炎 ', '阿焰', '陆焰', '阿焰'])).toEqual(['小炎', '阿焰', '陆焰']);
    expect(result.mergedAliases).toEqual(['小炎', '阿焰', '陆焰']);
    expect(saveCharacter).toHaveBeenCalledTimes(2);
    expect(deleteCharacter).toHaveBeenCalledWith('novel-1', 'source');
    expect(indexCharacter).toHaveBeenCalledOnce();
  });

  it('batch merges valid groups only', async () => {
    const saveCharacter = vi.fn();
    const deleteCharacter = vi.fn();
    const indexCharacter = vi.fn();
    const characters = [
      { id: 'a', name: '陆焰', aliases: [], relationships: [], updatedAt: 'x' },
      { id: 'b', name: '阿焰', aliases: [], relationships: [], updatedAt: 'x' },
      { id: 'c', name: '苏晚', aliases: [], relationships: [], updatedAt: 'x' },
    ];

    const result = await batchMergeCharacterGroups({
      novelId: 'novel-1',
      novelManager: {
        getCharacters: vi.fn().mockResolvedValue(characters),
        saveCharacter,
        deleteCharacter,
      } as any,
      novelMemory: { indexCharacter } as any,
      groups: [
        { ids: ['a', 'b'], names: ['陆焰', '阿焰'] },
        { ids: ['missing'], names: ['缺失'] },
      ],
    });

    expect(result).toEqual([{ targetName: '陆焰', mergedNames: ['阿焰'] }]);
    expect(deleteCharacter).toHaveBeenCalledWith('novel-1', 'b');
    expect(indexCharacter).toHaveBeenCalledOnce();
  });

  it('builds duplicate prompt and parses model response', async () => {
    const groups = await detectDuplicateCharacterGroups({
      modelClient: {
        chat: vi.fn().mockResolvedValue({
          content: '分析如下\n[{"ids":["a","b"],"names":["陆焰","阿焰"],"reason":"简称"}]',
        }),
      } as any,
      characters: [
        { id: 'a', name: '陆焰', aliases: ['阿焰'], role: 'protagonist', appearance: '黑衣', personality: '冷静' },
        { id: 'b', name: '阿焰', aliases: [], role: 'supporting', appearance: '黑衣', personality: '冷静' },
      ] as any,
    });

    const prompt = buildDuplicateCharacterPrompt([
      { id: 'a', name: '陆焰', aliases: ['阿焰'], role: 'protagonist', appearance: '黑衣', personality: '冷静' },
    ] as any);

    expect(prompt).toContain('角色列表');
    expect(groups).toEqual([{ ids: ['a', 'b'], names: ['陆焰', '阿焰'], reason: '简称' }]);
  });
});
