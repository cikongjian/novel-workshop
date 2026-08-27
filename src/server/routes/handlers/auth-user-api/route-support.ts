import { z } from 'zod';
import type { AuthDb } from '../../../../auth/types.js';
import {
  createUserApiProfile,
  deleteUserApiProfile,
  getUserApiProfileWithSecret,
  listUserApiProfiles,
  updateUserApiProfile,
} from '../../../../auth/user-api-service.js';
import { getProfile } from '../../../../auth/user-service.js';
import { getConfig } from '../../../../config/index.js';
import { createNovelModelClient } from '../../../../models/provider.js';
import { OpenAICompatibleImageClient } from '../../../../models/image-client.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export const UpsertUserApiProfileSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(80, '名称不能超过 80 个字符'),
  scope: z.enum(['model', 'image-generation']).default('model'),
  provider: z.string().trim().min(1, '供应商不能为空').max(40),
  model: z.string().trim().min(1, '模型不能为空').max(120),
  baseUrl: z.string().trim().max(500).optional().default(''),
  storageMode: z.enum(['server', 'local']),
  apiKey: z.string().optional(),
  apiKeys: z.array(z.string()).max(20, 'API Key 最多支持 20 个').optional(),
  apiKeyCount: z.number().int().min(0).max(20).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const TestUserApiProfileSchema = z.object({
  apiKey: z.string().optional(),
  apiKeys: z.array(z.string()).max(20, 'API Key 最多支持 20 个').optional(),
});

export const TestUserApiDraftSchema = z.object({
  provider: z.string().trim().min(1, '供应商不能为空').max(40),
  model: z.string().trim().min(1, '模型不能为空').max(120),
  baseUrl: z.string().trim().max(500).optional().default(''),
  scope: z.enum(['model', 'image-generation']).default('model'),
  storageMode: z.enum(['server', 'local']).default('server'),
  apiKey: z.string().optional(),
  apiKeys: z.array(z.string()).max(20, 'API Key 最多支持 20 个').optional(),
});

export type UserApiPermission = {
  profile: Awaited<ReturnType<typeof getProfile>>;
  allowed: boolean;
  reason: string;
};

export function isPlatformCacheAvailable(): boolean {
  const secret = process.env.USER_API_ENCRYPTION_SECRET?.trim() ?? '';
  return secret.length >= 32;
}

export function getPlatformCacheUnavailableReason(): string {
  return '平台缓存模式不可用：缺少 USER_API_ENCRYPTION_SECRET。请先在 .env 中配置至少 32 位加密密钥，或改用仅本地保存。';
}

export function canManageUserApi(profile: Awaited<ReturnType<typeof getProfile>>): boolean {
  if (!profile) return false;
  return profile.role === 'admin' || profile.creatorStatus === 'approved';
}

export async function requireManagePermission(db: AuthDb, userId: string): Promise<UserApiPermission> {
  const profile = await getProfile(db, userId);
  if (!profile) {
    throw new Error('用户不存在');
  }
  if (!getConfig().userApi.enabled) {
    return {
      profile,
      allowed: false,
      reason: '管理员已关闭用户 API 功能',
    };
  }
  if (!canManageUserApi(profile)) {
    return {
      profile,
      allowed: false,
      reason: '仅管理员或已通过审核的作者可以管理个人 API',
    };
  }
  return {
    profile,
    allowed: true,
    reason: '',
  };
}

export function normalizeApiKeys(apiKeys?: string[], fallbackApiKey?: string): string[] {
  const normalized = (apiKeys ?? []).map((item) => item.trim()).filter(Boolean);
  const fallback = fallbackApiKey?.trim();
  if (normalized.length === 0 && fallback) {
    normalized.push(fallback);
  }
  return normalized;
}

export function validateStorageMode(storageMode: 'server' | 'local') {
  const config = getConfig().userApi;
  if (storageMode === 'server' && !config.allowPlatformCache) {
    return { ok: false as const, status: 403, error: '管理员已关闭平台缓存模式' };
  }
  if (storageMode === 'server' && !isPlatformCacheAvailable()) {
    return { ok: false as const, status: 400, error: getPlatformCacheUnavailableReason() };
  }
  if (storageMode === 'local' && !config.allowLocalOnly) {
    return { ok: false as const, status: 403, error: '管理员已关闭仅本地保存模式' };
  }
  return { ok: true as const };
}

export async function testUserApiConnection(params: {
  provider: string;
  model: string;
  baseUrl: string;
  apiKeys: string[];
}) {
  const client = createNovelModelClient({
    provider: params.provider as any,
    apiKeys: params.apiKeys,
    model: params.model,
    baseUrl: params.baseUrl,
  });
  if (!client) {
    return {
      success: false,
      error: '当前配置缺少有效模型配置',
    };
  }

  try {
    const startTime = Date.now();
    const result = await client.chat(
      [{ role: 'user', content: 'Hello, please reply with one short sentence.' }],
      { maxTokens: 60 },
    );
    const elapsed = Date.now() - startTime;

    return {
      success: true,
      reply: result.content,
      model: result.model,
      elapsed,
    };
  } catch (error) {
    return {
      success: false,
      error: safeErrorMessage(error, '测试失败'),
    };
  }
}

export async function testImageGenerationConnection(params: {
  provider: string;
  model: string;
  baseUrl: string;
  apiKeys: string[];
}) {
  try {
    const apiKey = params.apiKeys[0];
    if (!apiKey) {
      return {
        success: false,
        error: '请先填写 API Key',
      };
    }

    const client = new OpenAICompatibleImageClient(
      apiKey,
      params.model || 'gpt-image-2',
      params.baseUrl || undefined,
    );

    const startTime = Date.now();
    const result = await client.generate(
      'A simple test image: a starry night sky over a tranquil lake',
      { size: '1024x1024' },
    );
    const elapsed = Date.now() - startTime;

    return {
      success: true,
      reply: '图片生成测试完成',
      model: params.model,
      elapsed,
      imageUrl: result.imageUrl ?? undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: safeErrorMessage(error, '图片生成测试失败'),
    };
  }
}

export const userApiService = {
  createUserApiProfile,
  deleteUserApiProfile,
  getUserApiProfileWithSecret,
  listUserApiProfiles,
  updateUserApiProfile,
};
