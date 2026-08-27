import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLegacyPersistedAuth,
  clearSessionAccessToken,
  consumeLegacyPersistedRefreshToken,
  getSessionAccessToken,
  setSessionAccessToken,
} from './auth-session';

afterEach(() => {
  clearSessionAccessToken();
});

describe('auth session', () => {
  it('keeps the access token in memory only', () => {
    setSessionAccessToken(' access-token ');
    expect(getSessionAccessToken()).toBe('access-token');

    clearSessionAccessToken();
    expect(getSessionAccessToken()).toBeNull();
  });

  it('removes legacy persisted tokens', () => {
    const removeItem = vi.fn();

    clearLegacyPersistedAuth({ getItem: vi.fn(), removeItem });

    expect(removeItem).toHaveBeenCalledWith('novel_access_token');
    expect(removeItem).toHaveBeenCalledWith('novel_refresh_token');
  });

  it('consumes a valid legacy refresh token once and clears both old keys first', () => {
    const refreshToken = 'a'.repeat(64);
    const removeItem = vi.fn();
    const getItem = vi.fn((key: string) => key === 'novel_refresh_token' ? refreshToken : null);

    expect(consumeLegacyPersistedRefreshToken({ getItem, removeItem })).toBe(refreshToken);
    expect(removeItem).toHaveBeenCalledWith('novel_access_token');
    expect(removeItem).toHaveBeenCalledWith('novel_refresh_token');
  });
});
