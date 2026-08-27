/**
 * API Key 轮换与限速容错
 *
 * 支持同一供应商配置多个 API Key，遇到限速错误时自动切换到下一个 Key。
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('models:key-rotation');

/** 限速相关的错误关键词 */
const RATE_LIMIT_PATTERNS = [
  '429',
  'rate limit',
  'rate_limit',
  'quota exceeded',
  'too many requests',
  'resource_exhausted',
  'capacity',
  'overloaded',
];

/**
 * 判断错误消息是否为限速错误
 */
export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return RATE_LIMIT_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * 解析逗号分隔的多 Key 配置字符串，去重去空。
 */
export function parseApiKeyList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const key = part.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

export type KeyRotationOptions<T> = {
  /** 供应商名称（用于日志） */
  provider: string;
  /** API Key 列表 */
  apiKeys: string[];
  /** 用指定 Key 执行实际调用 */
  execute: (apiKey: string) => Promise<T>;
  /** 自定义重试判断（默认使用 isRateLimitError） */
  shouldRetry?: (params: { apiKey: string; error: unknown; message: string; attempt: number }) => boolean;
};

/**
 * 带 Key 轮换的执行器。
 * 遇到限速错误时自动切换到下一个 Key，非限速错误直接抛出。
 */
export async function executeWithKeyRotation<T>(options: KeyRotationOptions<T>): Promise<T> {
  const { provider, apiKeys, execute, shouldRetry } = options;

  if (apiKeys.length === 0) {
    throw new Error(`${provider} 未配置 API Key`);
  }

  // 只有一个 Key 时直接执行，不走轮换逻辑
  if (apiKeys.length === 1) {
    return execute(apiKeys[0]);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const apiKey = apiKeys[attempt];
    try {
      return await execute(apiKey);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = shouldRetry
        ? shouldRetry({ apiKey, error, message, attempt })
        : isRateLimitError(message);

      if (!retryable || attempt + 1 >= apiKeys.length) {
        break;
      }

      const maskedKey = apiKey.length > 8
        ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
        : '****';
      log.warn(
        `${provider} Key ${maskedKey} 限速，切换到下一个 Key（第 ${attempt + 2}/${apiKeys.length} 个）`,
      );
    }
  }

  throw lastError;
}
