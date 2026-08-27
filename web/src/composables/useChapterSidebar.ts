import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useNovelStore } from '../stores/novel';
import { CHAPTER_STATUS_LABELS } from '../types';

export type ChapterSidebarFilter = 'all' | 'active' | 'finalized';
type ChapterSidebarMobileTab = 'chapters' | 'editor' | 'comments';
type ChapterSidebarWorkspaceDomain = 'chapters' | 'outline' | 'world' | 'characters' | 'settings';

const CHAPTER_SIDEBAR_DEFAULT_WIDTH = 240;
const CHAPTER_SIDEBAR_MIN_WIDTH = 180;
const CHAPTER_SIDEBAR_MAX_WIDTH_RATIO = 0.38;
const CHAPTER_SIDEBAR_COLLAPSED_WIDTH = 44;

const CHAPTER_SIDEBAR_WIDTH_STORAGE_KEY = 'nw.chapter-sidebar.width';
const CHAPTER_SIDEBAR_COLLAPSED_STORAGE_KEY = 'nw.chapter-sidebar.collapsed';
const CHAPTER_SIDEBAR_DENSE_STORAGE_KEY = 'nw.chapter-sidebar.dense';
const CHAPTER_SIDEBAR_REVERSE_STORAGE_KEY = 'nw.chapter-sidebar.reverse';

export function useChapterSidebar(deps: {
  currentChapterNum: Ref<number | null>;
  isDesktop: Ref<boolean>;
  isFullscreen: Ref<boolean>;
  activeWorkspaceDomain: Ref<ChapterSidebarWorkspaceDomain>;
  mobileTab: Ref<ChapterSidebarMobileTab>;
  workspaceRef: Ref<HTMLElement | null>;
  selectChapter: (num: number) => Promise<void>;
  handleDeleteChapter: (chapterNumber: number) => Promise<void>;
}) {
  const {
    currentChapterNum,
    isDesktop,
    isFullscreen,
    activeWorkspaceDomain,
    mobileTab,
    workspaceRef,
    selectChapter,
    handleDeleteChapter,
  } = deps;

  const novelStore = useNovelStore();

  const chapterSidebarCollapsed = ref(false);
  const chapterSidebarWidth = ref(CHAPTER_SIDEBAR_DEFAULT_WIDTH);
  const chapterSidebarDragging = ref(false);
  const chapterSidebarDense = ref(true);
  const chapterSidebarQuery = ref('');
  const chapterSidebarFilter = ref<ChapterSidebarFilter>('all');
  const chapterSidebarReverse = ref(false);
  const chapterSidebarKeyboardFocusChapter = ref<number | null>(null);
  let chapterSidebarDragContext: { startX: number; startWidth: number } | null = null;

  const chapterPage = ref(1);
  const chapterPageSize = ref(50);
  const chapterPageSizeOptions = [20, 50, 100, 200];

  const showChapterSidebar = computed(() => (
    !isFullscreen.value
    && ((isDesktop.value && activeWorkspaceDomain.value === 'chapters') || mobileTab.value === 'chapters')
  ));

  const showChapterSidebarResizer = computed(() => (
    isDesktop.value
    && !isFullscreen.value
    && activeWorkspaceDomain.value === 'chapters'
    && !chapterSidebarCollapsed.value
  ));

  const chapterSidebarCounts = computed(() => {
    const total = novelStore.chapters.length;
    const finalized = novelStore.chapters.filter(ch => ch.status === 'finalized').length;
    return {
      total,
      finalized,
      active: Math.max(0, total - finalized),
    };
  });

  const chapterFinalizeProgressPercent = computed(() => {
    const total = chapterSidebarCounts.value.total;
    if (total <= 0) return 0;
    return Math.round((chapterSidebarCounts.value.finalized / total) * 100);
  });

  const chapterFinalizeProgressText = computed(() => {
    if (chapterSidebarCounts.value.total === 0) return '0%';
    return `${chapterFinalizeProgressPercent.value}%`;
  });

  const chapterOrderNumbers = computed(() => novelStore.chapters.map(ch => ch.chapterNumber));

  const currentChapterOrderIndex = computed(() => {
    if (!currentChapterNum.value) return -1;
    return chapterOrderNumbers.value.findIndex(num => num === currentChapterNum.value);
  });

  const previousChapterNumber = computed(() => {
    const index = currentChapterOrderIndex.value;
    if (index <= 0) return null;
    return chapterOrderNumbers.value[index - 1] ?? null;
  });

  const nextChapterNumber = computed(() => {
    const index = currentChapterOrderIndex.value;
    if (index < 0 || index >= chapterOrderNumbers.value.length - 1) return null;
    return chapterOrderNumbers.value[index + 1] ?? null;
  });

  const chapterSidebarFilterOptions = computed<Array<{ id: ChapterSidebarFilter; label: string; count: number }>>(() => ([
    { id: 'all', label: '全部', count: chapterSidebarCounts.value.total },
    { id: 'active', label: '进行中', count: chapterSidebarCounts.value.active },
    { id: 'finalized', label: '已定稿', count: chapterSidebarCounts.value.finalized },
  ]));

  const filteredSidebarChapters = computed(() => {
    const query = chapterSidebarQuery.value.trim().toLowerCase();
    const filtered = novelStore.chapters.filter((chapter) => {
      if (chapterSidebarFilter.value === 'active' && chapter.status === 'finalized') return false;
      if (chapterSidebarFilter.value === 'finalized' && chapter.status !== 'finalized') return false;
      if (!query) return true;
      const chapterLabel = `第${chapter.chapterNumber}章`;
      const title = chapter.title ?? '';
      const statusLabel = CHAPTER_STATUS_LABELS[chapter.status] ?? '';
      return chapterLabel.toLowerCase().includes(query)
        || title.toLowerCase().includes(query)
        || statusLabel.toLowerCase().includes(query);
    });
    return [...filtered].sort((a, b) => {
      const order = a.chapterNumber - b.chapterNumber;
      return chapterSidebarReverse.value ? -order : order;
    });
  });

  const totalFilteredChapters = computed(() => filteredSidebarChapters.value.length);

  const pagedSidebarChapters = computed(() => {
    const start = (chapterPage.value - 1) * chapterPageSize.value;
    return filteredSidebarChapters.value.slice(start, start + chapterPageSize.value);
  });

  const chapterSidebarFilterActive = computed(() => (
    chapterSidebarFilter.value !== 'all' || chapterSidebarQuery.value.trim().length > 0
  ));

  const chapterSidebarKeyboardOrder = computed(() => (
    filteredSidebarChapters.value.map(ch => ch.chapterNumber)
  ));

  const chapterSidebarKeyboardEnabled = computed(() => {
    if (activeWorkspaceDomain.value !== 'chapters' || isFullscreen.value) return false;
    if (isDesktop.value) return !chapterSidebarCollapsed.value;
    return mobileTab.value === 'chapters';
  });

  function getChapterSidebarMaxWidth(): number {
    const workspaceWidth = workspaceRef.value?.clientWidth ?? 0;
    if (workspaceWidth <= 0) return 340;
    return Math.max(CHAPTER_SIDEBAR_MIN_WIDTH, Math.round(workspaceWidth * CHAPTER_SIDEBAR_MAX_WIDTH_RATIO));
  }

  function clampChapterSidebarWidth(width: number): number {
    const maxWidth = getChapterSidebarMaxWidth();
    return Math.min(maxWidth, Math.max(CHAPTER_SIDEBAR_MIN_WIDTH, Math.round(width)));
  }

  function normalizeChapterSidebarWidth() {
    if (!isDesktop.value || chapterSidebarCollapsed.value) return;
    chapterSidebarWidth.value = clampChapterSidebarWidth(chapterSidebarWidth.value);
  }

  const chapterSidebarStyle = computed(() => {
    if (!isDesktop.value) return undefined;
    const width = chapterSidebarCollapsed.value
      ? CHAPTER_SIDEBAR_COLLAPSED_WIDTH
      : clampChapterSidebarWidth(chapterSidebarWidth.value);
    return {
      width: `${width}px`,
      minWidth: `${width}px`,
      flexBasis: `${width}px`,
    };
  });

  function getPageForChapter(chapterNumber: number | null): number {
    if (!chapterNumber) return 1;
    const index = filteredSidebarChapters.value.findIndex(ch => ch.chapterNumber === chapterNumber);
    if (index < 0) return 1;
    return Math.floor(index / chapterPageSize.value) + 1;
  }

  function syncChapterSidebarKeyboardFocus(preferCurrent = true) {
    const order = chapterSidebarKeyboardOrder.value;
    if (order.length === 0) {
      chapterSidebarKeyboardFocusChapter.value = null;
      return;
    }
    if (
      chapterSidebarKeyboardFocusChapter.value !== null
      && order.includes(chapterSidebarKeyboardFocusChapter.value)
    ) {
      return;
    }
    if (preferCurrent && currentChapterNum.value !== null && order.includes(currentChapterNum.value)) {
      chapterSidebarKeyboardFocusChapter.value = currentChapterNum.value;
      return;
    }
    chapterSidebarKeyboardFocusChapter.value = order[0];
  }

  function moveChapterSidebarKeyboardFocus(delta: 1 | -1) {
    const order = chapterSidebarKeyboardOrder.value;
    if (order.length === 0) return;
    const current = chapterSidebarKeyboardFocusChapter.value;
    let index = current === null ? -1 : order.indexOf(current);
    if (index < 0 && currentChapterNum.value !== null) {
      index = order.indexOf(currentChapterNum.value);
    }
    if (index < 0) {
      chapterSidebarKeyboardFocusChapter.value = delta > 0 ? order[0] : order[order.length - 1];
      return;
    }
    const nextIndex = Math.min(order.length - 1, Math.max(0, index + delta));
    chapterSidebarKeyboardFocusChapter.value = order[nextIndex];
  }

  function moveChapterSidebarKeyboardFocusByOffset(delta: number) {
    const order = chapterSidebarKeyboardOrder.value;
    if (order.length === 0) return;
    const current = chapterSidebarKeyboardFocusChapter.value;
    let index = current === null ? -1 : order.indexOf(current);
    if (index < 0 && currentChapterNum.value !== null) {
      index = order.indexOf(currentChapterNum.value);
    }
    if (index < 0) {
      chapterSidebarKeyboardFocusChapter.value = delta >= 0 ? order[0] : order[order.length - 1];
      return;
    }
    const nextIndex = Math.min(order.length - 1, Math.max(0, index + delta));
    chapterSidebarKeyboardFocusChapter.value = order[nextIndex];
  }

  function setChapterSidebarKeyboardFocusToBoundary(edge: 'first' | 'last') {
    const order = chapterSidebarKeyboardOrder.value;
    if (order.length === 0) return;
    chapterSidebarKeyboardFocusChapter.value = edge === 'first' ? order[0] : order[order.length - 1];
  }

  function openChapterByKeyboardFocus() {
    if (chapterSidebarKeyboardFocusChapter.value === null) return;
    void selectChapter(chapterSidebarKeyboardFocusChapter.value);
    if (!isDesktop.value) {
      mobileTab.value = 'editor';
    }
  }

  function deleteChapterByKeyboardFocus() {
    if (chapterSidebarKeyboardFocusChapter.value === null) return;
    void handleDeleteChapter(chapterSidebarKeyboardFocusChapter.value);
  }

  function clearChapterSidebarKeyboardFocus() {
    chapterSidebarKeyboardFocusChapter.value = null;
  }

  function setChapterSidebarFilter(filter: ChapterSidebarFilter) {
    chapterSidebarFilter.value = filter;
  }

  function clearChapterSidebarFilters() {
    chapterSidebarQuery.value = '';
    chapterSidebarFilter.value = 'all';
  }

  function toggleChapterSidebarDense() {
    chapterSidebarDense.value = !chapterSidebarDense.value;
  }

  function toggleChapterSidebarReverse() {
    chapterSidebarReverse.value = !chapterSidebarReverse.value;
  }

  function handleSidebarChapterSelect(chapterNumber: number) {
    chapterSidebarKeyboardFocusChapter.value = chapterNumber;
    void selectChapter(chapterNumber);
    if (!isDesktop.value) {
      mobileTab.value = 'editor';
    }
  }

  function onChapterSidebarResizeMove(event: MouseEvent) {
    if (!chapterSidebarDragContext) return;
    const delta = event.clientX - chapterSidebarDragContext.startX;
    chapterSidebarWidth.value = clampChapterSidebarWidth(chapterSidebarDragContext.startWidth + delta);
  }

  function stopChapterSidebarResize() {
    if (!chapterSidebarDragContext && !chapterSidebarDragging.value) return;
    chapterSidebarDragContext = null;
    chapterSidebarDragging.value = false;
    window.removeEventListener('mousemove', onChapterSidebarResizeMove);
    window.removeEventListener('mouseup', stopChapterSidebarResize);
    window.removeEventListener('blur', stopChapterSidebarResize);
  }

  function startChapterSidebarResize(event: MouseEvent) {
    if (!isDesktop.value || chapterSidebarCollapsed.value) return;
    event.preventDefault();
    chapterSidebarDragContext = {
      startX: event.clientX,
      startWidth: chapterSidebarWidth.value,
    };
    chapterSidebarDragging.value = true;
    window.addEventListener('mousemove', onChapterSidebarResizeMove);
    window.addEventListener('mouseup', stopChapterSidebarResize);
    window.addEventListener('blur', stopChapterSidebarResize);
  }

  function toggleChapterSidebar() {
    chapterSidebarCollapsed.value = !chapterSidebarCollapsed.value;
    if (!chapterSidebarCollapsed.value) {
      normalizeChapterSidebarWidth();
    }
  }

  function loadChapterSidebarPreferences() {
    if (typeof window === 'undefined') return;
    try {
      const savedWidth = Number(localStorage.getItem(CHAPTER_SIDEBAR_WIDTH_STORAGE_KEY));
      if (Number.isFinite(savedWidth) && savedWidth > 0) {
        chapterSidebarWidth.value = clampChapterSidebarWidth(savedWidth);
      } else {
        chapterSidebarWidth.value = clampChapterSidebarWidth(CHAPTER_SIDEBAR_DEFAULT_WIDTH);
      }
      chapterSidebarCollapsed.value = localStorage.getItem(CHAPTER_SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
      const savedDense = localStorage.getItem(CHAPTER_SIDEBAR_DENSE_STORAGE_KEY);
      if (savedDense === '0' || savedDense === '1') {
        chapterSidebarDense.value = savedDense === '1';
      } else {
        chapterSidebarDense.value = true;
      }
      const savedReverse = localStorage.getItem(CHAPTER_SIDEBAR_REVERSE_STORAGE_KEY);
      if (savedReverse === '0' || savedReverse === '1') {
        chapterSidebarReverse.value = savedReverse === '1';
      } else {
        chapterSidebarReverse.value = false;
      }
    } catch {
      chapterSidebarWidth.value = clampChapterSidebarWidth(CHAPTER_SIDEBAR_DEFAULT_WIDTH);
      chapterSidebarDense.value = true;
      chapterSidebarReverse.value = false;
    }
  }

  watch([totalFilteredChapters, chapterPageSize, chapterSidebarFilter, chapterSidebarQuery], () => {
    const maxPage = Math.max(1, Math.ceil(totalFilteredChapters.value / chapterPageSize.value));
    if (currentChapterNum.value) {
      const targetPage = getPageForChapter(currentChapterNum.value);
      if (targetPage <= maxPage) {
        chapterPage.value = targetPage;
        return;
      }
    }
    if (chapterPage.value > maxPage) chapterPage.value = maxPage;
    if (chapterPage.value < 1) chapterPage.value = 1;
  });

  watch(currentChapterNum, (chapterNumber) => {
    if (!chapterNumber) return;
    const targetPage = getPageForChapter(chapterNumber);
    if (targetPage !== chapterPage.value) {
      chapterPage.value = targetPage;
    }
  });

  watch(chapterSidebarWidth, (value) => {
    if (!isDesktop.value || chapterSidebarCollapsed.value || typeof window === 'undefined') return;
    try {
      localStorage.setItem(CHAPTER_SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(value)));
    } catch {
      // ignore
    }
  });

  watch(chapterSidebarCollapsed, (value) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CHAPTER_SIDEBAR_COLLAPSED_STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore
    }
    if (!value) {
      normalizeChapterSidebarWidth();
    }
  });

  watch(chapterSidebarDense, (value) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CHAPTER_SIDEBAR_DENSE_STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore
    }
  });

  watch(chapterSidebarReverse, (value) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CHAPTER_SIDEBAR_REVERSE_STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore
    }
  });

  watch(filteredSidebarChapters, () => {
    syncChapterSidebarKeyboardFocus();
  }, { immediate: true });

  watch(currentChapterNum, (chapterNumber) => {
    if (chapterNumber === null) return;
    if (chapterSidebarKeyboardOrder.value.includes(chapterNumber)) {
      chapterSidebarKeyboardFocusChapter.value = chapterNumber;
    } else {
      syncChapterSidebarKeyboardFocus(false);
    }
  });

  watch(isDesktop, (desktop) => {
    if (!desktop) return;
    normalizeChapterSidebarWidth();
  });

  return {
    chapterSidebarCollapsed,
    chapterSidebarWidth,
    chapterSidebarDragging,
    chapterSidebarDense,
    chapterSidebarQuery,
    chapterSidebarFilter,
    chapterSidebarReverse,
    chapterPage,
    chapterPageSize,
    chapterPageSizeOptions,
    chapterSidebarKeyboardFocusChapter,

    showChapterSidebar,
    showChapterSidebarResizer,
    chapterSidebarCounts,
    chapterFinalizeProgressPercent,
    chapterFinalizeProgressText,
    chapterOrderNumbers,
    currentChapterOrderIndex,
    previousChapterNumber,
    nextChapterNumber,
    chapterSidebarFilterOptions,
    filteredSidebarChapters,
    totalFilteredChapters,
    pagedSidebarChapters,
    chapterSidebarFilterActive,
    chapterSidebarKeyboardEnabled,
    chapterSidebarStyle,

    normalizeChapterSidebarWidth,
    syncChapterSidebarKeyboardFocus,
    moveChapterSidebarKeyboardFocus,
    moveChapterSidebarKeyboardFocusByOffset,
    setChapterSidebarKeyboardFocusToBoundary,
    openChapterByKeyboardFocus,
    deleteChapterByKeyboardFocus,
    clearChapterSidebarKeyboardFocus,
    setChapterSidebarFilter,
    clearChapterSidebarFilters,
    toggleChapterSidebarDense,
    toggleChapterSidebarReverse,
    handleSidebarChapterSelect,
    startChapterSidebarResize,
    stopChapterSidebarResize,
    toggleChapterSidebar,
    loadChapterSidebarPreferences,
  };
}
