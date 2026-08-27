/**
 * 离线存储 composable
 * 基于 IndexedDB 封装，用于写作草稿本地暂存和离线数据缓存
 */
import { ref, readonly } from 'vue';
import { brand } from '../config/brand';

const DB_NAME = `${brand.slug}-offline`;
const DB_VERSION = 2;

interface DraftRecord {
  id: string;
  novelId: string;
  chapterId?: string;
  content: string;
  title?: string;
  updatedAt: number;
  synced: boolean;
}

interface DbSchema {
  drafts: DraftRecord;
  cache: { key: string; data: unknown; expiresAt: number };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('pushSubscriptions')) {
        db.createObjectStore('pushSubscriptions', { keyPath: 'endpoint' });
      }
      if (!db.objectStoreNames.contains('chapters')) {
        const chaptersStore = db.createObjectStore('chapters', { keyPath: 'id' });
        chaptersStore.createIndex('novelId', 'novelId', { unique: false });
        chaptersStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storeAction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = action(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ======= 写作草稿 =======

export function useOfflineDrafts() {
  const draftCount = ref(0);
  const syncing = ref(false);

  async function saveDraft(draft: {
    id: string;
    novelId: string;
    chapterId?: string;
    content: string;
    title?: string;
  }) {
    const record: DraftRecord = {
      ...draft,
      updatedAt: Date.now(),
      synced: false,
    };
    await storeAction('drafts', 'readwrite', (s) => s.put(record));
    await refreshCount();
  }

  async function getDraft(id: string): Promise<DraftRecord | undefined> {
    return storeAction('drafts', 'readonly', (s) => s.get(id));
  }

  async function getAllDrafts(): Promise<DraftRecord[]> {
    return storeAction('drafts', 'readonly', (s) => s.getAll());
  }

  async function deleteDraft(id: string) {
    await storeAction('drafts', 'readwrite', (s) => s.delete(id));
    await refreshCount();
  }

  async function markSynced(id: string) {
    const draft = await getDraft(id);
    if (draft) {
      draft.synced = true;
      await storeAction('drafts', 'readwrite', (s) => s.put(draft));
      await refreshCount();
    }
  }

  /** 获取所有未同步的草稿 */
  async function getUnsyncedDrafts(): Promise<DraftRecord[]> {
    const all = await getAllDrafts();
    return all.filter((d) => !d.synced);
  }

  async function refreshCount() {
    const all = await getAllDrafts();
    draftCount.value = all.filter((d) => !d.synced).length;
  }

  async function syncAll() {
    syncing.value = true;
    try {
      const unsynced = await getUnsyncedDrafts();
      for (const draft of unsynced) {
        try {
          // 调用服务端同步接口
          // await api.syncDraft(draft);
          await markSynced(draft.id);
        } catch {
          // 单条同步失败，继续下一条
          continue;
        }
      }
    } finally {
      syncing.value = false;
      await refreshCount();
    }
  }

  return {
    draftCount: readonly(draftCount),
    syncing: readonly(syncing),
    saveDraft,
    getDraft,
    getAllDrafts,
    deleteDraft,
    markSynced,
    getUnsyncedDrafts,
    syncAll,
    refreshCount,
  };
}

// ======= 通用缓存 =======

export function useOfflineCache() {
  async function set<T>(key: string, data: T, ttlMs = 5 * 60 * 1000) {
    await storeAction('cache', 'readwrite', (s) =>
      s.put({ key, data, expiresAt: Date.now() + ttlMs }),
    );
  }

  async function get<T>(key: string): Promise<T | undefined> {
    const entry = await storeAction(
      'cache',
      'readonly',
      (s) => s.get(key) as IDBRequest<{ key: string; data: T; expiresAt: number } | undefined>,
    );
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      await storeAction('cache', 'readwrite', (s) => s.delete(key));
      return undefined;
    }
    return entry.data;
  }

  async function remove(key: string) {
    await storeAction('cache', 'readwrite', (s) => s.delete(key));
  }

  async function clear() {
    await storeAction('cache', 'readwrite', (s) => s.clear());
  }

  return { set, get, remove, clear };
}

// ======= 推送订阅存储 =======

export function useOfflinePushSubscriptions() {
  async function save(sub: PushSubscription) {
    await storeAction('pushSubscriptions', 'readwrite', (s) =>
      s.put({ endpoint: sub.endpoint, subscription: sub.toJSON(), savedAt: Date.now() }),
    );
  }

  async function getAll(): Promise<PushSubscriptionJSON[]> {
    const records = await storeAction(
      'pushSubscriptions',
      'readonly',
      (s) =>
        s.getAll() as IDBRequest<
          { endpoint: string; subscription: PushSubscriptionJSON; savedAt: number }[]
        >,
    );
    return records.map((r) => r.subscription);
  }

  async function remove(endpoint: string) {
    await storeAction('pushSubscriptions', 'readwrite', (s) => s.delete(endpoint));
  }

  return { save, getAll, remove };
}

// ======= 离线章节缓存 =======

export interface CachedChapter {
  id: string;
  novelId: string;
  novelTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  content: string[];
  wordCount: number;
  cachedAt: number;
}

export function useOfflineChapterCache() {
  async function cacheChapter(chapter: {
    novelId: string;
    novelTitle: string;
    chapterNumber: number;
    chapterTitle: string;
    content: string[];
    wordCount: number;
  }): Promise<void> {
    const id = `${chapter.novelId}_${chapter.chapterNumber}`;
    const record: CachedChapter = {
      ...chapter,
      id,
      cachedAt: Date.now(),
    };
    await storeAction('chapters', 'readwrite', (s) => s.put(record));
  }

  async function getChapter(
    novelId: string,
    chapterNumber: number,
  ): Promise<CachedChapter | undefined> {
    const id = `${novelId}_${chapterNumber}`;
    return storeAction('chapters', 'readonly', (s) => s.get(id));
  }

  async function getCachedChapters(novelId: string): Promise<CachedChapter[]> {
    const all = await storeAction('chapters', 'readonly', (s) => s.getAll()) as CachedChapter[];
    return all.filter((c) => c.novelId === novelId).sort((a, b) => a.chapterNumber - b.chapterNumber);
  }

  async function getCachedNovels(): Promise<
    { novelId: string; novelTitle: string; chapterCount: number; lastCachedAt: number }[]
  > {
    const all = await storeAction('chapters', 'readonly', (s) => s.getAll()) as CachedChapter[];
    const map = new Map<string, { novelTitle: string; chapters: Set<number>; lastCachedAt: number }>();
    for (const c of all) {
      const entry = map.get(c.novelId);
      if (entry) {
        entry.chapters.add(c.chapterNumber);
        if (c.cachedAt > entry.lastCachedAt) entry.lastCachedAt = c.cachedAt;
      } else {
        map.set(c.novelId, {
          novelTitle: c.novelTitle,
          chapters: new Set([c.chapterNumber]),
          lastCachedAt: c.cachedAt,
        });
      }
    }
    return [...map.entries()].map(([novelId, v]) => ({
      novelId,
      novelTitle: v.novelTitle,
      chapterCount: v.chapters.size,
      lastCachedAt: v.lastCachedAt,
    }));
  }

  async function isChapterCached(novelId: string, chapterNumber: number): Promise<boolean> {
    const id = `${novelId}_${chapterNumber}`;
    const record = await storeAction('chapters', 'readonly', (s) => s.get(id));
    return !!record;
  }

  async function removeChapter(novelId: string, chapterNumber: number): Promise<void> {
    const id = `${novelId}_${chapterNumber}`;
    await storeAction('chapters', 'readwrite', (s) => s.delete(id));
  }

  async function removeNovel(novelId: string): Promise<void> {
    const all = await storeAction('chapters', 'readonly', (s) => s.getAll()) as CachedChapter[];
    for (const c of all) {
      if (c.novelId === novelId) {
        await storeAction('chapters', 'readwrite', (s) => s.delete(c.id));
      }
    }
  }

  async function getCacheSize(): Promise<{ chapterCount: number; estimatedBytes: number }> {
    const all = await storeAction('chapters', 'readonly', (s) => s.getAll()) as CachedChapter[];
    let bytes = 0;
    for (const c of all) {
      bytes += (c.chapterTitle || '').length * 2;
      bytes += c.content.reduce((sum, p) => sum + p.length * 2, 0);
    }
    return { chapterCount: all.length, estimatedBytes: bytes };
  }

  async function clearAll(): Promise<void> {
    await storeAction('chapters', 'readwrite', (s) => s.clear());
  }

  /**
   * 预缓存相邻章节（当前章前后各 N 章）
   * @param fetcher 章节内容获取函数，传入 chapterNumber，返回 { title, content } 或 null
   * @param novelId 作品 ID
   * @param novelTitle 作品标题
   * @param currentChapter 当前章节号
   * @param chapterNumbers 所有可用的章节号列表（已排序）
   * @param count 前后各预缓存几章，默认 2
   */
  async function prefetchAdjacentChapters(
    fetcher: (chapterNumber: number) => Promise<{ title: string; content: string } | null>,
    novelId: string,
    novelTitle: string,
    currentChapter: number,
    chapterNumbers: number[],
    count = 2,
  ): Promise<void> {
    const idx = chapterNumbers.indexOf(currentChapter);
    if (idx === -1) return;

    const targets: number[] = [];
    // 前 N 章（上一章、上上章...）
    for (let i = idx - 1; i >= Math.max(0, idx - count); i--) {
      targets.push(chapterNumbers[i]);
    }
    // 后 N 章（下一章、下下章...）
    for (let i = idx + 1; i <= Math.min(chapterNumbers.length - 1, idx + count); i++) {
      targets.push(chapterNumbers[i]);
    }

    for (const chapterNumber of targets) {
      const alreadyCached = await isChapterCached(novelId, chapterNumber);
      if (alreadyCached) continue;

      try {
        const result = await fetcher(chapterNumber);
        if (!result) continue;

        const raw = result.content;
        const paragraphs = raw.split(/\r?\n+/).map((item) => item.trim()).filter(Boolean);

        await cacheChapter({
          novelId,
          novelTitle,
          chapterNumber,
          chapterTitle: result.title,
          content: paragraphs,
          wordCount: paragraphs.reduce((s, p) => s + p.length, 0),
        });
      } catch {
        // 预缓存失败静默，不打扰阅读
      }
    }
  }

  return {
    cacheChapter,
    getChapter,
    getCachedChapters,
    getCachedNovels,
    isChapterCached,
    removeChapter,
    removeNovel,
    getCacheSize,
    clearAll,
    prefetchAdjacentChapters,
  };
}
