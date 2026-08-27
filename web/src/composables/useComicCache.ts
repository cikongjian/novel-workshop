import type { ComicManifest } from '../api/comic';

/**
 * 章节漫画的浏览器本地缓存（IndexedDB）。
 *
 * 目的：生成后把图片缓存到本地，再次打开时优先读缓存——
 * 离线可看、历史不丢、不重复请求服务器。
 *
 * 与服务器端的关系：服务器留底（草稿，定期清理），本地缓存是作者端的
 * 稳定副本，即使服务器草稿被清理，本地仍可回看并重新发布上传。
 */

const DB_NAME = 'novel-comic-cache';
const DB_VERSION = 1;
const STORE = 'chapters';

export type CachedComicChapter = {
  key: string;
  novelId: string;
  chapter: number;
  manifest: ComicManifest;
  /** panelIndex → data URL（base64），用于离线渲染 */
  panelBlobs: Record<number, string>;
  cachedAt: number;
};

function chapterKey(novelId: string, chapter: number): string {
  return `${novelId}:${chapter}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 读取本地缓存的章节漫画；无缓存或异常返回 null（降级到服务器） */
export async function getCachedComic(novelId: string, chapter: number): Promise<CachedComicChapter | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(chapterKey(novelId, chapter));
      req.onsuccess = () => resolve((req.result as CachedComicChapter | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[comic-cache] 读取缓存失败，降级服务器', err);
    return null;
  }
}

/** 写入本地缓存；失败仅告警，不阻断主流程 */
export async function setCachedComic(data: CachedComicChapter): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[comic-cache] 写入缓存失败', err);
  }
}

/** 删除本地缓存（重新生成或清理时用） */
export async function deleteCachedComic(novelId: string, chapter: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(chapterKey(novelId, chapter));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[comic-cache] 删除缓存失败', err);
  }
}
