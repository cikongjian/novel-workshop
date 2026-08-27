import type { NovelMetadata } from '../types';

type StoredLocalSecrets = Record<string, string[]>;
type NovelBindingSource = Pick<NovelMetadata, 'id' | 'modelConfig'>;
type StoredNovelBinding = {
  hasModelConfig: boolean;
  source?: 'platform' | 'user-profile';
  userApiProfileId?: string;
  userApiProfileStorageMode?: 'server' | 'local';
};
type StoredNovelBindings = Record<string, StoredNovelBinding>;
type StoredUserApiState = {
  defaultLocalProfileId?: string;
};

const LEGACY_LOCAL_SECRET_KEY = 'nw_user_api_local_secrets_v1';
const NOVEL_BINDING_KEY = 'nw_user_api_novel_bindings_v1';
const USER_API_STATE_KEY = 'nw_user_api_state_v1';
let volatileLocalSecrets: StoredLocalSecrets = {};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function clearLegacyPersistedLocalSecrets(
  storage?: Pick<Storage, 'removeItem'>,
): void {
  const target = storage
    ?? (canUseStorage() ? window.localStorage : undefined);
  if (!target) return;
  try {
    target.removeItem(LEGACY_LOCAL_SECRET_KEY);
  } catch {
    // Cleanup must not block the API settings page in restricted browser modes.
  }
}

function cloneLocalSecrets(value: StoredLocalSecrets): StoredLocalSecrets {
  return Object.fromEntries(
    Object.entries(value).map(([profileId, apiKeys]) => [profileId, [...apiKeys]]),
  );
}

function readLocalSecrets(): StoredLocalSecrets {
  clearLegacyPersistedLocalSecrets();
  return cloneLocalSecrets(volatileLocalSecrets);
}

function writeLocalSecrets(value: StoredLocalSecrets): void {
  clearLegacyPersistedLocalSecrets();
  volatileLocalSecrets = cloneLocalSecrets(value);
}

function readNovelBindings(): StoredNovelBindings {
  return readJson<StoredNovelBindings>(NOVEL_BINDING_KEY, {});
}

function writeNovelBindings(value: StoredNovelBindings): void {
  writeJson(NOVEL_BINDING_KEY, value);
}

function readUserApiState(): StoredUserApiState {
  return readJson<StoredUserApiState>(USER_API_STATE_KEY, {});
}

function writeUserApiState(value: StoredUserApiState): void {
  writeJson(USER_API_STATE_KEY, value);
}

export function saveLocalProfileSecret(profileId: string, apiKey: string): void {
  saveLocalProfileSecrets(profileId, apiKey ? [apiKey] : []);
}

export function saveLocalProfileSecrets(profileId: string, apiKeys: string[]): void {
  const normalized = Array.from(new Set(apiKeys.map((item) => item.trim()).filter(Boolean)));
  const next = readLocalSecrets();
  if (normalized.length === 0) {
    delete next[profileId];
  } else {
    next[profileId] = normalized;
  }
  writeLocalSecrets(next);
}

export function removeLocalProfileSecret(profileId: string): void {
  const next = readLocalSecrets();
  delete next[profileId];
  writeLocalSecrets(next);
}

export function getLocalProfileSecret(profileId: string): string {
  return getLocalProfileSecrets(profileId)[0] ?? '';
}

export function getLocalProfileSecrets(profileId: string): string[] {
  const raw = readLocalSecrets()[profileId];
  if (Array.isArray(raw)) {
    return raw.map((item) => item.trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [raw.trim()];
  }
  return [];
}

export function hasLocalProfileSecret(profileId: string): boolean {
  return getLocalProfileSecrets(profileId).length > 0;
}

export function syncUserApiProfileState(profiles: Array<{
  id: string;
  storageMode: 'server' | 'local';
  isDefault: boolean;
  enabled: boolean;
}>): void {
  const defaultLocal = profiles.find((profile) => profile.storageMode === 'local' && profile.isDefault && profile.enabled);
  writeUserApiState({
    defaultLocalProfileId: defaultLocal?.id,
  });
}

export function syncNovelUserApiBinding(novel: NovelMetadata): void {
  const bindings = readNovelBindings();
  bindings[novel.id] = {
    hasModelConfig: Boolean(novel.modelConfig),
    source: novel.modelConfig?.source,
    userApiProfileId: novel.modelConfig?.userApiProfileId,
    userApiProfileStorageMode: novel.modelConfig?.userApiProfileStorageMode,
  };
  writeNovelBindings(bindings);
}

export function syncNovelCollectionBindings(novels: NovelBindingSource[]): void {
  const next: StoredNovelBindings = {};
  for (const novel of novels) {
    next[novel.id] = {
      hasModelConfig: Boolean(novel.modelConfig),
      source: novel.modelConfig?.source,
      userApiProfileId: novel.modelConfig?.userApiProfileId,
      userApiProfileStorageMode: novel.modelConfig?.userApiProfileStorageMode,
    };
  }
  writeNovelBindings(next);
}

export function clearNovelUserApiBinding(novelId: string): void {
  const bindings = readNovelBindings();
  delete bindings[novelId];
  writeNovelBindings(bindings);
}

function encodeTransientHeader(profileId: string, apiKeys: string[]): string {
  const payload = JSON.stringify({ profileId, apiKeys });
  return btoa(unescape(encodeURIComponent(payload)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function getTransientUserApiHeaderForDefaultProfile(): string | null {
  const defaultLocalProfileId = readUserApiState().defaultLocalProfileId;
  if (!defaultLocalProfileId) return null;
  const apiKeys = getLocalProfileSecrets(defaultLocalProfileId);
  if (apiKeys.length === 0) return null;
  return encodeTransientHeader(defaultLocalProfileId, apiKeys);
}

export function getTransientUserApiHeaderForNovelId(novelId: string): string | null {
  const binding = readNovelBindings()[novelId];
  if (binding?.source === 'user-profile') {
    if (!binding.userApiProfileId || binding.userApiProfileStorageMode !== 'local') return null;
    const apiKeys = getLocalProfileSecrets(binding.userApiProfileId);
    if (apiKeys.length === 0) return null;
    return encodeTransientHeader(binding.userApiProfileId, apiKeys);
  }

  if (binding?.hasModelConfig) {
    return null;
  }

  return getTransientUserApiHeaderForDefaultProfile();
}
