import { ref } from 'vue';

type LegacyAuthStorage = Pick<Storage, 'getItem' | 'removeItem'>;

const LEGACY_AUTH_TOKEN_KEYS = ['novel_access_token', 'novel_refresh_token'] as const;
const LEGACY_REFRESH_TOKEN_PATTERN = /^[a-f0-9]{64}$/u;

export const sessionAccessToken = ref<string | null>(null);

export function getSessionAccessToken(): string | null {
  return sessionAccessToken.value;
}

export function setSessionAccessToken(token: string): void {
  sessionAccessToken.value = token.trim() || null;
}

export function clearSessionAccessToken(): void {
  sessionAccessToken.value = null;
}

export function clearLegacyPersistedAuth(storage?: LegacyAuthStorage): void {
  const target = storage
    ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return;

  for (const key of LEGACY_AUTH_TOKEN_KEYS) {
    try {
      target.removeItem(key);
    } catch {
      // Storage cleanup must not prevent login in restricted browser modes.
    }
  }
}

export function consumeLegacyPersistedRefreshToken(storage?: LegacyAuthStorage): string | null {
  const target = storage
    ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return null;

  let refreshToken: string | null = null;
  try {
    refreshToken = target.getItem('novel_refresh_token');
  } catch {
    // Treat inaccessible storage as an absent legacy session.
  } finally {
    clearLegacyPersistedAuth(target);
  }

  return refreshToken && LEGACY_REFRESH_TOKEN_PATTERN.test(refreshToken)
    ? refreshToken
    : null;
}
