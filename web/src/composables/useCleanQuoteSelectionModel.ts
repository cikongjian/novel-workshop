import { computed, type Ref } from 'vue';
import type { CleanQuoteUsageItem, CleanQuoteUsageResponse } from '../api';

export type CleanQuoteDisplayExample = {
  id: string;
  before: string;
  after: string;
  quoteText?: string;
  recommended?: boolean;
};

export function useCleanQuoteSelectionModel(options: {
  preview: Ref<CleanQuoteUsageResponse | null>;
  selectedEditIdsByChapter: Ref<Record<number, string[]>>;
  expandedChapters: Ref<Array<string | number>>;
}) {
  function getDisplayExamples(item: CleanQuoteUsageItem): CleanQuoteDisplayExample[] {
    if (item.examples && item.examples.length > 0) {
      return item.examples.map((example, index) => ({
        id: example.id || `${item.chapterNumber}-example-${index}`,
        before: example.before,
        after: example.after,
        quoteText: example.quoteText,
        recommended: example.recommended,
      }));
    }
    return [{
      id: `${item.chapterNumber}-fallback`,
      before: item.beforeSample,
      after: item.afterSample,
      quoteText: '',
      recommended: true,
    }];
  }

  function getSelectedEditIdsForChapter(chapterNumber: number): string[] {
    return options.selectedEditIdsByChapter.value[chapterNumber] ?? [];
  }

  function getSelectedEditCountForChapter(chapterNumber: number): number {
    return getSelectedEditIdsForChapter(chapterNumber).length;
  }

  function isChapterFullySelected(item: CleanQuoteUsageItem): boolean {
    const total = getDisplayExamples(item).length;
    if (total <= 0) return false;
    return getSelectedEditCountForChapter(item.chapterNumber) >= total;
  }

  function isChapterPartiallySelected(item: CleanQuoteUsageItem): boolean {
    const total = getDisplayExamples(item).length;
    const selected = getSelectedEditCountForChapter(item.chapterNumber);
    return selected > 0 && selected < total;
  }

  function selectAllCleanQuoteItems() {
    const items = options.preview.value?.items ?? [];
    const next: Record<number, string[]> = {};
    for (const item of items) {
      next[item.chapterNumber] = getDisplayExamples(item).map(example => example.id);
    }
    options.selectedEditIdsByChapter.value = next;
  }

  function clearAllCleanQuoteItems() {
    options.selectedEditIdsByChapter.value = {};
  }

  function toggleCleanQuoteChapter(chapterNumber: number, accepted: boolean) {
    const item = options.preview.value?.items.find(ch => ch.chapterNumber === chapterNumber);
    if (!item) return;
    const allIds = getDisplayExamples(item).map(example => example.id);
    if (accepted) {
      options.selectedEditIdsByChapter.value = {
        ...options.selectedEditIdsByChapter.value,
        [chapterNumber]: allIds,
      };
    } else {
      const next = { ...options.selectedEditIdsByChapter.value };
      delete next[chapterNumber];
      options.selectedEditIdsByChapter.value = next;
    }
  }

  function toggleCleanQuoteExample(chapterNumber: number, exampleId: string, accepted: boolean) {
    const current = new Set(getSelectedEditIdsForChapter(chapterNumber));
    if (accepted) {
      current.add(exampleId);
    } else {
      current.delete(exampleId);
    }
    const next = { ...options.selectedEditIdsByChapter.value };
    if (current.size === 0) {
      delete next[chapterNumber];
    } else {
      next[chapterNumber] = [...current];
    }
    options.selectedEditIdsByChapter.value = next;
  }

  function syncCleanQuoteSelectionFromPreview() {
    const items = options.preview.value?.items ?? [];
    const next: Record<number, string[]> = {};
    for (const item of items) {
      const selectedIds = getDisplayExamples(item)
        .filter(example => example.recommended !== false)
        .map(example => example.id);
      if (selectedIds.length > 0) {
        next[item.chapterNumber] = selectedIds;
      }
    }
    options.selectedEditIdsByChapter.value = next;
    options.expandedChapters.value = items.length > 0 ? [items[0].chapterNumber] : [];
  }

  const selectedCleanQuoteItems = computed(() => {
    const items = options.preview.value?.items ?? [];
    return items.filter(item => getSelectedEditCountForChapter(item.chapterNumber) > 0);
  });

  const selectedCleanQuoteReplacements = computed(() => {
    const items = options.preview.value?.items ?? [];
    return items.reduce(
      (sum, item) => sum + getSelectedEditCountForChapter(item.chapterNumber),
      0,
    );
  });

  return {
    selectedCleanQuoteItems,
    selectedCleanQuoteReplacements,
    getDisplayExamples,
    getSelectedEditIdsForChapter,
    getSelectedEditCountForChapter,
    isChapterFullySelected,
    isChapterPartiallySelected,
    selectAllCleanQuoteItems,
    clearAllCleanQuoteItems,
    toggleCleanQuoteChapter,
    toggleCleanQuoteExample,
    syncCleanQuoteSelectionFromPreview,
  };
}
