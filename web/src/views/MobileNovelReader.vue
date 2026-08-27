<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, proxyRefs, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { CloseBold, CollectionTag, Document, Promotion, Reading, RefreshRight, Search, Timer } from '@element-plus/icons-vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileChapterTitleEditor from '../components/mobile-entry/MobileChapterTitleEditor.vue';
import MobileCopyChapterButton from '../components/mobile-entry/MobileCopyChapterButton.vue';
import CharacterMailbox from '../components/mobile-entry/CharacterMailbox.vue';
import CharacterMoments from '../components/mobile-entry/CharacterMoments.vue';
import CharacterChatSheet from '../components/mobile-entry/CharacterChatSheet.vue';
import MobileReaderTTSPanel from '../components/mobile-entry/MobileReaderTTSPanel.vue';
import type { WritableCharacter } from '../api/character-mail';
import { fetchChapter, fetchChapterPage, updateChapter } from '../api/chapters';
import { fetchNovel } from '../api/novels';
import { useAuthStore } from '../stores/auth';
import { extractApiErrorMessage } from '../utils/api-error';
import { CHAPTER_STATUS_LABELS, STATUS_LABELS, type Chapter, type ChapterSummary, type NovelMetadata } from '../types';
import { useReaderTTS } from '../composables/useReaderTTS';
import { useComicFeature, refreshComicFeature } from '../composables/useComicFeature';
import { useOfflineChapterCache } from '../composables/useOfflineStorage';
import { useReadingEnhance } from '../composables/useReadingEnhance';
import { THEME_OPTIONS, type ReaderTheme } from '../composables/useMobileBookReader';
import { readReaderDisplayMode, writeReaderDisplayMode } from '../utils/reader-display-mode';
import { cleanReaderContent } from '../utils/clean-reader-content';
import { scheduleIdleTask } from '../utils/idle-task';
import { useReaderAnnotations } from '../composables/useReaderAnnotations';
import { useOfflineIndicator } from '../composables/useOfflineIndicator';
import { useSwipeNavigation } from '../composables/useSwipeNavigation';
import { useThemeMode } from '../composables/useThemeMode';
import { useTapSelect } from '../composables/useTapSelect';
import MobileTextActionBar from '../components/mobile-entry/MobileTextActionBar.vue';
import MobileAnnotationPanel from '../components/mobile-entry/MobileAnnotationPanel.vue';
import MobileShareCardViewer from '../components/mobile-entry/MobileShareCardViewer.vue';
import MobileNoteInput from '../components/mobile-entry/MobileNoteInput.vue';
import WriterLevelBadge from '../components/mobile-focus/WriterLevelBadge.vue';
import MobileComicStrip from '../components/mobile-entry/MobileComicStrip.vue';

type ChapterSortOrder = 'asc' | 'desc';
const MOBILE_NOVEL_READER_SETTINGS_KEY = 'nw-mobile-novel-reader:settings';
const READER_CHAPTER_PAGE_SIZE = 80;

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const mailboxVisible = ref(false);
const momentsVisible = ref(false);
const chatVisible = ref(false);
const chatCharacter = ref<WritableCharacter | null>(null);
const comicVisible = ref(false);
const { comicEnabled } = useComicFeature();

// 刷新保留 + 通知跳转：URL 带 ?comic=1 或 ?comicPanel=N 时自动打开漫画弹层
watch(
  () => [route.query.comic, route.query.comicPanel] as const,
  ([comic, panel]) => {
    if ((comic != null || panel != null) && comicEnabled.value) {
      comicVisible.value = true;
    }
  },
  { immediate: true },
);

// 弹层开关同步到 URL（?comic=1），刷新后能恢复打开状态、停留在漫画页面
watch(comicVisible, (v) => {
  if (v) {
    if (!route.query.comic) router.replace({ query: { ...route.query, comic: '1' } });
  } else {
    const { comic, ...rest } = route.query;
    if (comic) router.replace({ query: rest });
  }
});

function openCharacterChat(char: WritableCharacter) {
  chatCharacter.value = char;
  mailboxVisible.value = false;
  chatVisible.value = true;
}

const loading = ref(false);
const chaptersLoading = ref(false);
const chaptersLoaded = ref(false);
const chapterLoading = ref(false);
const novel = ref<NovelMetadata | null>(null);
const chapters = ref<ChapterSummary[]>([]);
const isReaderOwner = computed(() =>
  !!(novel.value?.ownerId && authStore.user?.id && novel.value.ownerId === authStore.user.id),
);
const chapterCatalogPage = ref(0);
const chapterCatalogTotal = ref(0);
const chapterCatalogHasMore = ref(false);
const chaptersLoadingMore = ref(false);
const chapterDetail = ref<Chapter | null>(null);
const activeChapterNumber = ref<number | null>(null);
const pageRef = ref<HTMLElement | null>(null);
const articleContentRef = ref<HTMLElement | null>(null);
const sortOrder = ref<ChapterSortOrder>('asc');
const chapterPickerOpen = ref(false);
const chapterSearch = ref('');
const titleEditorVisible = ref(false);
const contentEditorVisible = ref(false);
const chapterContentDraft = ref('');
const savingChapterContent = ref(false);
const ttsPanelOpen = ref(false);
const settings = ref({
  theme: 'paper' as ReaderTheme,
});
let chaptersPromise: Promise<void> | null = null;
let cancelIdleChaptersWarmup: (() => void) | null = null;

const novelId = computed(() => String(route.params.id || ''));
const requestedChapterNumber = computed(() => {
  const value = Number(route.query.chapter);
  return Number.isFinite(value) && value > 0 ? value : null;
});
const sortOptions: Array<{ label: string; value: ChapterSortOrder }> = [
  { label: '正序', value: 'asc' },
  { label: '倒序', value: 'desc' },
];
const orderedChapters = computed(() =>
  [...chapters.value].sort((a, b) => (sortOrder.value === 'asc'
    ? a.chapterNumber - b.chapterNumber
    : b.chapterNumber - a.chapterNumber)),
);
const activeChapterSummary = computed<ChapterSummary | null>(() => {
  if (activeChapterNumber.value == null) return null;
  const fromList = chapters.value.find((item) => item.chapterNumber === activeChapterNumber.value);
  if (fromList) return fromList;
  if (chapterDetail.value?.chapterNumber === activeChapterNumber.value) {
    return {
      chapterNumber: chapterDetail.value.chapterNumber,
      title: chapterDetail.value.title,
      status: chapterDetail.value.status,
      wordCount: chapterDetail.value.wordCount,
      summary: chapterDetail.value.summary,
      readerScore: chapterDetail.value.readerScore,
      diagnostics: chapterDetail.value.diagnostics
        ? {
            startupOpening: chapterDetail.value.diagnostics.startupOpeningReport
              ? {
                  overallScore: chapterDetail.value.diagnostics.startupOpeningReport.overallScore,
                  passed: chapterDetail.value.diagnostics.startupOpeningReport.passed,
                  findingsCount: chapterDetail.value.diagnostics.startupOpeningReport.findings.length,
                  platformProfile: chapterDetail.value.diagnostics.startupOpeningReport.platformProfile,
                }
              : undefined,
            lengthGuard: chapterDetail.value.diagnostics.chapterLengthGuard
              ? {
                  triggered: chapterDetail.value.diagnostics.chapterLengthGuard.triggered,
                  usedFallbackTrim: chapterDetail.value.diagnostics.chapterLengthGuard.usedFallbackTrim,
                  finalWordCount: chapterDetail.value.diagnostics.chapterLengthGuard.finalWordCount,
                }
              : undefined,
          }
        : undefined,
      updatedAt: chapterDetail.value.updatedAt,
    };
  }
  return null;
});
const estimatedReadingMinutes = computed(() =>
  Math.max(1, Math.ceil((activeChapterSummary.value?.wordCount || 0) / 700)),
);
const currentIndex = computed(() =>
  activeChapterNumber.value == null
    ? -1
    : orderedChapters.value.findIndex((item) => item.chapterNumber === activeChapterNumber.value),
);
const previousChapterNumber = computed(() => {
  if (activeChapterNumber.value == null) return null;
  if (orderedChapters.value.length > 0) {
    return currentIndex.value > 0 ? orderedChapters.value[currentIndex.value - 1]?.chapterNumber ?? null : null;
  }
  return activeChapterNumber.value > 1 ? activeChapterNumber.value - 1 : null;
});
const nextChapterNumber = computed(() => {
  if (activeChapterNumber.value == null) return null;
  if (orderedChapters.value.length > 0) {
    return currentIndex.value >= 0 && currentIndex.value < orderedChapters.value.length - 1
      ? orderedChapters.value[currentIndex.value + 1]?.chapterNumber ?? null
      : null;
  }
  const chapterCount = novel.value?.chapterCount ?? 0;
  return chapterCount > activeChapterNumber.value ? activeChapterNumber.value + 1 : null;
});
const topbarTitle = computed(() => novel.value?.title || '正文阅读');
const topbarSubtitle = computed(() =>
  activeChapterSummary.value
    ? `第 ${activeChapterSummary.value.chapterNumber} 章`
    : '选择章节开始阅读',
);
const currentTheme = computed(() =>
  THEME_OPTIONS.find((item) => item.value === settings.value.theme) ?? THEME_OPTIONS[0],
);
const isNightTheme = computed(() => settings.value.theme === 'night');
const pageStyle = computed(() => ({
  '--mobile-reader-page': currentTheme.value.page,
  '--mobile-reader-paper': currentTheme.value.paper,
  '--mobile-reader-ink': currentTheme.value.text,
  '--mobile-reader-muted': currentTheme.value.muted,
  '--mobile-reader-line': currentTheme.value.line,
  '--mobile-reader-surface': isNightTheme.value ? 'rgba(14, 24, 38, 0.72)' : 'rgba(255, 255, 255, 0.72)',
  '--mobile-reader-surface-strong': isNightTheme.value ? 'rgba(14, 24, 38, 0.9)' : 'rgba(255, 255, 255, 0.9)',
  '--mobile-reader-floating': isNightTheme.value ? 'rgba(12, 20, 32, 0.92)' : 'rgba(255, 255, 255, 0.92)',
  '--mobile-reader-overlay': isNightTheme.value ? 'rgba(3, 8, 18, 0.72)' : 'rgba(6, 14, 28, 0.54)',
}));
const filteredChapters = computed(() => {
  const keyword = chapterSearch.value.trim().toLowerCase();
  if (!keyword) return orderedChapters.value;
  return orderedChapters.value.filter((chapter) =>
    String(chapter.chapterNumber).includes(keyword) || chapter.title.toLowerCase().includes(keyword),
  );
});
const readingParagraphs = computed(() => {
  const content = cleanReaderContent(chapterDetail.value?.content ?? '');
  return content.split(/\r?\n+/).map((item) => item.trim()).filter(Boolean);
});
const readerTTS = proxyRefs(useReaderTTS(readingParagraphs, {
  novelId,
  novelTitle: computed(() => novel.value?.title || '原创作品'),
}));

// 划线批注 & 分享
const readerAnnotations = useReaderAnnotations(
  novelId,
  activeChapterNumber,
  readingParagraphs,
  articleContentRef,
  computed(() => novel.value?.title ?? '未命名作品'),
  computed(() => authStore.user?.penName || authStore.user?.displayName || '读者'),
);

// 沉浸阅读增强
const readingEnhance = useReadingEnhance({
  containerRef: articleContentRef,
  onPrevPage: () => {
    if (previousChapterNumber.value) selectChapter(previousChapterNumber.value);
  },
  onNextPage: () => {
    if (nextChapterNumber.value) selectChapter(nextChapterNumber.value);
  },
});

// 滑动翻章手势
const annotationActive = computed(() =>
  readerAnnotations.actionBarVisible.value
  || readerAnnotations.annotationPanelVisible.value
  || readerAnnotations.shareCardViewerVisible.value,
);
const swipeNav = useSwipeNavigation({
  containerRef: articleContentRef,
  onPrev: () => {
    if (previousChapterNumber.value) selectChapter(previousChapterNumber.value);
  },
  onNext: () => {
    if (nextChapterNumber.value) selectChapter(nextChapterNumber.value);
  },
  enabled: computed(() => !annotationActive.value),
});

// 划线模式（点击选中，解决微信等浏览器劫持长按的问题）
const tapSelect = useTapSelect({
  containerRef: articleContentRef,
});

// 离线章节自动缓存
const chapterCache = useOfflineChapterCache();
const cachedChapterNumbers = ref<Set<number>>(new Set());

// 离线状态检测
const offlineIndicator = useOfflineIndicator();

watch(
  [activeChapterSummary, readingParagraphs],
  async ([summary, paragraphs]) => {
    if (!summary || !paragraphs.length) return;
    try {
      await chapterCache.cacheChapter({
        novelId: novelId.value,
        novelTitle: novel.value?.title ?? '未命名作品',
        chapterNumber: summary.chapterNumber,
        chapterTitle: summary.title,
        content: paragraphs,
        wordCount: paragraphs.reduce((s, p) => s + p.length, 0),
      });
      cachedChapterNumbers.value = new Set([...cachedChapterNumbers.value, summary.chapterNumber]);

      // 预缓存相邻章节（WIFI 或非流量敏感网络优先）
      if (!offlineIndicator.isOffline.value && chapters.value.length > 0) {
        const sortedNumbers = [...chapters.value]
          .map((c) => c.chapterNumber)
          .sort((a, b) => a - b);
        scheduleIdleTask(() => {
          void chapterCache.prefetchAdjacentChapters(
            async (cn) => {
              try {
                const detail = await fetchChapter(novelId.value, cn);
                return detail ? { title: detail.title, content: detail.content } : null;
              } catch {
                return null;
              }
            },
            novelId.value,
            novel.value?.title ?? '未命名作品',
            summary.chapterNumber,
            sortedNumbers,
            3,
          );
        }, 5000);
      }
    } catch { /* 静默 */ }
  },
  { immediate: true },
);

function restoreSettings() {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(MOBILE_NOVEL_READER_SETTINGS_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof settings.value>;
    if (parsed.theme && THEME_OPTIONS.some((item) => item.value === parsed.theme)) {
      settings.value.theme = parsed.theme;
    }
  } catch {
    window.localStorage.removeItem(MOBILE_NOVEL_READER_SETTINGS_KEY);
  }

  const displayMode = readReaderDisplayMode();
  if (displayMode === 'night') {
    settings.value.theme = 'night';
  } else if (displayMode === 'light' && settings.value.theme === 'night') {
    settings.value.theme = 'paper';
  }
}

function persistSettings() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MOBILE_NOVEL_READER_SETTINGS_KEY, JSON.stringify(settings.value));
}

function toggleNightMode() {
  settings.value.theme = isNightTheme.value ? 'paper' : 'night';
}

function handleTitleUpdated(newTitle: string) {
  if (activeChapterSummary.value) {
    activeChapterSummary.value.title = newTitle;
  }
  if (chapterDetail.value) {
    chapterDetail.value.title = newTitle;
  }
  void loadNovelData();
}

restoreSettings();

function navigate(path: string) {
  void router.push(path);
}

function formatNovelStatus(status?: NovelMetadata['status']): string {
  if (!status) return '--';
  return STATUS_LABELS[status] ?? status;
}

function formatChapterStatus(status?: ChapterSummary['status']): string {
  if (!status) return '--';
  return CHAPTER_STATUS_LABELS[status] ?? status;
}

function formatCompactMetric(value: number, unit: string): string {
  if (value >= 100000) {
    return `${Math.round(value / 10000)}万${unit}`;
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}万${unit}`;
  }
  return `${value}${unit}`;
}

function getChapterStatusTone(status?: ChapterSummary['status']): string {
  switch (status) {
    case 'finalized':
      return 'mobile-focus-tag--teal';
    case 'reviewed':
      return 'mobile-focus-tag--gold';
    case 'edited':
    case 'drafted':
      return 'mobile-focus-tag--sky';
    case 'outlined':
    default:
      return 'mobile-focus-tag--ink';
  }
}

function selectChapter(chapterNumber: number) {
  chapterPickerOpen.value = false;
  activeChapterNumber.value = chapterNumber;
  void router.replace({
    path: `/m/novel/${novelId.value}/read`,
    query: { chapter: String(chapterNumber) },
  });
}

function openChapterHub(chapterNumber?: number | null) {
  const query = chapterNumber ? `?chapter=${chapterNumber}` : '';
  void router.push(`/m/novel/${novelId.value}/chapters${query}`);
}

function openChapterPicker() {
  chapterPickerOpen.value = true;
  void ensureChaptersLoaded();
}

function openContentEditor() {
  chapterContentDraft.value = chapterDetail.value?.content ?? '';
  contentEditorVisible.value = true;
  readerTTS.stop();
}

async function saveChapterContent() {
  if (!novelId.value || activeChapterNumber.value == null) return;
  savingChapterContent.value = true;
  try {
    const updated = await updateChapter(novelId.value, activeChapterNumber.value, {
      content: chapterContentDraft.value,
    });
    chapterDetail.value = updated;
    contentEditorVisible.value = false;
    chapters.value = chapters.value.map((chapter) => (
      chapter.chapterNumber === updated.chapterNumber
        ? { ...chapter, title: updated.title, status: updated.status, wordCount: updated.wordCount, updatedAt: updated.updatedAt }
        : chapter
    ));
    ElMessage.success('正文已保存');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存正文失败'));
  } finally {
    savingChapterContent.value = false;
  }
}

function closeChapterPicker() {
  chapterPickerOpen.value = false;
}

function scrollToReadingTop() {
  void nextTick(() => {
    pageRef.value?.scrollIntoView({ block: 'start', behavior: 'auto' });

    const targets = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.getElementById('app'),
    ].filter((target): target is HTMLElement => Boolean(target));

    targets.forEach((target) => {
      target.scrollTop = 0;
    });

    window.scrollTo({ top: 0, behavior: 'auto' });
  });
}

async function loadNovelData() {
  if (!novelId.value) return;
  const requestNovelId = novelId.value;
  loading.value = true;
  try {
    const novelData = await fetchNovel(requestNovelId);
    if (novelId.value !== requestNovelId) return;
    novel.value = novelData;
    const preferredChapter = requestedChapterNumber.value
      ?? activeChapterNumber.value
      ?? (novelData.chapterCount ? 1 : null)
      ?? null;
    activeChapterNumber.value = preferredChapter;
  } catch (err) {
    novel.value = null;
    activeChapterNumber.value = null;
    chapterDetail.value = null;
    ElMessage.error(extractApiErrorMessage(err, '加载阅读数据失败'));
  } finally {
    loading.value = false;
  }
}

async function ensureChaptersLoaded(force = false): Promise<void> {
  if (!novelId.value) return;
  if (!force && chaptersLoaded.value) return;
  if (chaptersPromise) return chaptersPromise;

  const requestNovelId = novelId.value;
  chaptersPromise = (async () => {
    chaptersLoading.value = true;
    try {
      const page = await fetchChapterPage(requestNovelId, {
        page: 1,
        pageSize: READER_CHAPTER_PAGE_SIZE,
        order: sortOrder.value,
      });
      if (novelId.value !== requestNovelId) return;
      chapters.value = page.items;
      chapterCatalogPage.value = page.page;
      chapterCatalogTotal.value = page.total;
      chapterCatalogHasMore.value = page.hasMore;
      chaptersLoaded.value = true;
      if (activeChapterNumber.value == null) {
        activeChapterNumber.value = requestedChapterNumber.value
          ?? [...page.items].sort((a, b) => a.chapterNumber - b.chapterNumber)[0]?.chapterNumber
          ?? null;
      }
    } catch (err) {
      ElMessage.error(extractApiErrorMessage(err, '加载章节目录失败'));
    } finally {
      chaptersLoading.value = false;
      chaptersPromise = null;
    }
  })();

  return chaptersPromise;
}

async function loadMoreChapters(): Promise<void> {
  if (!novelId.value || chaptersLoading.value || chaptersLoadingMore.value || !chapterCatalogHasMore.value) return;
  const requestNovelId = novelId.value;
  chaptersLoadingMore.value = true;
  try {
    const page = await fetchChapterPage(requestNovelId, {
      page: chapterCatalogPage.value + 1,
      pageSize: READER_CHAPTER_PAGE_SIZE,
      order: sortOrder.value,
    });
    if (novelId.value !== requestNovelId) return;
    chapters.value = mergeChapterSummaries(chapters.value, page.items, sortOrder.value);
    chapterCatalogPage.value = page.page;
    chapterCatalogTotal.value = page.total;
    chapterCatalogHasMore.value = page.hasMore;
    chaptersLoaded.value = true;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载更多章节失败'));
  } finally {
    chaptersLoadingMore.value = false;
  }
}

function mergeChapterSummaries(
  current: ChapterSummary[],
  next: ChapterSummary[],
  order: ChapterSortOrder,
): ChapterSummary[] {
  const map = new Map<number, ChapterSummary>();
  for (const chapter of current) map.set(chapter.chapterNumber, chapter);
  for (const chapter of next) map.set(chapter.chapterNumber, chapter);
  return Array.from(map.values()).sort((left, right) => (
    order === 'desc'
      ? right.chapterNumber - left.chapterNumber
      : left.chapterNumber - right.chapterNumber
  ));
}

async function loadChapterDetail() {
  if (!novelId.value || activeChapterNumber.value == null) {
    chapterDetail.value = null;
    return;
  }
  const requestNovelId = novelId.value;
  const requestChapterNumber = activeChapterNumber.value;
  chapterLoading.value = true;
  try {
    const detail = await fetchChapter(requestNovelId, requestChapterNumber);
    if (novelId.value !== requestNovelId || activeChapterNumber.value !== requestChapterNumber) return;
    chapterDetail.value = detail;
  } catch (err) {
    // 网络失败时回退到 IndexedDB 离线缓存
    const cached = await chapterCache.getChapter(requestNovelId, requestChapterNumber);
    if (cached && novelId.value === requestNovelId && activeChapterNumber.value === requestChapterNumber) {
      chapterDetail.value = {
        novelId: cached.novelId,
        chapterNumber: cached.chapterNumber,
        title: cached.chapterTitle,
        content: cached.content.join('\n'),
        wordCount: cached.wordCount,
        status: 'drafted',
        agentComments: [],
        revisionCount: 0,
      };
    } else {
      chapterDetail.value = null;
      ElMessage.error(extractApiErrorMessage(err, '加载章节正文失败'));
    }
  } finally {
    chapterLoading.value = false;
  }
}

watch(novelId, (value, previousValue) => {
  if (value !== previousValue) {
    chapters.value = [];
    chapterCatalogPage.value = 0;
    chapterCatalogTotal.value = 0;
    chapterCatalogHasMore.value = false;
    chaptersLoaded.value = false;
    chaptersPromise = null;
    chapterPickerOpen.value = false;
    chapterDetail.value = null;
  }
  void loadNovelData();
}, { immediate: true });

watch(sortOrder, () => {
  if (chaptersLoaded.value) {
    void ensureChaptersLoaded(true);
  }
});

watch(requestedChapterNumber, (value) => {
  if (value == null) return;
  activeChapterNumber.value = value;
});

watch(activeChapterNumber, (value, previousValue) => {
  if (value == null || value === previousValue) return;
  readerTTS.stop();
  ttsPanelOpen.value = false;
  scrollToReadingTop();
});

watch(ttsPanelOpen, (open) => {
  if (open) return;
  readerTTS.closeVoicePanel();
  readerTTS.closePlaybackRatePanel();
});

watch(settings, () => {
  persistSettings();
  writeReaderDisplayMode(settings.value.theme === 'night' ? 'night' : 'light');
}, { deep: true });

watch(
  () => [novelId.value, activeChapterNumber.value] as const,
  () => {
    void loadChapterDetail();
  },
  { immediate: true },
);

onMounted(() => {
  // 进入阅读器时强制刷新漫画开关，避免 admin 改了开关后作者端仍显示旧状态
  void refreshComicFeature();
  cancelIdleChaptersWarmup = scheduleIdleTask(() => {
    void ensureChaptersLoaded();
  }, 1800);
});

onUnmounted(() => {
  cancelIdleChaptersWarmup?.();
});
</script>

<template>
  <div ref="pageRef" class="mobile-novel-reader-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }" :style="pageStyle">
    <div class="mobile-focus-shell">
      <MobileTopbar :title="topbarTitle" :subtitle="topbarSubtitle" :brand-size="28">
        <template #leading>
          <button class="mobile-focus-button--secondary" type="button" @click="navigate(`/m/novel/${novelId}`)">
            返回详情
          </button>
        </template>
        <template #actions>
          <button
            class="mobile-novel-reader-theme-toggle"
            :class="{ 'is-active': isNightTheme }"
            type="button"
            :aria-label="isNightTheme ? '切换开灯模式' : '切换关灯模式'"
            @click="toggleNightMode"
          >
            {{ isNightTheme ? '开灯' : '关灯' }}
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-novel-reader-main mobile-focus-main">
        <div v-if="loading || chapterLoading" class="mobile-focus-section mobile-novel-reader-panel">
          <div class="mobile-focus-loading">
            <el-skeleton animated :rows="8" />
          </div>
        </div>

        <article v-else-if="activeChapterSummary" class="mobile-novel-reader-article mobile-focus-surface-card mobile-focus-surface-card--sky">
          <div class="mobile-novel-reader-article__hero">
            <div class="mobile-novel-reader-article__header">
              <div class="mobile-novel-reader-article__title">
                <p class="mobile-focus-kicker">Chapter {{ activeChapterSummary.chapterNumber }}</p>
                <h2>第 {{ activeChapterSummary.chapterNumber }} 章 · {{ activeChapterSummary.title }}</h2>
              </div>
              <div class="mobile-novel-reader-article__actions">
                <span class="mobile-focus-tag" :class="getChapterStatusTone(activeChapterSummary.status)">
                  {{ formatChapterStatus(activeChapterSummary.status) }}
                </span>
                <span v-if="activeChapterSummary.readerScore" class="mobile-focus-tag mobile-focus-tag--gold">
                  评分 {{ activeChapterSummary.readerScore }}
                </span>
                <button class="mobile-focus-button--ghost mobile-focus-button--compact" type="button" @click="titleEditorVisible = true">
                  改标题
                </button>
                <MobileCopyChapterButton
                  v-if="chapterDetail"
                  :content="chapterDetail.content"
                  :chapter-number="activeChapterSummary.chapterNumber"
                  :chapter-title="activeChapterSummary.title"
                />
                <button
                  v-if="comicEnabled"
                  class="mobile-focus-button--ghost mobile-focus-button--compact"
                  type="button"
                  @click="comicVisible = true"
                >
                  漫画
                </button>
              </div>
            </div>

            <div v-if="false" class="mobile-focus-item__meta mobile-novel-reader-article__meta">
              <span>{{ formatNovelStatus(novel?.status) }}</span>
              <span>{{ chapters.length }} 章</span>
              <span>{{ (activeChapterSummary.wordCount || 0).toLocaleString() }} 字</span>
              <span>预计 {{ estimatedReadingMinutes }} 分钟读完</span>
              <span>{{ readingParagraphs.length }} 段正文</span>
              <span v-if="activeChapterSummary.readerScore">评分 {{ activeChapterSummary.readerScore }}</span>
            </div>
          </div>

            <div class="mobile-focus-item__meta mobile-novel-reader-article__meta">
              <span>
                <el-icon><CollectionTag /></el-icon>
                {{ formatNovelStatus(novel?.status) }}
              </span>
              <span>
                <el-icon><Reading /></el-icon>
                {{ formatCompactMetric(chapters.length, '章') }}
              </span>
              <span>
                <el-icon><Document /></el-icon>
                {{ formatCompactMetric(activeChapterSummary.wordCount || 0, '字') }}
              </span>
              <span>
                <el-icon><Timer /></el-icon>
                {{ estimatedReadingMinutes }}分
              </span>
              <span>
                <el-icon><Reading /></el-icon>
                {{ formatCompactMetric(readingParagraphs.length, '段') }}
              </span>
            </div>

          <div v-if="novel?.ownerName && novel?.ownerId" class="mobile-novel-reader-author">
            <span class="mobile-novel-reader-author__label">作者</span>
            <span class="mobile-novel-reader-author__name">{{ novel.ownerName }}</span>
            <WriterLevelBadge :user-id="novel.ownerId" />
          </div>

          <section class="mobile-novel-reader-article__reading">
            <div class="mobile-novel-reader-article__reading-head">
              <div class="mobile-novel-reader-article__reading-copy">
                <span class="mobile-novel-reader-article__reading-kicker">正文</span>
                <strong>沉浸阅读</strong>
                <span>支持边读边听，当前高亮会跟随朗读段落。</span>
              </div>
              <div class="mobile-novel-reader-article__reading-actions">
                <button
                  class="mobile-focus-button--primary mobile-focus-button--compact"
                  type="button"
                  @click="openContentEditor"
                >
                  编辑正文
                </button>
                <button
                  class="mobile-focus-button--secondary mobile-focus-button--compact"
                  :class="{ 'mobile-novel-reader-article__reading-actions--active': tapSelect.selectMode.value }"
                  type="button"
                  @click="tapSelect.toggleSelectMode()"
                >
                  {{ tapSelect.selectMode.value ? '划线中' : '划线' }}
                </button>
                <button
                  class="mobile-focus-button--secondary mobile-focus-button--compact"
                  type="button"
                  @click="openChapterHub(activeChapterSummary.chapterNumber)"
                >
                  章节区
                </button>
              </div>
            </div>

            <div v-if="readingParagraphs.length" ref="articleContentRef" class="mobile-novel-reader-article__content" :style="{ transform: `translateX(${swipeNav.swipeOffsetX.value}px)`, transition: swipeNav.swipeOffsetX.value === 0 ? 'transform 0.28s ease-out' : 'none' }">
              <p
                v-for="(paragraph, index) in readingParagraphs"
                :key="`${activeChapterSummary.chapterNumber}-${index}`"
                :data-paragraph-index="index"
                :class="{ 'is-speaking': readerTTS.activeParagraphIndex === index }"
              >
                <span
                  v-for="(seg, segIdx) in readerAnnotations.richParagraphs.value[index] || [{ text: paragraph, isHighlighted: false, annotationCount: 0 }]"
                  :key="segIdx"
                  :class="{ 'annotated-highlight': seg.isHighlighted }"
                  :data-annotation-id="seg.annotationId"
                  @click.stop="seg.isHighlighted && seg.annotationId ? readerAnnotations.handleAnnotationClick(seg.annotationId) : undefined"
                >{{ seg.text }}</span>
              </p>
            </div>

            <div v-else class="mobile-focus-empty mobile-novel-reader-article__empty">
              <strong>这一章还没有正文</strong>
              <p>章节可能仍停留在大纲或空白状态，建议先回到章节区生成或编辑。</p>
            </div>
          </section>

        </article>

        <div v-else-if="!loading" class="mobile-focus-empty mobile-focus-section mobile-novel-reader-panel">
          <strong>还没有可阅读内容</strong>
          <p>当前作品暂无章节，可以先生成第一章，再回来连续阅读。</p>
          <button class="mobile-focus-button--primary" type="button" @click="openChapterHub()">
            去章节区
          </button>
        </div>
      </main>
    </div>

    <button
      v-if="activeChapterSummary && readerTTS.showListenButton && !ttsPanelOpen"
      class="mobile-novel-reader-tts-launcher"
      :class="{ 'is-active': readerTTS.speaking || readerTTS.paused }"
      type="button"
      @click="ttsPanelOpen = true"
    >
      <span class="mobile-novel-reader-tts-launcher__title">听</span>
      <span class="mobile-novel-reader-tts-launcher__meta">
        {{ readerTTS.speaking ? '朗读中' : (readerTTS.paused ? '已暂停' : '语音朗读') }}
      </span>
    </button>

    <MobileReaderTTSPanel
      v-if="activeChapterSummary"
      class="mobile-novel-reader-tts-panel-host"
      :visible="ttsPanelOpen"
      :tts="readerTTS"
      @close="ttsPanelOpen = false"
    />

    <div v-if="activeChapterSummary" class="mobile-novel-reader-toolbar">
      <button
        v-if="authStore.isAuthenticated"
        class="mobile-novel-reader-toolbar__btn"
        type="button"
        @click="mailboxVisible = true"
      >
        <el-icon :size="16"><Promotion /></el-icon>
        <span>角色信箱</span>
      </button>
    </div>

    <div v-if="activeChapterSummary" class="mobile-novel-reader-pager">
      <button
        class="mobile-focus-button--secondary"
        type="button"
        :disabled="!previousChapterNumber"
        @click="previousChapterNumber && selectChapter(previousChapterNumber)"
      >
        上一章
      </button>
      <button
        class="mobile-focus-button--primary"
        type="button"
        @click="openChapterPicker"
      >
        第 {{ activeChapterSummary.chapterNumber }} 章
      </button>
      <button
        class="mobile-focus-button--secondary"
        type="button"
        :disabled="!nextChapterNumber"
        @click="nextChapterNumber && selectChapter(nextChapterNumber)"
      >
        下一章
      </button>
    </div>

    <transition name="mobile-novel-reader-overlay">
      <div v-if="chapterPickerOpen" class="mobile-novel-reader-overlay" @click.self="closeChapterPicker">
        <section class="mobile-novel-reader-picker">
          <header class="mobile-novel-reader-picker__header">
            <div class="mobile-novel-reader-picker__title">
              <strong>选择章节</strong>
              <span>{{ topbarTitle }}</span>
            </div>
            <button class="mobile-focus-button--ghost" type="button" @click="closeChapterPicker">
              <el-icon :size="14"><CloseBold /></el-icon>
              关闭
            </button>
          </header>

          <el-input
            v-model="chapterSearch"
            class="mobile-novel-reader-picker__search"
            placeholder="搜索章节号或标题"
            clearable
            :prefix-icon="Search"
          />

          <div class="mobile-novel-reader-picker__toolbar">
            <div class="mobile-focus-chip-row">
              <button
                v-for="item in sortOptions"
                :key="`picker-${item.value}`"
                class="mobile-focus-chip"
                :class="{ active: sortOrder === item.value }"
                type="button"
                @click="sortOrder = item.value"
              >
                {{ item.label }}
              </button>
            </div>

            <button class="mobile-focus-button--ghost" type="button" @click="ensureChaptersLoaded(true)">
              <el-icon :size="14"><RefreshRight /></el-icon>
              刷新
            </button>
          </div>

          <div v-if="chaptersLoading && !chaptersLoaded" class="mobile-focus-loading">
            <el-skeleton animated :rows="5" />
          </div>

          <div v-else-if="filteredChapters.length" class="mobile-novel-reader-picker__list">
            <button
              v-for="chapter in filteredChapters"
              :key="`picker-chapter-${chapter.chapterNumber}`"
              class="mobile-novel-reader-picker__item"
              :class="{ active: activeChapterNumber === chapter.chapterNumber }"
              type="button"
              @click="selectChapter(chapter.chapterNumber)"
            >
              <div class="mobile-novel-reader-picker__item-top">
                <strong>第 {{ chapter.chapterNumber }} 章</strong>
                <span v-if="cachedChapterNumbers.has(chapter.chapterNumber)" class="mobile-novel-reader-picker__cached-badge">已缓存</span>
                <span>{{ (chapter.wordCount || 0).toLocaleString() }} 字</span>
              </div>
              <p>{{ chapter.title }}</p>
            </button>
            <button
              v-if="chapterCatalogHasMore"
              class="mobile-focus-button--ghost mobile-novel-reader-picker__load-more"
              type="button"
              :disabled="chaptersLoadingMore"
              @click="loadMoreChapters"
            >
              {{ chaptersLoadingMore ? '加载中...' : `继续加载 ${chapters.length} / ${chapterCatalogTotal}` }}
            </button>
          </div>

          <div v-else class="mobile-focus-empty mobile-novel-reader-picker__empty">
            <strong>没有找到匹配章节</strong>
            <p>换个章节号或标题关键词试试。</p>
          </div>
        </section>
      </div>
    </transition>

    <transition name="mobile-novel-reader-overlay">
      <div v-if="contentEditorVisible && activeChapterSummary" class="mobile-novel-reader-overlay" @click.self="contentEditorVisible = false">
        <section class="mobile-novel-reader-editor">
          <header class="mobile-novel-reader-editor__header">
            <div>
              <strong>编辑第 {{ activeChapterSummary.chapterNumber }} 章正文</strong>
              <span>保存后会立即回到阅读视图，继续生成或发布前都能再调整。</span>
            </div>
            <button class="mobile-focus-button--ghost" type="button" @click="contentEditorVisible = false">
              <el-icon :size="14"><CloseBold /></el-icon>
              关闭
            </button>
          </header>
          <textarea
            v-model="chapterContentDraft"
            class="mobile-novel-reader-editor__textarea"
            placeholder="在这里修改章节正文，保存后阅读页会同步更新。"
          />
          <footer class="mobile-novel-reader-editor__footer">
            <span>{{ chapterContentDraft.length.toLocaleString() }} 字符</span>
            <button
              class="mobile-focus-button--primary"
              type="button"
              :disabled="savingChapterContent"
              @click="saveChapterContent"
            >
              {{ savingChapterContent ? '保存中...' : '保存正文' }}
            </button>
          </footer>
        </section>
      </div>
    </transition>

    <MobileChapterTitleEditor
      v-if="activeChapterSummary"
      :visible="titleEditorVisible"
      :novel-id="novelId"
      :chapter-number="activeChapterSummary.chapterNumber"
      :current-title="activeChapterSummary.title"
      @update:visible="(value) => { titleEditorVisible = value; }"
      @updated="handleTitleUpdated"
    />

    <!-- 划线批注 & 分享卡片 -->
    <MobileTextActionBar
      :visible="readerAnnotations.actionBarVisible.value"
      :x="readerAnnotations.actionBarX.value"
      :y="readerAnnotations.actionBarY.value"
      :type="readerAnnotations.actionBarType.value"
      @highlight="readerAnnotations.handleHighlight()"
      @note="readerAnnotations.handleNote()"
      @share="readerAnnotations.handleShare()"
      @close="readerAnnotations.closeAll()"
    />
    <MobileAnnotationPanel
      :visible="readerAnnotations.annotationPanelVisible.value"
      :annotations="readerAnnotations.annotationPanelAnnotations.value"
      :selected-text="readerAnnotations.annotationPanelText.value"
      @close="readerAnnotations.closeAll()"
      @like="readerAnnotations.handleLike($event)"
      @delete="readerAnnotations.handleDelete($event)"
    />
    <MobileShareCardViewer
      :visible="readerAnnotations.shareCardViewerVisible.value"
      :data="readerAnnotations.shareCardData.value"
      @close="readerAnnotations.closeAll()"
    />
    <MobileNoteInput
      :visible="readerAnnotations.noteInputVisible.value"
      :selected-text="readerAnnotations.pendingNoteSelection.value?.text ?? ''"
      @confirm="readerAnnotations.confirmNote()"
      @cancel="readerAnnotations.cancelNote()"
    />
    <CharacterMailbox
      :visible="mailboxVisible"
      :novel-id="novelId"
      @close="mailboxVisible = false"
      @open-chat="openCharacterChat"
      @open-moments="momentsVisible = true"
    />
    <CharacterMoments
      :visible="momentsVisible"
      :novel-id="novelId"
      :is-owner="isReaderOwner"
      @close="momentsVisible = false"
    />
    <CharacterChatSheet
      :visible="chatVisible"
      :novel-id="novelId"
      :character-id="chatCharacter?.id || ''"
      :character-name="chatCharacter?.name || ''"
      :character-portrait="chatCharacter?.portraitImagePath ? `/api/novels/${novelId}/characters/${chatCharacter.id}/portrait?w=200` : ''"
      :chapter-info="chatCharacter?.currentState || ''"
      @close="chatVisible = false"
    />
    <MobileComicStrip
      v-if="comicVisible && activeChapterSummary"
      v-model:visible="comicVisible"
      :novel-id="novelId"
      :chapter-number="activeChapterSummary.chapterNumber"
      :focus-panel-index="Number(route.query.comicPanel) || undefined"
    />
  </div>
</template>

<style scoped src="../styles/mobile-novel-reader.css"></style>

<style scoped>
/* 注入原创站阅读器主题变量到共用听书面板组件 */
.mobile-novel-reader-tts-panel-host {
  --rtts-text: var(--mobile-reader-ink);
  --rtts-muted: var(--mobile-reader-muted);
  --rtts-line: color-mix(in srgb, var(--star-brand-sky) 14%, rgba(148, 163, 184, 0.28));
  --rtts-surface: var(--mobile-reader-surface);
  --rtts-paper: var(--mobile-reader-paper);
  --rtts-accent-from: var(--star-brand-sky);
  --rtts-accent-to: var(--star-brand-teal);
  --rtts-accent-from-soft: rgba(56, 189, 248, 0.12);
  --rtts-accent-to-soft: rgba(20, 184, 166, 0.08);
  --rtts-accent-line: color-mix(in srgb, var(--star-brand-sky) 48%, var(--mobile-reader-line));
  --rtts-panel-width: min(calc(100% - 24px), 392px);
  --rtts-z: 25;
}

/* 划线高亮样式 */
.annotated-highlight {
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.15) 0%, rgba(14, 165, 233, 0.22) 100%);
  border-bottom: 1.5px dashed rgba(14, 165, 233, 0.45);
  cursor: pointer;
  transition: background 0.2s;
  border-radius: 2px;
  padding: 0 1px;
}

.annotated-highlight:hover {
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.25) 0%, rgba(14, 165, 233, 0.35) 100%);
}

/* 划线模式激活态按钮 */
.mobile-novel-reader-article__reading-actions--active {
  background: color-mix(in srgb, var(--mobile-focus-accent) 18%, var(--mobile-reader-paper)) !important;
  color: var(--mobile-reader-ink) !important;
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 42%, var(--mobile-reader-line)) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--mobile-focus-accent) 40%, transparent);
}
</style>
