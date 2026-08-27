/**
 * TTS 音频缓存：基于 IndexedDB 的内容寻址缓存。
 *
 * 缓存 key = `novelId:voice:rate:textHash`，同一段文本+音色+语速+小说的合成结果只请求一次。
 * value 存 { audio, duration, ts, novelId, novelTitle }，支持按小说分组查询和清理。
 */

import { brand } from '../config/brand';

const DB_NAME = `${brand.slug}-tts-cache`;
const STORE_NAME = 'audio';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME);
        store.createIndex('novelId', 'novelId', { unique: false });
      } else {
        // v1 -> v2：补充 novelId 索引（已存在 store 时）
        const store = req.transaction!.objectStore(STORE_NAME);
        if (!store.indexNames.contains('novelId')) {
          store.createIndex('novelId', 'novelId', { unique: false });
        }
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        dbPromise = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/** djb2 字符串哈希，输出 36 进制短串 */
function textHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** 构造缓存 key */
export function makeCacheKey(novelId: string, voice: string, rate: string, text: string): string {
  return `${novelId}:${voice}:${rate}:${textHash(text)}`;
}

export interface CachedAudio {
  audio: string;
  duration: number;
  ts: number;
  novelId: string;
  novelTitle: string;
}

/** 读取缓存，未命中返回 null */
export async function getCachedAudio(key: string): Promise<CachedAudio | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (result && typeof result.audio === 'string') {
          resolve(result as CachedAudio);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[TTSCache] 读取失败', err);
    return null;
  }
}

/** 写入缓存（静默失败，不影响播放） */
export async function setCachedAudio(key: string, value: Omit<CachedAudio, 'ts'>): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ ...value, ts: Date.now() } satisfies CachedAudio, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('[TTSCache] 写入事务失败', tx.error);
        resolve();
      };
    });
  } catch (err) {
    console.warn('[TTSCache] 写入失败', err);
  }
}

export interface NovelCacheInfo {
  novelId: string;
  novelTitle: string;
  count: number;
  sizeBytes: number;
}

/** 按小说分组查询缓存概况 */
export async function getTTSCacheByNovel(): Promise<NovelCacheInfo[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const cursorReq = tx.objectStore(STORE_NAME).openCursor();
      const map = new Map<string, NovelCacheInfo>();

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const val = cursor.value as CachedAudio | undefined;
          if (val && typeof val.audio === 'string') {
            const id = val.novelId || 'unknown';
            const existing = map.get(id);
            const size = Math.floor(val.audio.length * 0.75);
            if (existing) {
              existing.count += 1;
              existing.sizeBytes += size;
            } else {
              map.set(id, {
                novelId: id,
                novelTitle: val.novelTitle || '未知作品',
                count: 1,
                sizeBytes: size,
              });
            }
          }
          cursor.continue();
        } else {
          resolve(Array.from(map.values()).sort((a, b) => b.sizeBytes - a.sizeBytes));
        }
      };
      cursorReq.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** 清除全部缓存 */
export async function clearTTSCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/** 清除指定小说的缓存 */
export async function clearNovelCache(novelId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('novelId');
      const req = index.openCursor(IDBKeyRange.only(novelId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
