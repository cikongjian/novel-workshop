import { computed, type Ref } from 'vue';
import type { CleanDialogueBracketUsageItem, CleanDialogueBracketUsageResponse } from '../api';

export type CleanDialogueBracketDisplayExample = {
  id: string;
  before: string;
  after: string;
  tagText?: string;
  recommended?: boolean;
  patternType?: 'prefix' | 'suffix';
  lineNumber?: number;
  columnNumber?: number;
  paragraphNumber?: number;
};

export function useCleanDialogueBracketSelectionModel(options: {
  preview: Ref<CleanDialogueBracketUsageResponse | null>;
  selectedEditIdsByChapter: Ref<Record<number, string[]>>;
  expandedChapters: Ref<Array<string | number>>;
}) {
  function getDisplayExamples(item: CleanDialogueBracketUsageItem): CleanDialogueBracketDisplayExample[] {
    if (item.examples && item.examples.length > 0) {
      return item.examples.map((example, index) => ({
        id: example.id || `${item.chapterNumber}-example-${index}`,
        before: example.before,
        after: example.after,
        tagText: example.tagText,
        recommended: example.recommended,
        patternType: example.patternType,
        lineNumber: example.lineNumber,
        columnNumber: example.columnNumber,
        paragraphNumber: example.paragraphNumber,
      }));
    }
    return [{
      id: `${item.chapterNumber}-fallback`,
      before: item.beforeSample,
      after: item.afterSample,
      tagText: '',
      recommended: true,
      patternType: 'prefix',
    }];
  }

  function getSelectedEditIdsForChapter(chapterNumber: number): string[] {
    return options.selectedEditIdsByChapter.value[chapterNumber] ?? [];
  }

  function getSelectedEditCountForChapter(chapterNumber: number): number {
    return getSelectedEditIdsForChapter(chapterNumber).length;
  }

  function isChapterFullySelected(item: CleanDialogueBracketUsageItem): boolean {
    const total = getDisplayExamples(item).length;
    if (total <= 0) return false;
    return getSelectedEditCountForChapter(item.chapterNumber) >= total;
  }

  function isChapterPartiallySelected(item: CleanDialogueBracketUsageItem): boolean {
    const total = getDisplayExamples(item).length;
    const selected = getSelectedEditCountForChapter(item.chapterNumber);
    return selected > 0 && selected < total;
  }

  function selectAllItems() {
    const items = options.preview.value?.items ?? [];
    const next: Record<number, string[]> = {};
    for (const item of items) {
      next[item.chapterNumber] = getDisplayExamples(item).map(example => example.id);
    }
    options.selectedEditIdsByChapter.value = next;
  }

  function clearAllItems() {
    options.selectedEditIdsByChapter.value = {};
  }

  function toggleChapter(chapterNumber: number, accepted: boolean) {
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

  function toggleExample(chapterNumber: number, exampleId: string, accepted: boolean) {
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

  function syncSelectionFromPreview() {
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

  const selectedItems = computed(() => {
    const items = options.preview.value?.items ?? [];
    return items.filter(item => getSelectedEditCountForChapter(item.chapterNumber) > 0);
  });

  const selectedReplacements = computed(() => {
    const items = options.preview.value?.items ?? [];
    return items.reduce(
      (sum, item) => sum + getSelectedEditCountForChapter(item.chapterNumber),
      0,
    );
  });

  return {
    selectedItems,
    selectedReplacements,
    getDisplayExamples,
    getSelectedEditIdsForChapter,
    isChapterFullySelected,
    isChapterPartiallySelected,
    selectAllItems,
    clearAllItems,
    toggleChapter,
    toggleExample,
    syncSelectionFromPreview,
  };
}

