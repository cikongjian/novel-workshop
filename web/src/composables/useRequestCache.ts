import { ref } from 'vue';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export function useRequestCache<T>(ttl = 30000) {
  const cache = new Map<string, CacheEntry<T>>();
  const pending = new Map<string, Promise<T>>();

  async function cachedFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    // 1. 检查缓存是否有效
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    // 2. 请求去重：如果同一 key 正在请求中，复用 Promise
    const existing = pending.get(key);
    if (existing) return existing;
    // 3. 发起新请求
    const promise = fetcher().then(data => {
      cache.set(key, { data, timestamp: Date.now() });
      pending.delete(key);
      return data;
    }).catch(err => {
      pending.delete(key);
      throw err;
    });
    pending.set(key, promise);
    return promise;
  }

  function invalidate(key?: string) {
    if (key) { cache.delete(key); } else { cache.clear(); }
  }

  return { cachedFetch, invalidate };
}
