type CacheDeletion = Pick<CacheStorage, 'delete'>;

const LEGACY_API_CACHE_NAME = 'api-cache';

export async function clearLegacyPrivateApiCache(storage?: CacheDeletion): Promise<boolean> {
  const target = storage ?? (typeof caches !== 'undefined' ? caches : undefined);
  if (!target) return false;

  try {
    return await target.delete(LEGACY_API_CACHE_NAME);
  } catch {
    // Cache Storage may be unavailable in private browsing or embedded WebViews.
    return false;
  }
}
