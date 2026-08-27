import type { IncomingHttpHeaders } from 'node:http';
import type { AuthDb } from '../../../auth/types.js';
import {
  getDefaultUserApiProfileWithSecret,
  getUserApiProfileWithSecret,
  markUserApiProfileUsed,
} from '../../../auth/user-api-service.js';
import { getConfig } from '../../../config/index.js';
import { createNovelModelClient } from '../../../models/provider.js';
import type { ModelClient } from '../../../models/types.js';
import type { NovelMetadata } from '../../../novel/types.js';
import { decryptNovelApiKey } from './novel-api-key-crypto.js';

type UserApiTransientHeader = {
  profileId: string;
  apiKey?: string;
  apiKeys?: string[];
};

export type ResolvedUserModelAccess = {
  client?: ModelClient;
  billingBypass: boolean;
  source: 'platform-global' | 'platform-novel' | 'user-default-server' | 'user-default-local' | 'user-profile-server' | 'user-profile-local';
  profileId?: string;
  profileName?: string;
  profileStorageMode?: 'server' | 'local';
  provider?: string;
  model?: string;
  baseUrl?: string;
  error?: string;
};

function parseTransientHeader(headers: IncomingHttpHeaders): UserApiTransientHeader | null {
  const raw = headers['x-nw-user-api-model'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.trim()) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<UserApiTransientHeader>;
    const apiKeys = Array.isArray(parsed.apiKeys)
      ? parsed.apiKeys.map((item) => item.trim()).filter(Boolean)
      : (parsed.apiKey?.trim() ? [parsed.apiKey.trim()] : []);
    if (!parsed.profileId || apiKeys.length === 0) return null;
    return {
      profileId: parsed.profileId,
      apiKey: apiKeys[0],
      apiKeys,
    };
  } catch {
    return null;
  }
}

function resolveNovelPlatformOverride(novel: NovelMetadata): ModelClient | undefined {
  if (!novel.modelConfig?.provider || !novel.modelConfig?.model) return undefined;
  if (novel.modelConfig.source === 'user-profile') return undefined;
  const plainApiKey = decryptNovelApiKey(novel.modelConfig.apiKey ?? '');
  return createNovelModelClient({
    provider: novel.modelConfig.provider as any,
    apiKey: plainApiKey,
    model: novel.modelConfig.model,
    baseUrl: novel.modelConfig.baseUrl ?? '',
  }) ?? undefined;
}

function createClientFromUserProfile(params: {
  provider: string;
  apiKeys: string[];
  model: string;
  baseUrl: string;
}): ModelClient | undefined {
  return createNovelModelClient({
    provider: params.provider as any,
    apiKeys: params.apiKeys,
    model: params.model,
    baseUrl: params.baseUrl,
  }) ?? undefined;
}

export async function resolveUserModelAccess(params: {
  authDb?: AuthDb;
  userId?: string;
  headers: IncomingHttpHeaders;
  novel?: NovelMetadata | null;
}): Promise<ResolvedUserModelAccess> {
  const fallbackClient = params.novel ? resolveNovelPlatformOverride(params.novel) : undefined;
  const fallback: ResolvedUserModelAccess = {
    client: fallbackClient,
    billingBypass: false,
    source: fallbackClient ? 'platform-novel' : 'platform-global',
  };

  const featureConfig = getConfig().userApi;
  if (!featureConfig.enabled || !params.authDb || !params.userId || params.userId === 'dev') {
    return fallback;
  }

  // 不再提前 return——即使小说有平台级模型覆盖，仍继续检查用户默认
  // 私有 Key 来决定 billingBypass（后续 defaultProfile 逻辑自然处理）

  const transient = parseTransientHeader(params.headers);
  const bindingProfileId = params.novel?.modelConfig?.source === 'user-profile'
    ? params.novel.modelConfig.userApiProfileId
    : undefined;

  if (bindingProfileId) {
    const profile = await getUserApiProfileWithSecret(params.authDb, params.userId, bindingProfileId);
    if (!profile || !profile.enabled) {
      // 个人 API 不可用时静默回退到平台默认（兼容 fork 小说等场景）
      return fallback;
    }
    if (profile.storageMode === 'local') {
      if (!transient || transient.profileId !== profile.id) {
        return {
          ...fallback,
          error: `当前小说绑定的是本地 API「${profile.name}」，本设备尚未提供对应密钥`,
        };
      }
      const client = createClientFromUserProfile({
        provider: profile.provider,
        apiKeys: transient.apiKeys ?? [],
        model: profile.model,
        baseUrl: profile.baseUrl,
      });
      if (!client) {
        return {
          ...fallback,
          error: `本地 API「${profile.name}」缺少有效模型配置`,
        };
      }
      void markUserApiProfileUsed(params.authDb, params.userId, profile.id);
      return {
        client,
        billingBypass: true,
        source: 'user-profile-local',
        profileId: profile.id,
        profileName: profile.name,
        profileStorageMode: profile.storageMode,
        provider: profile.provider,
        model: profile.model,
        baseUrl: profile.baseUrl,
      };
    }

    const client = createClientFromUserProfile({
      provider: profile.provider,
      apiKeys: profile.apiKeys,
      model: profile.model,
      baseUrl: profile.baseUrl,
    });
    if (!client) {
      return {
        ...fallback,
        error: `个人 API「${profile.name}」缺少有效模型配置`,
      };
    }
    void markUserApiProfileUsed(params.authDb, params.userId, profile.id);
    return {
      client,
      billingBypass: true,
      source: 'user-profile-server',
      profileId: profile.id,
      profileName: profile.name,
      profileStorageMode: profile.storageMode,
      provider: profile.provider,
      model: profile.model,
      baseUrl: profile.baseUrl,
    };
  }

  const defaultProfile = await getDefaultUserApiProfileWithSecret(params.authDb, params.userId, 'model');
  if (!defaultProfile || !defaultProfile.enabled) {
    return fallback;
  }

  if (defaultProfile.storageMode === 'local') {
    if (!transient || transient.profileId !== defaultProfile.id) {
      return fallback;
    }
    const client = createClientFromUserProfile({
      provider: defaultProfile.provider,
      apiKeys: transient.apiKeys ?? [],
      model: defaultProfile.model,
      baseUrl: defaultProfile.baseUrl,
    });
    if (!client) return fallback;
    void markUserApiProfileUsed(params.authDb, params.userId, defaultProfile.id);
    return {
      client,
      billingBypass: true,
      source: 'user-default-local',
      profileId: defaultProfile.id,
      profileName: defaultProfile.name,
      profileStorageMode: defaultProfile.storageMode,
      provider: defaultProfile.provider,
      model: defaultProfile.model,
      baseUrl: defaultProfile.baseUrl,
    };
  }

  const client = createClientFromUserProfile({
    provider: defaultProfile.provider,
    apiKeys: defaultProfile.apiKeys,
    model: defaultProfile.model,
    baseUrl: defaultProfile.baseUrl,
  });
  if (!client) return fallback;
  void markUserApiProfileUsed(params.authDb, params.userId, defaultProfile.id);
  return {
    client,
    billingBypass: true,
    source: 'user-default-server',
    profileId: defaultProfile.id,
    profileName: defaultProfile.name,
    profileStorageMode: defaultProfile.storageMode,
    provider: defaultProfile.provider,
    model: defaultProfile.model,
    baseUrl: defaultProfile.baseUrl,
  };
}
