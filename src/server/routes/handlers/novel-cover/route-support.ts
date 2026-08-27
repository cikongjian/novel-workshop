import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ImageGenerationClient, ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { CharacterProfile, NovelMetadata, OutlineData } from '../../../../novel/types.js';
import { safeFetch, SAFE_FETCH_RESPONSE_LIMITS } from '../../../../utils/safe-fetch.js';
import { saveNovelCoverFile } from '../../helpers/novel-cover-storage.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';
import { resolveHttpErrorStatus } from '../shared/http-error-response.js';

export type NovelCoverRouteDeps = {
  novelManager: NovelManager;
  modelClient?: ModelClient;
  imageClient?: ImageGenerationClient;
  authDb?: import('../../../../auth/types.js').AuthDb;
  bookStoreManager?: BookStoreManager;
  contentAuditService?: import('../../../../bookstore/content-audit-service.js').ContentAuditService;
  billingService?: import('../../../../billing/billing-service.js').BillingService;
};

export async function resolveUserImageClient(params: {
  authDb?: import('../../../../auth/types.js').AuthDb;
  userId?: string;
  fallbackClient?: ImageGenerationClient;
}): Promise<ImageGenerationClient | undefined> {
  if (!params.authDb || !params.userId || params.userId === 'dev') {
    return params.fallbackClient;
  }
  try {
    const { getDefaultUserApiProfileWithSecret } = await import('../../../../auth/user-api-service.js');
    const profile = await getDefaultUserApiProfileWithSecret(params.authDb, params.userId, 'image-generation');
    if (!profile || !profile.enabled || profile.apiKeys.length === 0) {
      return params.fallbackClient;
    }
    const { OpenAICompatibleImageClient } = await import('../../../../models/image-client.js');
    return new OpenAICompatibleImageClient(
      profile.apiKeys[0],
      profile.model || 'gpt-image-2',
      profile.baseUrl || undefined,
    );
  } catch {
    return params.fallbackClient;
  }
}

export const COVER_SIZE_FALLBACKS = ['1024x1536', '832x1216', '1024x1024'] as const;

export async function resolveGeneratedImageBytes(result: {
  b64Data?: string;
  imageUrl?: string;
}): Promise<{ bytes: Buffer; ext: string }> {
  if (result.b64Data) {
    return { bytes: Buffer.from(result.b64Data, 'base64'), ext: '.png' };
  }
  if (!result.imageUrl) {
    throw new Error('图像生成失败：未返回图像内容');
  }

  const response = await safeFetch(result.imageUrl, {
    maxResponseBytes: SAFE_FETCH_RESPONSE_LIMITS.image,
  });
  if (!response.ok) {
    throw new Error(`下载生成图像失败: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const ext = contentType.includes('webp')
    ? '.webp'
    : contentType.includes('jpeg') || contentType.includes('jpg')
      ? '.jpg'
      : '.png';

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    ext,
  };
}

export function resolveImageMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function buildCoverSizeAttemptOrder(requestedSize: string): string[] {
  const normalized = requestedSize.trim();
  const ordered = [normalized, ...COVER_SIZE_FALLBACKS.filter(size => size !== normalized)];
  return Array.from(new Set(ordered));
}

function shouldRetryWithSmallerSize(error: unknown): boolean {
  const statusCode = resolveHttpErrorStatus(error, 0);
  if ([401, 403, 404, 408, 429, 500, 502, 503, 504].includes(statusCode)) {
    return false;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (!message) return true;

  if (
    message.includes('401')
    || message.includes('403')
    || message.includes('unauthorized')
    || message.includes('forbidden')
    || message.includes('api key')
    || message.includes('auth')
    || message.includes('未授权')
    || message.includes('未配置')
  ) {
    return false;
  }

  return true;
}

export async function generateCoverImageWithFallback(
  imageClient: ImageGenerationClient,
  positivePrompt: string,
  negativePrompt: string,
  requestedSize: string,
): Promise<{
  generatedImage: Awaited<ReturnType<ImageGenerationClient['generate']>>;
  usedSize: string;
}> {
  const attemptedSizes = buildCoverSizeAttemptOrder(requestedSize);
  let lastError: unknown = null;

  for (let index = 0; index < attemptedSizes.length; index += 1) {
    const size = attemptedSizes[index];
    try {
      const generatedImage = await imageClient.generate(positivePrompt, {
        size,
        negativePrompt,
      });
      return { generatedImage, usedSize: size };
    } catch (error) {
      lastError = error;
      const canRetry = index < attemptedSizes.length - 1 && shouldRetryWithSmallerSize(error);
      if (!canRetry) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('封面生成失败');
}

export async function loadCoverGenerationContext(
  novelManager: NovelManager,
  novelId: string,
): Promise<{ novel: NovelMetadata; characters: CharacterProfile[]; outline?: OutlineData }> {
  const [novel, characters, outline] = await Promise.all([
    novelManager.getNovel(novelId),
    novelManager.getCharacters(novelId).catch(() => []),
    novelManager.getOutline(novelId).catch(() => undefined),
  ]);
  return { novel, characters, outline };
}

export async function ensureNovelAccess(
  req: import('express').Request,
  res: import('express').Response,
  novelManager: NovelManager,
  novelId: string,
): Promise<boolean> {
  const access = await checkNovelAccess(req, novelManager, novelId);
  if (!access.allowed) {
    res.status(access.status).json({ error: access.error });
    return false;
  }
  return true;
}

export async function persistGeneratedCover(params: {
  bookStoreManager?: BookStoreManager;
  bytes: Buffer;
  ext: string;
  generatedAt: string;
  novel: NovelMetadata;
  novelId: string;
  novelManager: NovelManager;
}): Promise<NovelMetadata> {
  const fileName = `cover-${params.generatedAt}${params.ext}`;
  await saveNovelCoverFile(
    params.novelManager,
    params.novelId,
    fileName,
    params.bytes,
    params.novel.coverImage,
  );
  const updatedNovel = await params.novelManager.updateNovel(params.novelId, { coverImage: fileName });
  if (params.bookStoreManager) {
    await params.bookStoreManager.onNovelCoverChanged(params.novelId);
  }
  return updatedNovel;
}
