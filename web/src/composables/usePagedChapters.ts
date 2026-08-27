import { computed, ref, type Ref } from 'vue';
import { fetchChapterPage, type ChapterPageOrder } from '../api/chapters';
import type { ChapterSummary } from '../types';

type UsePagedChaptersOptions = {
  pageSize?: number;
  order?: ChapterPageOrder;
};

export function usePagedChapters(
  novelId: Ref<string>,
  options: UsePagedChaptersOptions = {},
) {
  const pageSize = options.pageSize ?? 50;
  const order = options.order ?? 'desc';
  const chapters = ref<ChapterSummary[]>([]);
  const page = ref(0);
  const total = ref(0);
  const loading = ref(false);
  const loadingMore = ref(false);
  const hasMore = ref(false);
  let requestSerial = 0;

  const loadedCount = computed(() => chapters.value.length);

  async function loadFirstPage(): Promise<void> {
    const id = novelId.value;
    if (!id) {
      reset();
      return;
    }

    const serial = ++requestSerial;
    loading.value = true;
    try {
      const result = await fetchChapterPage(id, { page: 1, pageSize, order });
      if (serial !== requestSerial || id !== novelId.value) return;
      chapters.value = result.items;
      page.value = result.page;
      total.value = result.total;
      hasMore.value = result.hasMore;
    } finally {
      if (serial === requestSerial) {
        loading.value = false;
      }
    }
  }

  async function loadMore(): Promise<void> {
    const id = novelId.value;
    if (!id || loading.value || loadingMore.value || !hasMore.value) return;

    const nextPage = page.value + 1;
    const serial = ++requestSerial;
    loadingMore.value = true;
    try {
      const result = await fetchChapterPage(id, { page: nextPage, pageSize, order });
      if (serial !== requestSerial || id !== novelId.value) return;
      chapters.value = mergeChapters(chapters.value, result.items, order);
      page.value = result.page;
      total.value = result.total;
      hasMore.value = result.hasMore;
    } finally {
      if (serial === requestSerial) {
        loadingMore.value = false;
      }
    }
  }

  function upsert(summary: ChapterSummary): void {
    chapters.value = mergeChapters(chapters.value, [summary], order);
    total.value = Math.max(total.value, chapters.value.length);
  }

  function reset(): void {
    requestSerial += 1;
    chapters.value = [];
    page.value = 0;
    total.value = 0;
    hasMore.value = false;
    loading.value = false;
    loadingMore.value = false;
  }

  return {
    chapters,
    hasMore,
    loadedCount,
    loading,
    loadingMore,
    loadFirstPage,
    loadMore,
    reset,
    total,
    upsert,
  };
}

function mergeChapters(
  current: ChapterSummary[],
  next: ChapterSummary[],
  order: ChapterPageOrder,
): ChapterSummary[] {
  const map = new Map<number, ChapterSummary>();
  for (const chapter of current) {
    map.set(chapter.chapterNumber, chapter);
  }
  for (const chapter of next) {
    map.set(chapter.chapterNumber, chapter);
  }
  return Array.from(map.values()).sort((left, right) => (
    order === 'desc'
      ? right.chapterNumber - left.chapterNumber
      : left.chapterNumber - right.chapterNumber
  ));
}
