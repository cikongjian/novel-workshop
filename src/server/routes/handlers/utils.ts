import type { NovelMetadata } from '../../../novel/types.js';
import type { ModelClient } from '../../../models/types.js';
import { createNovelModelClient } from '../../../models/provider.js';
import { decryptNovelApiKey } from '../helpers/novel-api-key-crypto.js';

/** 根据小说级 modelConfig 创建覆盖用 ModelClient，无配置时返回 undefined */
export function resolveNovelModelOverride(novel: NovelMetadata): ModelClient | undefined {
  if (!novel.modelConfig?.provider || !novel.modelConfig?.model) return undefined;
  const client = createNovelModelClient({
    provider: novel.modelConfig.provider as any,
    apiKey: decryptNovelApiKey(novel.modelConfig.apiKey ?? ''),
    model: novel.modelConfig.model,
    baseUrl: novel.modelConfig.baseUrl ?? '',
  });
  return client ?? undefined;
}
