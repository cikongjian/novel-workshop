import { describe, expect, it, vi } from 'vitest';
import {
  approvePendingCandidates,
  buildPendingCandidateCharacter,
  dedupeNames,
  isNotFoundLikeError,
  rejectPendingCandidates,
  resolvePendingCandidateTargetNames,
} from './pending-support.js';

describe('character pending support', () => {
  it('dedupes candidate names and resolves default targets', () => {
    expect(dedupeNames([' 陆焰 ', '陆焰', '苏晚'])).toEqual(['陆焰', '苏晚']);
    expect(resolvePendingCandidateTargetNames({
      candidates: [
        { name: '陆焰', status: 'pending' },
        { name: '苏晚', status: 'approved' },
      ] as any,
    })).toEqual(['陆焰']);
  });

  it('builds pending candidate character with default tags', () => {
    const character = buildPendingCandidateCharacter({
      name: '陆焰',
      chapterNumber: 7,
      role: 'protagonist',
      now: '2026-03-23T00:00:00.000Z',
    });

    expect(character.name).toBe('陆焰');
    expect(character.role).toBe('protagonist');
    expect(character.tags).toContain('candidate-approved');
    expect(character.currentState).toContain('chapter 7');
  });

  it('approves candidates while skipping existing names and reporting missing ones', async () => {
    const saveCharacter = vi.fn();
    const markPendingCharacterCandidates = vi.fn().mockResolvedValue([{ name: '陆焰', status: 'approved' }]);
    const indexCharacter = vi.fn();

    const result = await approvePendingCandidates({
      novelId: 'novel-1',
      novelManager: {
        getCharacters: vi.fn().mockResolvedValue([{
          id: 'c1',
          name: '苏晚',
          aliases: ['晚晚'],
        }]),
        saveCharacter,
        markPendingCharacterCandidates,
      } as any,
      novelMemory: { indexCharacter } as any,
      candidates: [
        { name: '陆焰', firstDetectedIn: 5, status: 'pending' },
        { name: '苏晚', firstDetectedIn: 3, status: 'pending' },
      ] as any,
      targetNames: ['陆焰', '苏晚', '不存在'],
      role: 'supporting',
    });

    expect(saveCharacter).toHaveBeenCalledOnce();
    expect(indexCharacter).toHaveBeenCalledOnce();
    expect(result.approvedCharacters).toHaveLength(1);
    expect(result.skippedExisting).toEqual(['苏晚']);
    expect(result.missingNames).toEqual(['不存在']);
    expect(markPendingCharacterCandidates).toHaveBeenCalledWith('novel-1', ['陆焰', '苏晚'], 'approved');
  });

  it('rejects target names and detects not-found-like errors', async () => {
    const markPendingCharacterCandidates = vi.fn().mockResolvedValue([{ name: '陆焰', status: 'rejected' }]);
    const result = await rejectPendingCandidates({
      novelId: 'novel-1',
      novelManager: { markPendingCharacterCandidates } as any,
      candidates: [{ name: '陆焰', status: 'pending' }] as any,
      targetNames: ['陆焰'],
    });

    expect(result.rejectedCount).toBe(1);
    expect(result.rejectedNames).toEqual(['陆焰']);
    expect(isNotFoundLikeError('角色不存在')).toBe(true);
    expect(isNotFoundLikeError('validation failed')).toBe(false);
  });
});
