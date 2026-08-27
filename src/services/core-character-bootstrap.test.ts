import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { bootstrapCoreCharacters, selectCoreCharacterCandidates } from './core-character-bootstrap.js';

describe('selectCoreCharacterCandidates', () => {
  it('selects repeated named characters and rejects action-tainted candidates', () => {
    const result = selectCoreCharacterCandidates({
      names: ['叶岑', '顾临川', '叶岑抬头', '领班'],
      chapterContent: '叶岑检查阀门。顾临川递来工具。叶岑记录读数，顾临川关掉电源。',
    });

    expect(result).toEqual([
      { name: '顾临川', mentions: 2 },
      { name: '叶岑', mentions: 2 },
    ]);
  });

  it('does not promote one-off names', () => {
    expect(selectCoreCharacterCandidates({
      names: ['张都尉', '陆沉舟'],
      chapterContent: '张都尉离开后，陆沉舟点燃残灯。陆沉舟没有回头。',
    })).toEqual([{ name: '陆沉舟', mentions: 2 }]);
  });

  it('prioritizes a synopsis-backed lead over a more frequent incidental name', () => {
    expect(selectCoreCharacterCandidates({
      names: ['陆沉舟', '张都尉'],
      chapterContent: '张都尉递酒。张都尉离开。张都尉回头。陆沉舟点灯，陆沉舟看见旧约。',
      novelContext: '陆沉舟依靠残灯追查古关旧约。',
      limit: 1,
    })).toEqual([{ name: '陆沉舟', mentions: 2 }]);
  });

  it('fills the second core slot in chapter two without duplicating the protagonist', async () => {
    const existing = {
      id: '4b7c31dc-75d7-442a-84a8-a6d3ae41dcba',
      name: '陆沉舟',
      aliases: [],
      role: 'protagonist',
    };
    const novelManager = {
      getCharacters: vi.fn().mockResolvedValue([existing]),
      saveCharacter: vi.fn().mockResolvedValue(undefined),
      markPendingCharacterCandidates: vi.fn().mockResolvedValue([]),
    };

    const created = await bootstrapCoreCharacters({
      novelManager: novelManager as any,
      novelId: 'novel-1',
      chapterNumber: 2,
      chapterContent: '谢青梧推开门。陆沉舟看向谢青梧，谢青梧把米袋放下。',
      candidateNames: ['陆沉舟', '谢青梧'],
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toEqual(expect.objectContaining({ name: '谢青梧', role: 'supporting' }));
    expect(novelManager.markPendingCharacterCandidates).toHaveBeenCalledWith(
      'novel-1',
      ['谢青梧'],
      'approved',
    );
  });
});
