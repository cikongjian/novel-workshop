import { computed, nextTick, onBeforeUnmount, onMounted, proxyRefs, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import {
  createBookComment,
  deleteBookComment,
  favoriteBook,
  getBookCommentPage,
  getBookStoreDetail,
  getBookFavoriteStatus,
  getBookLikeStatus,
  getBookStorePublicChapterPage,
  getBookStorePublicChapterContent,
  likeBook,
  type BookStorePublicChapter,
  type BookStorePublicChapterContent,
} from '../api/bookstore';
import type { BookStore, BookStoreComment } from '../api/types';
import { useRealNameAccess } from './useRealNameAccess';
import { useAuthStore } from '../stores/auth';
import { extractApiErrorMessage } from '../utils/api-error';
import { ensureAuthenticatedAction } from '../utils/auth-action';
import { useReaderTTS } from './useReaderTTS';
import { readReaderDisplayMode, writeReaderDisplayMode } from '../utils/reader-display-mode';
import { cleanReaderContent } from '../utils/clean-reader-content';

export type ReaderTheme = 'paper' | 'mist' | 'night';

type PublicChapter = BookStorePublicChapter;
const MOBILE_CATALOG_PAGE_SIZE = 80;
const MOBILE_COMMENT_PAGE_SIZE = 20;

export const THEME_OPTIONS: Array<{
  value: ReaderTheme;
  label: string;
  page: string;
  paper: string;
  text: string;
  muted: string;
  line: string;
}> = [
  {
    value: 'paper',
    label: '纸页',
    page: 'linear-gradient(180deg, #f5efe2 0%, #efe5d4 100%)',
    paper: 'rgba(250, 244, 232, 0.96)',
    text: '#2e2218',
    muted: '#7f6854',
    line: 'rgba(120, 91, 62, 0.12)',
  },
  {
    value: 'mist',
    label: '雾蓝',
    page: 'linear-gradient(180deg, #e7eef4 0%, #dbe5ee 100%)',
    paper: 'rgba(246, 249, 252, 0.96)',
    text: '#1e2c39',
    muted: '#607284',
    line: 'rgba(70, 105, 138, 0.12)',
  },
  {
    value: 'night',
    label: '夜读',
    page: 'linear-gradient(180deg, #0b1320 0%, #111d31 100%)',
    paper: 'rgba(14, 24, 38, 0.96)',
    text: '#dce7f3',
    muted: '#8ba0b8',
    line: 'rgba(125, 149, 174, 0.16)',
  },
];

export const FONT_SIZE_OPTIONS = [16, 18, 20, 22] as const;
export const LINE_HEIGHT_OPTIONS = [1.8, 1.95, 2.1] as const;

export type ReaderFontFamily = 'serif' | 'sans' | 'kai';

export const FONT_FAMILY_OPTIONS: Array<{ value: ReaderFontFamily; label: string; stack: string }> = [
  {
    value: 'serif',
    label: '衬线',
    stack: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif',
  },
  {
    value: 'sans',
    label: '无衬线',
    stack: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  },
  {
    value: 'kai',
    label: '楷体',
    stack: '"Kaiti SC", "STKaiti", "KaiTi", "AR PL UKai CN", "Noto Serif SC", serif',
  },
];

export const FONT_WEIGHT_OPTIONS = [400, 500, 600] as const;

export function useMobileBookReader() {
  const route = useRoute();
  const router = useRouter();
  const authStore = useAuthStore();
  const {
    ensureRealNameAction,
    handleRealNameBlockedError,
    realNameEnabled,
    loadRealNamePolicy,
  } = useRealNameAccess();

  const loading = ref(false);
  const chapterLoading = ref(false);
  const liking = ref(false);
  const favoriting = ref(false);
  const catalogVisible = ref(false);
  const commentsVisible = ref(false);
  const settingsVisible = ref(false);
  const catalogLoading = ref(false);
  const commentsLoading = ref(false);
  const commentSubmitting = ref(false);
  const deletingCommentId = ref('');
  const book = ref<BookStore | null>(null);
  const chapters = ref<PublicChapter[]>([]);
  const catalogPage = ref(1);
  const catalogTotal = ref(0);
  const catalogHasMore = ref(false);
  const comments = ref<BookStoreComment[]>([]);
  const commentsLoaded = ref(false);
  const commentsPage = ref(0);
  const commentsTotal = ref(0);
  const commentsHasMore = ref(false);
  const currentChapter = ref<BookStorePublicChapterContent | null>(null);
  const activeChapterNumber = ref<number | null>(null);
  const scrollProgress = ref(0);
  const synopsisExpanded = ref(false);
  const hasLiked = ref(false);
  const hasFavorited = ref(false);
  const commentDraft = ref('');
  const highlightedCommentId = ref('');
  const settings = ref({
    theme: 'paper' as ReaderTheme,
    fontSize: 20,
    lineHeight: 2.1,
    fontFamily: 'serif' as ReaderFontFamily,
    fontWeight: 400,
  });

  const bookId = computed(() => String(route.params.id || ''));
  const requestedChapterNumber = computed(() => {
    const value = Number(route.params.chapterId);
    return Number.isFinite(value) && value > 0 ? value : null;
  });
  const requestedCommentId = computed(() =>
    typeof route.query.commentId === 'string' ? route.query.commentId : '',
  );
  const shouldOpenCommentsFromQuery = computed(() => route.query.comments === '1');
  const currentTheme = computed(() =>
    THEME_OPTIONS.find((item) => item.value === settings.value.theme) ?? THEME_OPTIONS[0],
  );
  const isNightTheme = computed(() => settings.value.theme === 'night');
  const activeChapterSummary = computed(() => resolveActiveChapterSummary());
  const currentChapterIndex = computed(() =>
    activeChapterNumber.value == null
      ? -1
      : chapters.value.findIndex((item) => item.chapterNumber === activeChapterNumber.value),
  );
  const previousChapter = computed(() =>
    currentChapterIndex.value > 0 ? chapters.value[currentChapterIndex.value - 1] ?? null : null,
  );
  const nextChapter = computed(() =>
    currentChapterIndex.value >= 0 && currentChapterIndex.value < chapters.value.length - 1
      ? chapters.value[currentChapterIndex.value + 1] ?? null
      : null,
  );
  const readingParagraphs = computed(() => {
    const content = cleanReaderContent(currentChapter.value?.content ?? '');
    return content.split(/\r?\n+/).map((item) => item.trim()).filter(Boolean);
  });
  const readerTTS = proxyRefs(useReaderTTS(readingParagraphs, {
    novelId: bookId,
    novelTitle: computed(() => book.value?.displayTitle || book.value?.title || '书城作品'),
  }));
  const currentWordCount = computed(() =>
    activeChapterSummary.value?.wordCount || currentChapter.value?.wordCount || 0,
  );
  const estimatedMinutes = computed(() => Math.max(1, Math.ceil(currentWordCount.value / 700)));
  const overlayVisible = computed(() => catalogVisible.value || commentsVisible.value || settingsVisible.value);
  const showRealNameBanner = computed(() => authStore.authEnabled && realNameEnabled.value);
  const currentFontFamily = computed(() =>
    FONT_FAMILY_OPTIONS.find((f) => f.value === settings.value.fontFamily) ?? FONT_FAMILY_OPTIONS[0],
  );

  const pageStyle = computed(() => ({
    '--reader-page-background': currentTheme.value.page,
    '--reader-paper-background': currentTheme.value.paper,
    '--reader-text-color': currentTheme.value.text,
    '--reader-muted-color': currentTheme.value.muted,
    '--reader-line-color': currentTheme.value.line,
    '--reader-font-size': `${settings.value.fontSize}px`,
    '--reader-line-height': String(settings.value.lineHeight),
    '--reader-font-family': currentFontFamily.value.stack,
    '--reader-font-weight': String(settings.value.fontWeight),
  }));

  function restoreReaderSettings() {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('nw-mobile-book-reader:settings');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<typeof settings.value>;
      if (parsed.theme && THEME_OPTIONS.some((item) => item.value === parsed.theme)) {
        settings.value.theme = parsed.theme;
      }
      if (parsed.fontSize && FONT_SIZE_OPTIONS.includes(parsed.fontSize as (typeof FONT_SIZE_OPTIONS)[number])) {
        settings.value.fontSize = parsed.fontSize;
      }
      if (parsed.lineHeight && LINE_HEIGHT_OPTIONS.includes(parsed.lineHeight as (typeof LINE_HEIGHT_OPTIONS)[number])) {
        settings.value.lineHeight = parsed.lineHeight;
      }
      if (parsed.fontFamily && FONT_FAMILY_OPTIONS.some((f) => f.value === parsed.fontFamily)) {
        settings.value.fontFamily = parsed.fontFamily as ReaderFontFamily;
      }
      if (parsed.fontWeight && FONT_WEIGHT_OPTIONS.includes(parsed.fontWeight as (typeof FONT_WEIGHT_OPTIONS)[number])) {
        settings.value.fontWeight = parsed.fontWeight;
      }
    } catch {
      window.localStorage.removeItem('nw-mobile-book-reader:settings');
    }

    const displayMode = readReaderDisplayMode();
    if (displayMode === 'night') {
      settings.value.theme = 'night';
    } else if (displayMode === 'light' && settings.value.theme === 'night') {
      settings.value.theme = 'paper';
    }
  }

  function persistReaderSettings() {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('nw-mobile-book-reader:settings', JSON.stringify(settings.value));
  }

  function resolveActiveChapterSummary(): PublicChapter | null {
    if (activeChapterNumber.value == null) return null;
    const loadedSummary = chapters.value.find((item) => item.chapterNumber === activeChapterNumber.value);
    if (loadedSummary) return loadedSummary;
    if (!currentChapter.value || currentChapter.value.chapterNumber !== activeChapterNumber.value) return null;
    return {
      chapterNumber: currentChapter.value.chapterNumber,
      title: currentChapter.value.title,
      wordCount: currentChapter.value.wordCount,
    };
  }

  function readRememberedChapter(id: string): number | null {
    if (typeof window === 'undefined' || !id) return null;
    const raw = window.localStorage.getItem(`nw-mobile-book-reader:last-chapter:${id}`);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function rememberChapter(id: string, chapterNumber: number) {
    if (typeof window === 'undefined' || !id || chapterNumber < 1) return;
    window.localStorage.setItem(`nw-mobile-book-reader:last-chapter:${id}`, String(chapterNumber));
  }

  function readChapterScroll(id: string, chapterNumber: number): number | null {
    if (typeof window === 'undefined' || !id || chapterNumber < 1) return null;
    const raw = window.localStorage.getItem(`nw-mobile-book-reader:scroll:${id}:${chapterNumber}`);
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function saveChapterScroll(chapterNumber: number, scrollY: number) {
    if (typeof window === 'undefined' || !bookId.value || chapterNumber < 1) return;
    if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => {
      window.localStorage.setItem(
        `nw-mobile-book-reader:scroll:${bookId.value}:${chapterNumber}`,
        String(Math.round(scrollY)),
      );
    }, 300);
  }

  function updateScrollProgress() {
    if (typeof window === 'undefined') return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress.value = maxScroll <= 0 ? 0 : Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100));
    if (activeChapterNumber.value != null && !chapterLoading.value) {
      saveChapterScroll(activeChapterNumber.value, window.scrollY);
    }
  }

  async function scrollToChapterTop() {
    if (typeof window === 'undefined') return;
    const savedScroll = activeChapterNumber.value != null
      ? readChapterScroll(bookId.value, activeChapterNumber.value)
      : null;
    const targetY = savedScroll ?? 0;
    window.scrollTo({ top: 0, behavior: 'auto' });
    await nextTick();
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'auto' });
      const articleTop = document.querySelector<HTMLElement>('.mobile-book-reader-article, .mobile-book-reader-hero');
      if (articleTop && !savedScroll) {
        articleTop.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
      if (savedScroll) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: targetY, behavior: 'auto' });
        });
      }
    });
  }

  function closeOverlays() {
    catalogVisible.value = false;
    commentsVisible.value = false;
    settingsVisible.value = false;
  }

  function openCatalog() {
    commentsVisible.value = false;
    settingsVisible.value = false;
    catalogVisible.value = true;
    void ensureCatalogLoaded();
  }

  function openComments() {
    catalogVisible.value = false;
    settingsVisible.value = false;
    commentsVisible.value = true;
    void ensureCommentsLoaded();
  }

  function toggleNightMode() {
    settings.value.theme = isNightTheme.value ? 'paper' : 'night';
  }

  async function focusCommentFromQuery() {
    const commentId = requestedCommentId.value;
    if (commentId) {
      await ensureCommentsLoaded();
      while (
        commentsHasMore.value
        && !comments.value.some((item) => item.id === commentId)
      ) {
        const previousPage = commentsPage.value;
        await loadMoreComments();
        if (commentsPage.value === previousPage) break;
      }
    }
    if (!commentId || !comments.value.some((item) => item.id === commentId)) {
      highlightedCommentId.value = '';
      return;
    }

    highlightedCommentId.value = commentId;
    if (!commentsVisible.value) {
      openComments();
    }

    await nextTick();
    document.getElementById(`mobile-book-comment-${commentId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });

    window.setTimeout(() => {
      if (highlightedCommentId.value === commentId) {
        highlightedCommentId.value = '';
      }
    }, 2400);
  }

  function openSettings() {
    catalogVisible.value = false;
    commentsVisible.value = false;
    settingsVisible.value = true;
  }

  function toggleSynopsis() {
    synopsisExpanded.value = !synopsisExpanded.value;
  }

  function syncRouteToChapter(chapterNumber: number) {
    if (!bookId.value || requestedChapterNumber.value === chapterNumber) return;
    void router.replace({
      path: `/m/bookstore/${bookId.value}/read/${chapterNumber}`,
      query: route.query,
    });
  }

  function pickInitialChapter(availableChapters: PublicChapter[]): number | null {
    if (requestedChapterNumber.value) {
      return requestedChapterNumber.value;
    }

    const remembered = readRememberedChapter(bookId.value);
    if (remembered) {
      return remembered;
    }

    return availableChapters[0]?.chapterNumber ?? null;
  }

  async function loadCatalogPage(page: number, append = false): Promise<PublicChapter[]> {
    if (!bookId.value) return [];
    catalogLoading.value = true;
    try {
      const result = await getBookStorePublicChapterPage(bookId.value, {
        page,
        pageSize: MOBILE_CATALOG_PAGE_SIZE,
      });
      catalogPage.value = result.page;
      catalogTotal.value = result.total;
      catalogHasMore.value = result.hasMore;
      const nextItems = append
        ? result.items.filter((chapter) => !chapters.value.some((item) => item.chapterNumber === chapter.chapterNumber))
        : result.items;
      chapters.value = append ? [...chapters.value, ...nextItems] : nextItems;
      if (book.value) {
        book.value.publishedChapterCount = result.total;
      }
      return result.items;
    } catch (error) {
      if (catalogVisible.value || !append) {
        ElMessage.warning(extractApiErrorMessage(error, '章节目录加载失败，请刷新重试'));
      }
      return [];
    } finally {
      catalogLoading.value = false;
    }
  }

  let commentsPromise: Promise<void> | null = null;

  async function ensureCommentsLoaded(force = false): Promise<void> {
    if (!force && commentsLoaded.value) return;
    if (commentsPromise) return commentsPromise;
    if (!bookId.value) return;

    commentsPromise = (async () => {
      commentsLoading.value = true;
      try {
        await loadCommentsPage(1, false);
        commentsLoaded.value = true;
      } catch {
        comments.value = [];
        commentsPage.value = 0;
        commentsTotal.value = 0;
        commentsHasMore.value = false;
      } finally {
        commentsLoading.value = false;
        commentsPromise = null;
      }
    })();

    return commentsPromise;
  }

  async function loadCommentsPage(page: number, append: boolean): Promise<void> {
    if (!bookId.value) return;
    const result = await getBookCommentPage(bookId.value, {
      page,
      pageSize: MOBILE_COMMENT_PAGE_SIZE,
    });
    const existing = new Set(comments.value.map((item) => item.id));
    const nextItems = append
      ? result.items.filter((item) => !existing.has(item.id))
      : result.items;
    comments.value = append ? [...comments.value, ...nextItems] : nextItems;
    commentsPage.value = result.page;
    commentsTotal.value = result.total;
    commentsHasMore.value = result.page < result.totalPages;
  }

  async function loadMoreComments(): Promise<void> {
    if (commentsLoading.value || !commentsHasMore.value) return;
    commentsLoading.value = true;
    try {
      await loadCommentsPage(commentsPage.value + 1, true);
      commentsLoaded.value = true;
    } catch (error) {
      ElMessage.warning(extractApiErrorMessage(error, '加载更多评论失败'));
    } finally {
      commentsLoading.value = false;
    }
  }

  async function ensureCatalogLoaded(force = false): Promise<void> {
    if (!bookId.value) return;
    if (!force && chapters.value.length > 0) return;
    await loadCatalogPage(1, false);
  }

  async function loadMoreCatalog(): Promise<void> {
    if (catalogLoading.value || !catalogHasMore.value) return;
    await loadCatalogPage(catalogPage.value + 1, true);
  }

  async function loadBookReader() {
    if (!bookId.value) return;
    loading.value = true;
    try {
      closeOverlays();
      synopsisExpanded.value = false;
      comments.value = [];
      commentsLoaded.value = false;
      commentsPage.value = 0;
      commentsTotal.value = 0;
      commentsHasMore.value = false;
      commentDraft.value = '';
      highlightedCommentId.value = '';
      catalogPage.value = 1;
      catalogTotal.value = 0;
      catalogHasMore.value = false;
      // 先加载书籍基本信息，失败时直接报错退出
      const detail = await getBookStoreDetail(bookId.value);
      book.value = detail;

      // 再加载章节与互动状态，失败不影响书籍信息展示
      try {
        const [publicChaptersResult, likeStatusResult, favoriteStatusResult] = await Promise.allSettled([
          getBookStorePublicChapterPage(bookId.value, { page: 1, pageSize: MOBILE_CATALOG_PAGE_SIZE }),
          getBookLikeStatus(bookId.value),
          getBookFavoriteStatus(bookId.value),
        ]);
        const publicChapters = publicChaptersResult.status === 'fulfilled' ? publicChaptersResult.value.items : [];
        chapters.value = publicChapters;
        catalogPage.value = publicChaptersResult.status === 'fulfilled' ? publicChaptersResult.value.page : 1;
        catalogTotal.value = publicChaptersResult.status === 'fulfilled' ? publicChaptersResult.value.total : 0;
        catalogHasMore.value = publicChaptersResult.status === 'fulfilled' ? publicChaptersResult.value.hasMore : false;
        if (publicChaptersResult.status === 'fulfilled') {
          book.value.publishedChapterCount = publicChaptersResult.value.total;
        }
        hasLiked.value = likeStatusResult.status === 'fulfilled' ? (likeStatusResult.value.liked ?? false) : false;
        hasFavorited.value = favoriteStatusResult.status === 'fulfilled'
          ? (favoriteStatusResult.value.favorited ?? false)
          : false;
        if (shouldOpenCommentsFromQuery.value) {
          openComments();
        }
        const initialChapter = pickInitialChapter(publicChapters);
        activeChapterNumber.value = initialChapter;
        currentChapter.value = null;

        if (initialChapter != null) {
          rememberChapter(bookId.value, initialChapter);
          syncRouteToChapter(initialChapter);
        }
        await focusCommentFromQuery();
      } catch (chapErr) {
        chapters.value = [];
        catalogPage.value = 1;
        catalogTotal.value = 0;
        catalogHasMore.value = false;
        activeChapterNumber.value = null;
        console.error('[MobileBookReader] loadChapters failed:', chapErr);
        ElMessage.warning('章节列表加载失败，请刷新重试');
      }
    } catch (error) {
      book.value = null;
      chapters.value = [];
      catalogPage.value = 1;
      catalogTotal.value = 0;
      catalogHasMore.value = false;
      activeChapterNumber.value = null;
      currentChapter.value = null;
      comments.value = [];
      commentsLoaded.value = false;
      commentsPage.value = 0;
      commentsTotal.value = 0;
      commentsHasMore.value = false;
      synopsisExpanded.value = false;
      hasLiked.value = false;
      hasFavorited.value = false;
      commentDraft.value = '';
      highlightedCommentId.value = '';
      ElMessage.error(extractApiErrorMessage(error, '加载书籍失败'));
    } finally {
      loading.value = false;
      updateScrollProgress();
    }
  }

  async function loadChapterDetail() {
    if (!bookId.value || activeChapterNumber.value == null) {
      currentChapter.value = null;
      return;
    }

    chapterLoading.value = true;
    try {
      currentChapter.value = await getBookStorePublicChapterContent(bookId.value, activeChapterNumber.value);
      rememberChapter(bookId.value, activeChapterNumber.value);
    } catch (error) {
      currentChapter.value = null;
      ElMessage.error(extractApiErrorMessage(error, '加载正文失败'));
    } finally {
      chapterLoading.value = false;
      void scrollToChapterTop();
    }
  }

  function goBack() {
    void router.push('/m');
  }

  function selectChapter(chapterNumber: number) {
    if (!bookId.value) return;
    activeChapterNumber.value = chapterNumber;
    rememberChapter(bookId.value, chapterNumber);
    closeOverlays();
    syncRouteToChapter(chapterNumber);
    void scrollToChapterTop();
  }

  function ensureInteractionAuth() {
    return ensureAuthenticatedAction({
      authEnabled: authStore.authEnabled,
      isAuthenticated: authStore.isAuthenticated,
      isMobile: true,
      router,
      redirect: route.fullPath,
    });
  }

  function canDeleteComment(comment: BookStoreComment): boolean {
    if (!authStore.user?.id) return false;
    return authStore.isAdmin || authStore.user.id === comment.userId;
  }

  async function handleLike() {
    if (!book.value || liking.value) return;
    if (!ensureInteractionAuth()) return;
    liking.value = true;
    try {
      const result = await likeBook(book.value.id);
      book.value.likeCount = result.likeCount;
      hasLiked.value = result.liked;
      ElMessage.success(result.liked ? '点赞成功' : '已取消点赞');
    } catch (error) {
      ElMessage.error(extractApiErrorMessage(error, '点赞失败'));
    } finally {
      liking.value = false;
    }
  }

  async function handleFavorite() {
    if (!book.value || favoriting.value) return;
    if (!ensureInteractionAuth()) return;
    favoriting.value = true;
    try {
      const result = await favoriteBook(book.value.id);
      book.value.favoriteCount = result.favoriteCount;
      hasFavorited.value = result.favorited;
      ElMessage.success(result.favorited ? '收藏成功' : '已取消收藏');
    } catch (error) {
      ElMessage.error(extractApiErrorMessage(error, '收藏失败'));
    } finally {
      favoriting.value = false;
    }
  }

  async function handleSubmitComment() {
    if (!book.value || commentSubmitting.value) return;
    if (!ensureInteractionAuth()) return;
    if (!(await ensureRealNameAction('comment', {
      router,
      isMobile: true,
      redirect: route.fullPath,
    }))) return;

    const content = commentDraft.value.trim();
    if (!content) {
      ElMessage.warning('请输入评论内容');
      return;
    }

    commentSubmitting.value = true;
    try {
      await ensureCommentsLoaded();
      const result = await createBookComment(book.value.id, content);
      comments.value = [result.comment, ...comments.value];
      commentDraft.value = '';
      commentsTotal.value += 1;
      book.value.commentCount = commentsTotal.value || comments.value.length;
      ElMessage.success('评论已发布');
    } catch (error) {
      if (handleRealNameBlockedError(error, {
        scene: 'comment',
        router,
        isMobile: true,
        redirect: route.fullPath,
      })) {
        return;
      }
      ElMessage.error(extractApiErrorMessage(error, '评论发布失败'));
    } finally {
      commentSubmitting.value = false;
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!book.value || deletingCommentId.value) return;
    deletingCommentId.value = commentId;
    try {
      const result = await deleteBookComment(book.value.id, commentId);
      comments.value = comments.value.filter((item) => item.id !== commentId);
      commentsTotal.value = Math.max(0, commentsTotal.value - 1);
      book.value.commentCount = result.commentCount;
      ElMessage.success('评论已删除');
    } catch (error) {
      ElMessage.error(extractApiErrorMessage(error, '删除评论失败'));
    } finally {
      deletingCommentId.value = '';
    }
  }

  watch(bookId, () => {
    void loadBookReader();
  }, { immediate: true });

  watch(requestedChapterNumber, (value) => {
    if (value == null) return;
    if (chapters.value.some((item) => item.chapterNumber === value) && activeChapterNumber.value !== value) {
      activeChapterNumber.value = value;
      rememberChapter(bookId.value, value);
      void scrollToChapterTop();
    }
  });

  watch([requestedCommentId, shouldOpenCommentsFromQuery], () => {
    if (shouldOpenCommentsFromQuery.value) {
      openComments();
    }
    void focusCommentFromQuery();
  });

  watch(() => [bookId.value, activeChapterNumber.value] as const, () => {
    void loadChapterDetail();
  }, { immediate: true });

  watch(overlayVisible, (visible) => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = visible ? 'hidden' : '';
    document.body.style.touchAction = visible ? 'none' : '';
  }, { immediate: true });

  watch(settings, () => {
    persistReaderSettings();
    writeReaderDisplayMode(settings.value.theme === 'night' ? 'night' : 'light');
  }, { deep: true });

  onMounted(() => {
    void loadRealNamePolicy();
    restoreReaderSettings();
    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', updateScrollProgress);
    if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
    if (activeChapterNumber.value != null && typeof window !== 'undefined') {
      saveChapterScroll(activeChapterNumber.value, window.scrollY);
    }
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
  });

  return proxyRefs({
    loading,
    chapterLoading,
    liking,
    favoriting,
    catalogVisible,
    commentsVisible,
    settingsVisible,
    catalogLoading,
    commentsLoading,
    commentSubmitting,
    deletingCommentId,
    book,
    chapters,
    catalogTotal,
    catalogHasMore,
    comments,
    commentsTotal,
    commentsHasMore,
    currentChapter,
    activeChapterNumber,
    scrollProgress,
    synopsisExpanded,
    hasLiked,
    hasFavorited,
    commentDraft,
    highlightedCommentId,
    settings,
    currentTheme,
    isNightTheme,
    activeChapterSummary,
    previousChapter,
    nextChapter,
    readingParagraphs,
    readerTTS,
    currentWordCount,
    estimatedMinutes,
    overlayVisible,
    showRealNameBanner,
    pageStyle,
    openCatalog,
    loadMoreCatalog,
    loadMoreComments,
    openComments,
    openSettings,
    toggleNightMode,
    toggleSynopsis,
    closeOverlays,
    goBack,
    selectChapter,
    canDeleteComment,
    handleLike,
    handleFavorite,
    handleSubmitComment,
    handleDeleteComment,
  });
}
