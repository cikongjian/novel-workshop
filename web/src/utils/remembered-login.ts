export type LoginPreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RememberedLogin = {
  username: string;
  remember: boolean;
};

type StoredLoginPreference = {
  version?: unknown;
  username?: unknown;
  password?: unknown;
};

const LOGIN_PREFERENCE_VERSION = 1;
const MAX_USERNAME_LENGTH = 50;
const EMPTY_REMEMBERED_LOGIN: RememberedLogin = { username: '', remember: false };

function clearStoredPreference(storage: LoginPreferenceStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage may be unavailable in privacy modes; login must remain usable.
  }
}

export function saveRememberedLogin(
  storage: LoginPreferenceStorage,
  key: string,
  username: string,
): void {
  const normalizedUsername = username.trim();
  if (!normalizedUsername || normalizedUsername.length > MAX_USERNAME_LENGTH) {
    clearStoredPreference(storage, key);
    return;
  }

  try {
    storage.setItem(key, JSON.stringify({
      version: LOGIN_PREFERENCE_VERSION,
      username: normalizedUsername,
    }));
  } catch {
    // Remembering a username is optional and must not block authentication.
  }
}

export function clearRememberedLogin(storage: LoginPreferenceStorage, key: string): void {
  clearStoredPreference(storage, key);
}

export function loadRememberedLogin(
  storage: LoginPreferenceStorage,
  key: string,
): RememberedLogin {
  let parsed: StoredLoginPreference;
  try {
    const raw = storage.getItem(key);
    if (!raw) return EMPTY_REMEMBERED_LOGIN;
    parsed = JSON.parse(raw) as StoredLoginPreference;
  } catch {
    clearStoredPreference(storage, key);
    return EMPTY_REMEMBERED_LOGIN;
  }

  if (!parsed || typeof parsed !== 'object') {
    clearStoredPreference(storage, key);
    return EMPTY_REMEMBERED_LOGIN;
  }

  const username = typeof parsed.username === 'string' ? parsed.username.trim() : '';
  if (!username || username.length > MAX_USERNAME_LENGTH) {
    clearStoredPreference(storage, key);
    return EMPTY_REMEMBERED_LOGIN;
  }

  const isLegacyRecord = Object.hasOwn(parsed, 'password') || parsed.version !== LOGIN_PREFERENCE_VERSION;
  if (isLegacyRecord) {
    // Remove the old value first so a failed rewrite cannot leave a plaintext password behind.
    clearStoredPreference(storage, key);
    saveRememberedLogin(storage, key, username);
  }

  return { username, remember: true };
}
