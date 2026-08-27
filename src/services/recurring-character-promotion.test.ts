import { describe, expect, it, vi } from 'vitest';
import {
  promoteRecurringCharacters,
  selectRecurringCharacterCandidates,
} from './recurring-character-promotion.js';

const candidate = (name: string, first: number, last: number, hitCount: number) => ({
  name,
  firstDetectedIn: first,
  lastDetectedIn: last,
  hitCount,
  status: 'pending' as const,
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
});

describe('recurring character promotion', () => {
  it('selects only candidates seen in distinct chapters', () => {
    const selected = selectRecurringCharacterCandidates({
      candidates: [
        candidate('周耀声', 2, 4, 2),
        candidate('刘智', 4, 4, 3),
        candidate('路人甲', 1, 2, 2),
      ],
      existingCharacters: [],
      chapterNumber: 4,
    });

    expect(selected.map(item => item.name)).toEqual(['周耀声']);
  });

  it('creates, indexes and approves recurring supporting characters', async () => {
    const novelManager = {
      getPendingCharacterCandidates: vi.fn().mockResolvedValue([candidate('周耀声', 2, 4, 2)]),
      getCharacters: vi.fn().mockResolvedValue([]),
      saveCharacter: vi.fn().mockResolvedValue(undefined),
      markPendingCharacterCandidates: vi.fn().mockResolvedValue([]),
    };
    const novelMemory = { indexCharacter: vi.fn().mockResolvedValue(undefined) };

    const created = await promoteRecurringCharacters({
      novelManager: novelManager as any,
      novelMemory: novelMemory as any,
      novelId: 'novel-1',
      chapterNumber: 4,
    });

    expect(created).toEqual([
      expect.objectContaining({ name: '周耀声', role: 'supporting', tags: expect.arrayContaining(['auto-recurring']) }),
    ]);
    expect(novelMemory.indexCharacter).toHaveBeenCalledTimes(1);
    expect(novelManager.markPendingCharacterCandidates).toHaveBeenCalledWith(
      'novel-1',
      ['周耀声'],
      'approved',
    );
  });
});
