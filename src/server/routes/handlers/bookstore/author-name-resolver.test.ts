import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../auth/user-service.js', () => ({
  getProfile: vi.fn(),
}));

import { getProfile } from '../../../../auth/user-service.js';
import {
  resolveBookAuthorName,
} from './author-name-resolver.js';

describe('author-name-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the authorName already present on the book payload', async () => {
    const authorName = await resolveBookAuthorName({
      userId: 'dev',
      authorName: '剑来客',
    });

    expect(authorName).toBe('剑来客');
    expect(vi.mocked(getProfile)).not.toHaveBeenCalled();
  });

  it('uses the user profile pen name for authenticated works', async () => {
    vi.mocked(getProfile).mockResolvedValue({
      penName: '青山',
      username: 'ops-root',
    } as any);

    const authorName = await resolveBookAuthorName(
      { userId: 'user-1' },
      { execute: vi.fn() } as any,
    );

    expect(authorName).toBe('青山');
    expect(vi.mocked(getProfile)).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('falls back legacy dev books to the first admin-role pen name and caches the lookup', async () => {
    const execute = vi.fn().mockResolvedValue([[
      { username: 'ops-root', pen_name: '故事司南' },
    ]]);
    const authorNameCache = new Map<string, Promise<string>>();

    const authorNames = await Promise.all([
      resolveBookAuthorName(
        { id: 'book-1', userId: 'dev' } as any,
        { execute } as any,
        authorNameCache,
      ),
      resolveBookAuthorName(
        { id: 'book-2', userId: 'default-user' } as any,
        { execute } as any,
        authorNameCache,
      ),
    ]);

    expect(authorNames).toEqual(['故事司南', '故事司南']);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getProfile)).not.toHaveBeenCalled();
  });
});
