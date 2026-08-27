import { ref } from 'vue';
import {
  getBookStorePublicComic,
  type BookStorePublicComicManifest,
} from '../api/bookstore';

export function usePublicBookComic() {
  const manifest = ref<BookStorePublicComicManifest | null>(null);
  const loading = ref(false);
  const visible = ref(false);
  const error = ref('');
  let requestSeq = 0;

  async function load(bookId: string, chapterNumber: number | null | undefined): Promise<void> {
    const seq = ++requestSeq;
    manifest.value = null;
    error.value = '';
    if (!bookId || !chapterNumber) return;

    loading.value = true;
    try {
      const next = await getBookStorePublicComic(bookId, chapterNumber);
      if (seq === requestSeq) manifest.value = next;
    } catch (err) {
      if (seq === requestSeq) {
        error.value = err instanceof Error ? err.message : '漫画加载失败';
      }
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  function open(): void {
    if (manifest.value?.panels.length) visible.value = true;
  }

  function close(): void {
    visible.value = false;
  }

  return {
    manifest,
    loading,
    visible,
    error,
    load,
    open,
    close,
  };
}
