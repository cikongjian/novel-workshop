import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AuthDb } from './types.js';
import {
  buildLocalMaskedApiKeySummary,
  buildServerMaskedApiKeySummary,
  decryptUserApiKeyBundle,
  encryptUserApiKeyBundle,
  inferLocalApiKeyCount,
  inferServerApiKeyCount,
  normalizeUserApiKeyList,
} from './user-api-key-bundle.js';

export type UserApiProfileScope = 'model' | 'image-generation';
export type UserApiStorageMode = 'server' | 'local';

export interface UserApiProfile {
  id: string;
  userId: string;
  scope: UserApiProfileScope;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  storageMode: UserApiStorageMode;
  maskedApiKey: string;
  apiKeyCount: number;
  isDefault: boolean;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserApiProfileWithSecret extends UserApiProfile {
  apiKeys: string[];
}

export interface UpsertUserApiProfileInput {
  name: string;
  scope?: UserApiProfileScope;
  provider: string;
  model: string;
  baseUrl?: string;
  storageMode: UserApiStorageMode;
  apiKey?: string;
  apiKeys?: string[];
  apiKeyCount?: number;
  isDefault?: boolean;
  enabled?: boolean;
}

interface UserApiProfileRow extends RowDataPacket {
  id: string;
  user_id: string;
  scope: UserApiProfileScope;
  name: string;
  provider: string;
  model: string;
  base_url: string;
  storage_mode: UserApiStorageMode;
  encrypted_api_key: string | null;
  masked_api_key: string;
  is_default: number;
  enabled: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

function resolveApiKeyCount(row: UserApiProfileRow): number {
  if (row.storage_mode === 'local') {
    return inferLocalApiKeyCount(row.masked_api_key);
  }
  return inferServerApiKeyCount(row.masked_api_key);
}

function toProfile(row: UserApiProfileRow, apiKeyCount: number): UserApiProfile {
  return {
    id: row.id,
    userId: row.user_id,
    scope: row.scope,
    name: row.name,
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url,
    storageMode: row.storage_mode,
    maskedApiKey: row.masked_api_key,
    apiKeyCount,
    isDefault: Boolean(row.is_default),
    enabled: Boolean(row.enabled),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function clearDefaultFlag(db: AuthDb, userId: string, scope: UserApiProfileScope, excludeId?: string): Promise<void> {
  const params: string[] = [userId, scope];
  let sql = 'UPDATE user_api_profiles SET is_default = 0 WHERE user_id = ? AND scope = ?';
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  await db.execute(sql, params);
}

export async function listUserApiProfiles(db: AuthDb, userId: string): Promise<UserApiProfile[]> {
  const [rows] = await db.execute<UserApiProfileRow[]>(
    `SELECT id, user_id, scope, name, provider, model, base_url, storage_mode,
            encrypted_api_key, masked_api_key, is_default, enabled, last_used_at, created_at, updated_at
       FROM user_api_profiles
      WHERE user_id = ?
      ORDER BY is_default DESC, updated_at DESC`,
    [userId],
  );
  return rows.map((row) => toProfile(row, resolveApiKeyCount(row)));
}

export async function getUserApiProfile(
  db: AuthDb,
  userId: string,
  profileId: string,
): Promise<UserApiProfile | null> {
  const [rows] = await db.execute<UserApiProfileRow[]>(
    `SELECT id, user_id, scope, name, provider, model, base_url, storage_mode,
            encrypted_api_key, masked_api_key, is_default, enabled, last_used_at, created_at, updated_at
       FROM user_api_profiles
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [profileId, userId],
  );
  return rows[0] ? toProfile(rows[0], resolveApiKeyCount(rows[0])) : null;
}

export async function getUserApiProfileWithSecret(
  db: AuthDb,
  userId: string,
  profileId: string,
): Promise<UserApiProfileWithSecret | null> {
  const [rows] = await db.execute<UserApiProfileRow[]>(
    `SELECT id, user_id, scope, name, provider, model, base_url, storage_mode,
            encrypted_api_key, masked_api_key, is_default, enabled, last_used_at, created_at, updated_at
       FROM user_api_profiles
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
    [profileId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const apiKeys = row.storage_mode === 'server'
    ? decryptUserApiKeyBundle(row.encrypted_api_key)
    : [];
  const apiKeyCount = row.storage_mode === 'server'
    ? apiKeys.length
    : inferLocalApiKeyCount(row.masked_api_key);
  return {
    ...toProfile(row, apiKeyCount),
    apiKeys,
  };
}

export async function getDefaultUserApiProfileWithSecret(
  db: AuthDb,
  userId: string,
  scope: UserApiProfileScope = 'model',
): Promise<UserApiProfileWithSecret | null> {
  const [rows] = await db.execute<UserApiProfileRow[]>(
    `SELECT id, user_id, scope, name, provider, model, base_url, storage_mode,
            encrypted_api_key, masked_api_key, is_default, enabled, last_used_at, created_at, updated_at
       FROM user_api_profiles
      WHERE user_id = ? AND scope = ? AND is_default = 1 AND enabled = 1
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId, scope],
  );
  const row = rows[0];
  if (!row) return null;
  const apiKeys = row.storage_mode === 'server'
    ? decryptUserApiKeyBundle(row.encrypted_api_key)
    : [];
  const apiKeyCount = row.storage_mode === 'server'
    ? apiKeys.length
    : inferLocalApiKeyCount(row.masked_api_key);
  return {
    ...toProfile(row, apiKeyCount),
    apiKeys,
  };
}

export async function createUserApiProfile(
  db: AuthDb,
  userId: string,
  input: UpsertUserApiProfileInput,
): Promise<UserApiProfile> {
  const id = randomUUID();
  const scope = input.scope ?? 'model';
  const storageMode = input.storageMode;
  const enabled = input.enabled ?? true;
  const isDefault = input.isDefault ?? false;
  const apiKeys = normalizeUserApiKeyList(input.apiKeys, input.apiKey);
  const apiKeyCount = storageMode === 'server'
    ? apiKeys.length
    : Math.max(1, input.apiKeyCount ?? apiKeys.length);
  const encryptedApiKey = storageMode === 'server'
    ? encryptUserApiKeyBundle(apiKeys)
    : null;
  const maskedApiKey = storageMode === 'server'
    ? buildServerMaskedApiKeySummary(apiKeys)
    : buildLocalMaskedApiKeySummary(apiKeyCount);

  if (storageMode === 'server' && apiKeys.length === 0) {
    throw new Error('平台缓存模式必须提供 API Key');
  }

  if (isDefault) {
    await clearDefaultFlag(db, userId, scope);
  }

  await db.execute(
    `INSERT INTO user_api_profiles (
      id, user_id, scope, name, provider, model, base_url, storage_mode,
      encrypted_api_key, masked_api_key, is_default, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      scope,
      input.name.trim(),
      input.provider.trim(),
      input.model.trim(),
      input.baseUrl?.trim() ?? '',
      storageMode,
      encryptedApiKey,
      maskedApiKey,
      isDefault ? 1 : 0,
      enabled ? 1 : 0,
    ],
  );

  const created = await getUserApiProfile(db, userId, id);
  if (!created) {
    throw new Error('创建用户 API 配置失败');
  }
  return created;
}

export async function updateUserApiProfile(
  db: AuthDb,
  userId: string,
  profileId: string,
  input: UpsertUserApiProfileInput,
): Promise<UserApiProfile> {
  const existing = await getUserApiProfileWithSecret(db, userId, profileId);
  if (!existing) {
    throw new Error('用户 API 配置不存在');
  }

  const scope = input.scope ?? existing.scope;
  const storageMode = input.storageMode;
  const nextApiKeys = normalizeUserApiKeyList(input.apiKeys, input.apiKey);
  let encryptedApiKey: string | null = null;
  let maskedApiKey = existing.maskedApiKey;

  if (storageMode === 'server') {
    const resolvedApiKeys = nextApiKeys.length > 0 ? nextApiKeys : existing.apiKeys;
    if (resolvedApiKeys.length === 0) {
      throw new Error('平台缓存模式必须提供 API Key');
    }
    encryptedApiKey = encryptUserApiKeyBundle(resolvedApiKeys);
    maskedApiKey = buildServerMaskedApiKeySummary(resolvedApiKeys);
  } else {
    encryptedApiKey = null;
    const resolvedLocalCount = input.apiKeyCount
      ?? (nextApiKeys.length > 0 ? nextApiKeys.length : existing.apiKeyCount);
    maskedApiKey = buildLocalMaskedApiKeySummary(Math.max(1, resolvedLocalCount));
  }

  const isDefault = input.isDefault ?? existing.isDefault;
  if (isDefault) {
    await clearDefaultFlag(db, userId, scope, profileId);
  }

  await db.execute(
    `UPDATE user_api_profiles
        SET scope = ?,
            name = ?,
            provider = ?,
            model = ?,
            base_url = ?,
            storage_mode = ?,
            encrypted_api_key = ?,
            masked_api_key = ?,
            is_default = ?,
            enabled = ?
      WHERE id = ? AND user_id = ?`,
    [
      scope,
      input.name.trim(),
      input.provider.trim(),
      input.model.trim(),
      input.baseUrl?.trim() ?? '',
      storageMode,
      encryptedApiKey,
      maskedApiKey,
      isDefault ? 1 : 0,
      (input.enabled ?? existing.enabled) ? 1 : 0,
      profileId,
      userId,
    ],
  );

  const updated = await getUserApiProfile(db, userId, profileId);
  if (!updated) {
    throw new Error('更新用户 API 配置失败');
  }
  return updated;
}

export async function deleteUserApiProfile(
  db: AuthDb,
  userId: string,
  profileId: string,
): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    'DELETE FROM user_api_profiles WHERE id = ? AND user_id = ?',
    [profileId, userId],
  );
  return result.affectedRows > 0;
}

export async function markUserApiProfileUsed(
  db: AuthDb,
  userId: string,
  profileId: string,
): Promise<void> {
  await db.execute(
    'UPDATE user_api_profiles SET last_used_at = ? WHERE id = ? AND user_id = ?',
    [new Date().toISOString(), profileId, userId],
  );
}
