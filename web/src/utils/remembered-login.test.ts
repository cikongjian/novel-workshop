import { describe, expect, it } from 'vitest';
import {
  clearRememberedLogin,
  loadRememberedLogin,
  saveRememberedLogin,
  type LoginPreferenceStorage,
} from './remembered-login';

function createStorage(initialValue?: string): LoginPreferenceStorage & { current(): string | null } {
  let value = initialValue ?? null;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => { value = nextValue; },
    removeItem: () => { value = null; },
    current: () => value,
  };
}

describe('remembered login preference', () => {
  const key = 'test.rememberMe';

  it('stores only the normalized username', () => {
    const storage = createStorage();

    saveRememberedLogin(storage, key, '  author  ');

    expect(JSON.parse(storage.current() ?? '{}')).toEqual({ version: 1, username: 'author' });
    expect(storage.current()).not.toContain('password');
  });

  it('purges a legacy plaintext password while retaining the username', () => {
    const storage = createStorage(JSON.stringify({ username: 'author', password: 'plaintext-secret' }));

    expect(loadRememberedLogin(storage, key)).toEqual({ username: 'author', remember: true });
    expect(JSON.parse(storage.current() ?? '{}')).toEqual({ version: 1, username: 'author' });
  });

  it('clears malformed and oversized stored values', () => {
    const malformedStorage = createStorage('{bad-json');
    const oversizedStorage = createStorage(JSON.stringify({ version: 1, username: 'a'.repeat(51) }));

    expect(loadRememberedLogin(malformedStorage, key)).toEqual({ username: '', remember: false });
    expect(malformedStorage.current()).toBeNull();
    expect(loadRememberedLogin(oversizedStorage, key)).toEqual({ username: '', remember: false });
    expect(oversizedStorage.current()).toBeNull();
  });

  it('removes the preference when remembering is disabled', () => {
    const storage = createStorage(JSON.stringify({ version: 1, username: 'author' }));

    clearRememberedLogin(storage, key);

    expect(storage.current()).toBeNull();
  });
});
