<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, ChatDotRound, CloseBold, CollectionTag, EditPen, List, MagicStick, Moon, Picture, Promotion, Setting, StarFilled, Sunny } from '@element-plus/icons-vue';
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  THEME_OPTIONS,
  useMobileBookReader,
} from '../composables/useMobileBookReader';
import RealNameStatusBanner from '../components/auth/RealNameStatusBanner.vue';
import MobileGuestLoginButton from '../components/mobile-entry/MobileGuestLoginButton.vue';
import MobileReaderTTSPanel from '../components/mobile-entry/MobileReaderTTSPanel.vue';
import MobileBookComicViewer from '../components/mobile-entry/MobileBookComicViewer.vue';
import { useAuthStore } from '../stores/auth';
import { safeImageUrl } from '../utils/safe-url';
import { useReaderAnnotations } from '../composables/useReaderAnnotations';
import { useOfflineIndicator } from '../composables/useOfflineIndicator';
import { useSwipeNavigation } from '../composables/useSwipeNavigation';
import { useTapSelect } from '../composables/useTapSelect';
import { useOfflineChapterCache } from '../composables/useOfflineStorage';
import MobileTextActionBar from '../components/mobile-entry/MobileTextActionBar.vue';
import MobileAnnotationPanel from '../components/mobile-entry/MobileAnnotationPanel.vue';
import MobileShareCardViewer from '../components/mobile-entry/MobileShareCardViewer.vue';
import MobileNoteInput from '../components/mobile-entry/MobileNoteInput.vue';
import CharacterMailbox from '../components/mobile-entry/CharacterMailbox.vue';
import CharacterMoments from '../components/mobile-entry/CharacterMoments.vue';
import CharacterChatSheet from '../components/mobile-entry/CharacterChatSheet.vue';
import MobilePlotVoteCard from '../components/mobile-entry/MobilePlotVoteCard.vue';
import SideStoryPlaza from '../components/mobile-entry/SideStoryPlaza.vue';
import SideStoryGenerateSheet from '../components/mobile-entry/SideStoryGenerateSheet.vue';
import SideStoryReader from '../components/mobile-entry/SideStoryReader.vue';
import ForkConfirmSheet from '../components/mobile-entry/ForkConfirmSheet.vue';
import ForkBanner from '../components/mobile-entry/ForkBanner.vue';
import { useReadingEnhance } from '../composables/useReadingEnhance';
import { usePublicBookComic } from '../composables/usePublicBookComic';
import { useAchievements } from '../composables/useAchievements';
import type { WritableCharacter } from '../api/character-mail';

const reader = useMobileBookReader();
const publicComic = usePublicBookComic();
const achievements = useAchievements();
const authStore = useAuthStore();
const ttsPanelOpen = ref(false);
const mailboxVisible = ref(false);
const momentsVisible = ref(false);
const chatVisible = ref(false);
const chatCharacter = ref<WritableCharacter | null>(null);
const sideStoryPlazaVisible = ref(false);
const sideStoryGenVisible = ref(false);
const sideStoryReaderVisible = ref(false);
const sideStoryReaderId = ref<string | null>(null);
const forkSheetVisible = ref(false);
const forkedFromInfo = computed(() => {
  const meta = reader.book as any;
  return meta?.forkedFrom ?? null;
});

function openCharacterChat(char: WritableCharacter) {
  chatCharacter.value = char;
  mailboxVisible.value = false;
  chatVisible.value = true;
}

// 划线批注 & 分享
const bookArticleContentRef = ref<HTMLElement | null>(null);
const bookNovelId = computed(() => reader.book?.novelId ?? '');
const bookChapterNumber = computed(() => reader.activeChapterSummary?.chapterNumber ?? null);
const bookParagraphs = computed(() => reader.readingParagraphs);
const readerAnnotations = useReaderAnnotations(
  bookNovelId,
  bookChapterNumber,
  bookParagraphs,
  bookArticleContentRef,
  computed(() => reader.book?.title ?? '书城作品'),
  computed(() => authStore.user?.penName || authStore.user?.displayName || '书城读者'),
);

const chapterEnterTime = ref<number>(Date.now());
const lastRecordedChapter = ref<number | null>(null);

watch(() => reader.activeChapterNumber, (newNum, oldNum) => {
  ttsPanelOpen.value = false;
  const now = Date.now();
  if (oldNum && reader.book?.id && reader.readingParagraphs.length > 0
      && lastRecordedChapter.value !== oldNum) {
    const readSeconds = Math.floor((now - chapterEnterTime.value) / 1000);
    if (readSeconds >= 20) {
      achievements.recordChapterRead(reader.book.id, oldNum, readSeconds);
      lastRecordedChapter.value = oldNum;
    }
  }
  chapterEnterTime.value = now;
});

watch(
  [() => reader.book?.id, () => reader.activeChapterNumber],
  ([bookId, chapterNumber]) => {
    void publicComic.load(bookId ?? '', chapterNumber);
  },
  { immediate: true },
);

// 沉浸阅读增强
const readingEnhance = useReadingEnhance({
  containerRef: bookArticleContentRef,
  onPrevPage: () => {
    if (reader.previousChapter) reader.selectChapter(reader.previousChapter.chapterNumber);
  },
  onNextPage: () => {
    if (reader.nextChapter) reader.selectChapter(reader.nextChapter.chapterNumber);
  },
});

// 滑动翻章手势
const bookAnnotationActive = computed(() =>
  readerAnnotations.actionBarVisible.value
  || readerAnnotations.annotationPanelVisible.value
  || readerAnnotations.shareCardViewerVisible.value,
);
const swipeNav = useSwipeNavigation({
  containerRef: bookArticleContentRef,
  onPrev: () => {
    if (reader.previousChapter) reader.selectChapter(reader.previousChapter.chapterNumber);
  },
  onNext: () => {
    if (reader.nextChapter) reader.selectChapter(reader.nextChapter.chapterNumber);
  },
  enabled: computed(() => !bookAnnotationActive.value),
});

// 划线模式（点击选中，解决微信等浏览器劫持长按的问题）
const tapSelect = useTapSelect({
  containerRef: bookArticleContentRef,
});

// 离线章节自动缓存
const chapterCache = useOfflineChapterCache();
const cachedChapterNumbers = ref<Set<number>>(new Set());

// 离线状态检测
const offlineIndicator = useOfflineIndicator();

watch(
  [() => reader.activeChapterSummary, () => reader.readingParagraphs],
  async ([summary, paragraphs]) => {
    if (!summary || !paragraphs.length) return;
    const novelId = reader.book?.novelId;
    const novelTitle = reader.book?.title ?? '书城作品';
    if (!novelId) return;
    try {
      await chapterCache.cacheChapter({
        novelId,
        novelTitle,
        chapterNumber: summary.chapterNumber,
        chapterTitle: summary.title,
        content: paragraphs,
        wordCount: paragraphs.reduce((s, p) => s + p.length, 0),
      });
      cachedChapterNumbers.value = new Set([...cachedChapterNumbers.value, summary.chapterNumber]);

      // 预缓存相邻章节
      if (!offlineIndicator.isOffline.value && reader.chapters.length > 0) {
        const sortedNumbers = [...reader.chapters]
          .map((c) => c.chapterNumber)
          .sort((a, b) => a - b);
        setTimeout(() => {
          void chapterCache.prefetchAdjacentChapters(
            async (cn) => {
              try {
                const mod = await import('../api/bookstore');
                const detail = await mod.getBookStorePublicChapterContent(reader.book?.id ?? '', cn);
                return detail ? { title: detail.title, content: detail.content } : null;
              } catch {
                return null;
              }
            },
            novelId,
            novelTitle,
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

// 离线回退：章节加载失败时尝试 IndexedDB
watch(
  [() => reader.currentChapter, () => reader.chapterLoading],
  async ([currentChapter, chapterLoading]) => {
    if (chapterLoading || currentChapter) return;
    // currentChapter 为 null 且不在加载中 → 可能网络失败
    const novelId = reader.book?.novelId;
    const chapterNumber = reader.activeChapterNumber;
    if (!novelId || chapterNumber == null) return;
    const cached = await chapterCache.getChapter(novelId, chapterNumber);
    if (cached && reader.activeChapterNumber === chapterNumber) {
      reader.currentChapter.value = {
        chapterNumber: cached.chapterNumber,
        title: cached.chapterTitle,
        content: cached.content.join('\n'),
        wordCount: cached.wordCount,
      };
    }
  },
);

watch(ttsPanelOpen, (open) => {
  if (open) return;
  reader.readerTTS.closeVoicePanel();
  reader.readerTTS.closePlaybackRatePanel();
});

function formatShortDate(value?: string): string {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function formatDateTime(value?: string): string {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="mobile-book-reader-page" :style="reader.pageStyle">
    <div class="mobile-book-reader-progress">
      <span :style="{ transform: `scaleX(${reader.scrollProgress / 100})` }"></span>
    </div>

    <header class="mobile-book-reader-topbar">
      <div class="mobile-book-reader-topbar__headline">
        <button class="mobile-book-reader-icon-btn" type="button" aria-label="返回书城" @click="reader.goBack">
          <el-icon :size="18"><ArrowLeft /></el-icon>
        </button>

        <div class="mobile-book-reader-topbar__copy">
          <strong>{{ reader.book?.title || '书城阅读' }}</strong>
          <span v-if="reader.activeChapterSummary">
            第 {{ reader.activeChapterSummary.chapterNumber }} 章 · {{ reader.activeChapterSummary.title }}
          </span>
          <span v-else>正在准备正文</span>
        </div>

        <div class="mobile-book-reader-topbar__actions">
          <button
            v-if="reader.book"
            class="mobile-book-reader-topbar__like"
            :class="{ 'is-active': reader.hasLiked }"
            type="button"
            :disabled="reader.liking"
            @click="reader.handleLike"
          >
            <el-icon :size="16"><StarFilled /></el-icon>
          </button>
          <button
            v-if="reader.book"
            class="mobile-book-reader-topbar__like mobile-book-reader-topbar__like--favorite"
            :class="{ 'is-active': reader.hasFavorited }"
            type="button"
            :disabled="reader.favoriting"
            @click="reader.handleFavorite"
          >
            <el-icon :size="16"><CollectionTag /></el-icon>
          </button>
          <button
            class="mobile-book-reader-theme-toggle mobile-book-reader-topbar__theme"
            :class="{ 'is-active': reader.isNightTheme }"
            type="button"
            :aria-label="reader.isNightTheme ? '切换开灯模式' : '切换关灯模式'"
            @click="reader.toggleNightMode"
          >
            <el-icon :size="18">
              <Sunny v-if="reader.isNightTheme" />
              <Moon v-else />
            </el-icon>
          </button>
        </div>
      </div>
    </header>

    <main class="mobile-book-reader-main">
      <section v-if="reader.loading" class="mobile-book-reader-shell mobile-book-reader-state">
        <el-skeleton animated :rows="12" />
      </section>

      <template v-else-if="reader.book">
        <ForkBanner :forked-from="forkedFromInfo" />
        <section class="mobile-book-reader-shell mobile-book-reader-bookbar">
          <div class="mobile-book-reader-bookbar__row">
            <div class="mobile-book-reader-meta mobile-book-reader-meta--bookbar">
              <span>{{ reader.book.category || '书城作品' }}</span>
              <span>{{ reader.catalogTotal || reader.book.publishedChapterCount || reader.chapters.length }} 章</span>
              <span>{{ reader.estimatedMinutes }} 分钟</span>
              <span>{{ reader.book.viewCount }} 阅读</span>
              <span v-if="authStore.commentEnabled">{{ reader.book.commentCount ?? 0 }} 评论</span>
            </div>
            <div class="mobile-book-reader-bookbar__actions">
              <button
                class="mobile-book-reader-like mobile-book-reader-like--compact"
                :class="{ 'is-active': reader.hasLiked }"
                type="button"
                :disabled="reader.liking"
                @click="reader.handleLike"
              >
                <el-icon :size="15"><StarFilled /></el-icon>
                {{ reader.book.likeCount }}
              </button>
              <button
                class="mobile-book-reader-like mobile-book-reader-like--compact mobile-book-reader-like--favorite"
                :class="{ 'is-active': reader.hasFavorited }"
                type="button"
                :disabled="reader.favoriting"
                @click="reader.handleFavorite"
              >
                <el-icon :size="15"><CollectionTag /></el-icon>
                {{ reader.book.favoriteCount ?? 0 }}
              </button>
            </div>
          </div>

          <button
            class="mobile-book-reader-synopsis__toggle mobile-book-reader-synopsis__toggle--compact"
            type="button"
            :aria-expanded="reader.synopsisExpanded"
            @click="reader.toggleSynopsis"
          >
            <div class="mobile-book-reader-synopsis__copy">
              <strong>简介</strong>
              <p>{{ reader.book.description?.trim() || '暂无作品简介。' }}</p>
            </div>
            <span>{{ reader.synopsisExpanded ? '收起' : '展开' }}</span>
          </button>

          <div v-if="reader.synopsisExpanded" class="mobile-book-reader-synopsis__body">
            <p>{{ reader.book.description?.trim() || '暂无作品简介。' }}</p>
          </div>
        </section>

        <transition name="mobile-book-reader-page-turn" mode="out-in">
          <article
            v-if="reader.activeChapterSummary"
            :key="`chapter-${reader.activeChapterNumber}`"
            class="mobile-book-reader-shell mobile-book-reader-article"
          >
            <header class="mobile-book-reader-article__header">
              <p class="mobile-book-reader-kicker">Chapter {{ reader.activeChapterSummary.chapterNumber }}</p>
              <h2>{{ reader.activeChapterSummary.title }}</h2>
              <div class="mobile-book-reader-article__meta">
                <span>{{ reader.currentWordCount.toLocaleString() }} 字</span>
                <span>约 {{ reader.estimatedMinutes }} 分钟</span>
                <span>{{ formatShortDate(reader.activeChapterSummary.updatedAt) }} 更新</span>
              </div>
              <button
                v-if="publicComic.manifest.value?.panels.length"
                type="button"
                class="mobile-book-reader-comic-entry"
                @click="publicComic.open"
              >
                <el-icon :size="16"><Picture /></el-icon>
                <span>漫画版</span>
                <small>{{ publicComic.manifest.value.panels.length }} 格</small>
              </button>
            </header>

            <div v-if="reader.chapterLoading" class="mobile-book-reader-state mobile-book-reader-state--inline">
              <el-skeleton animated :rows="10" />
            </div>

            <div v-else-if="reader.readingParagraphs.length" ref="bookArticleContentRef" class="mobile-book-reader-article__content" :style="{ transform: `translateX(${swipeNav.swipeOffsetX.value}px)`, transition: swipeNav.swipeOffsetX.value === 0 ? 'transform 0.28s ease-out' : 'none' }">
              <p
                v-for="(paragraph, index) in reader.readingParagraphs"
                :key="`${reader.activeChapterSummary.chapterNumber}-${index}`"
                :data-paragraph-index="index"
                :class="{ 'is-speaking': reader.readerTTS.activeParagraphIndex === index }"
              >
                <span
                  v-for="(seg, segIdx) in readerAnnotations.richParagraphs.value[index] || [{ text: paragraph, isHighlighted: false, annotationCount: 0 }]"
                  :key="segIdx"
                  :class="{ 'annotated-highlight': seg.isHighlighted }"
                  :data-annotation-id="seg.annotationId"
                  @click.stop="seg.isHighlighted && seg.annotationId ? readerAnnotations.handleAnnotationClick(seg.annotationId) : undefined"
                >{{ seg.text }}</span>
              </p>
              <MobilePlotVoteCard
                v-if="bookNovelId && bookChapterNumber"
                :novel-id="bookNovelId"
                :chapter-id="String(bookChapterNumber)"
              />
              <!-- 下集预告 -->
              <div
                v-if="reader.nextChapter && reader.nextChapter.outline?.summary"
                class="mobile-book-reader-next-preview"
              >
                <div class="mobile-book-reader-next-preview__head">
                  <el-icon :size="14"><MagicStick /></el-icon>
                  <span>下集预告</span>
                  <span class="mobile-book-reader-next-preview__chapter">
                    第{{ reader.nextChapter.chapterNumber }}章
                  </span>
                </div>
                <p class="mobile-book-reader-next-preview__title">
                  {{ reader.nextChapter.title || `第${reader.nextChapter.chapterNumber}章` }}
                </p>
                <p class="mobile-book-reader-next-preview__summary">
                  {{ reader.nextChapter.outline.summary }}
                </p>
                <button
                  class="mobile-book-reader-next-preview__cta"
                  type="button"
                  @click="reader.nextChapter && reader.selectChapter(reader.nextChapter.chapterNumber)"
                >
                  <span>直接翻到下一章</span>
                  <el-icon :size="14"><ArrowRight /></el-icon>
                </button>
              </div>
              <!-- 番外广场入口 -->
              <div v-if="bookNovelId" class="mobile-book-reader-side-story-entry">
                <button class="mobile-book-reader-side-story-btn" @click="sideStoryPlazaVisible = true">
                  <span class="mobile-book-reader-side-story-icon">🎬</span>
                  <span class="mobile-book-reader-side-story-text">番外广场</span>
                  <span class="mobile-book-reader-side-story-arrow">›</span>
                </button>
              </div>
              <!-- 抱走创作入口 -->
              <div v-if="bookNovelId && bookChapterNumber" class="mobile-book-reader-fork-entry">
                <button class="mobile-book-reader-fork-btn" @click="forkSheetVisible = true">
                  <span class="mobile-book-reader-fork-icon">🌿</span>
                  <span class="mobile-book-reader-fork-text">从这一章抱走，开启我的分支</span>
                  <span class="mobile-book-reader-fork-arrow">›</span>
                </button>
              </div>
            </div>

            <div v-else class="mobile-book-reader-state mobile-book-reader-state--inline">
              <strong>这一章暂时还没有正文</strong>
              <p>先切到其他章节继续阅读，或稍后再回来。</p>
            </div>
          </article>

          <section v-else key="empty-chapter" class="mobile-book-reader-shell mobile-book-reader-state">
            <strong>这本书暂时没有可读章节</strong>
            <p>目录还是空的，等作者放出正文后这里会直接打开阅读页。</p>
          </section>
        </transition>
      </template>

      <section v-else class="mobile-book-reader-shell mobile-book-reader-state">
        <strong>作品加载失败</strong>
        <p>可以返回书城重新点开，或者稍后再试。</p>
      </section>
    </main>

    <button
      v-if="reader.book && reader.readerTTS.showListenButton && !ttsPanelOpen"
      class="mobile-book-reader-tts-launcher"
      :class="{ 'is-active': reader.readerTTS.speaking || reader.readerTTS.paused }"
      type="button"
      @click="ttsPanelOpen = true"
    >
      <span class="mobile-book-reader-tts-launcher__title">听</span>
      <span class="mobile-book-reader-tts-launcher__meta">
        {{ reader.readerTTS.speaking ? '朗读中' : (reader.readerTTS.paused ? '已暂停' : '语音朗读') }}
      </span>
    </button>

    <MobileReaderTTSPanel
      v-if="reader.book"
      class="mobile-book-reader-tts-panel-host"
      :visible="ttsPanelOpen"
      :tts="reader.readerTTS"
      @close="ttsPanelOpen = false"
    />

    <footer
      class="mobile-book-reader-bottombar"
      :class="{
        'mobile-book-reader-bottombar--no-comments': !authStore.commentEnabled,
        'mobile-book-reader-bottombar--with-mailbox': authStore.isAuthenticated,
      }"
    >
      <button
        class="mobile-book-reader-bottombar__button mobile-book-reader-bottombar__button--icon"
        type="button"
        aria-label="上一章"
        :disabled="!reader.previousChapter"
        @click="reader.previousChapter && reader.selectChapter(reader.previousChapter.chapterNumber)"
      >
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <button
        class="mobile-book-reader-bottombar__button mobile-book-reader-bottombar__button--icon"
        type="button"
        aria-label="打开目录"
        @click="reader.openCatalog"
      >
        <el-icon :size="18"><List /></el-icon>
      </button>
      <button
        v-if="authStore.commentEnabled"
        class="mobile-book-reader-bottombar__button mobile-book-reader-bottombar__button--icon"
        type="button"
        aria-label="打开评论"
        @click="reader.openComments"
      >
        <el-icon :size="18"><ChatDotRound /></el-icon>
      </button>
      <button
        v-if="authStore.isAuthenticated"
        class="mobile-book-reader-bottombar__button mobile-book-reader-bottombar__button--icon"
        type="button"
        aria-label="角色信箱"
        @click="mailboxVisible = true"
      >
        <el-icon :size="18"><Promotion /></el-icon>
      </button>
      <button
        class="mobile-book-reader-bottombar__button mobile-book-reader-bottombar__button--icon"
        :class="{ 'mobile-book-reader-bottombar__button--active': tapSelect.selectMode.value }"
        type="button"
        :aria-label="tapSelect.selectMode.value ? '退出划线模式' : '划线模式'"
        @click="tapSelect.toggleSelectMode()"
      >
        <el-icon :size="18"><EditPen /></el-icon>
      </button>
      <button
        class="mobile-book-reader-bottombar__button mobile-book-reader-bottombar__button--icon"
        type="button"
        aria-label="阅读设置"
        @click="reader.openSettings"
      >
        <el-icon :size="18"><Setting /></el-icon>
      </button>
      <button
        class="mobile-book-reader-bottombar__button mobile-book-reader-bottombar__button--icon"
        type="button"
        aria-label="下一章"
        :disabled="!reader.nextChapter"
        @click="reader.nextChapter && reader.selectChapter(reader.nextChapter.chapterNumber)"
      >
        <el-icon :size="18"><ArrowRight /></el-icon>
      </button>
    </footer>

    <transition name="mobile-book-reader-overlay">
      <div
        v-if="reader.overlayVisible"
        class="mobile-book-reader-overlay"
        @click.self="reader.closeOverlays"
      >
        <section v-if="reader.catalogVisible" class="mobile-book-reader-panel mobile-book-reader-panel--catalog">
          <header class="mobile-book-reader-panel__header">
            <div class="mobile-book-reader-drawer__header">
              <strong>章节目录</strong>
              <span>{{ reader.book?.title || '当前作品' }}</span>
            </div>
            <button class="mobile-book-reader-icon-btn" type="button" aria-label="关闭目录" @click="reader.closeOverlays">
              <el-icon :size="16"><CloseBold /></el-icon>
            </button>
          </header>

          <div class="mobile-book-reader-panel__body">
            <section class="mobile-book-reader-drawer__summary">
              <div>
                <strong>进来就开读</strong>
                <p>{{ reader.book?.description?.trim() || '这本书的目录和正文都在这里，不再跳详情页。' }}</p>
              </div>
              <div class="mobile-book-reader-meta mobile-book-reader-meta--drawer">
                <span>{{ reader.catalogTotal || reader.book?.publishedChapterCount || reader.chapters.length }} 章</span>
                <span>{{ reader.book?.likeCount ?? 0 }} 喜欢</span>
                <span>{{ reader.book?.favoriteCount ?? 0 }} 收藏</span>
                <span v-if="authStore.commentEnabled">{{ reader.book?.commentCount ?? 0 }} 评论</span>
                <span>{{ reader.book?.viewCount ?? 0 }} 阅读</span>
              </div>
            </section>

            <div class="mobile-book-reader-catalog">
              <button
                v-for="chapter in reader.chapters"
                :key="chapter.chapterNumber"
                class="mobile-book-reader-catalog__item"
                :class="{ active: reader.activeChapterNumber === chapter.chapterNumber }"
                type="button"
                @click="reader.selectChapter(chapter.chapterNumber)"
              >
                <div class="mobile-book-reader-catalog__top">
                  <strong>第 {{ chapter.chapterNumber }} 章</strong>
                  <span v-if="cachedChapterNumbers.has(chapter.chapterNumber)" class="mobile-book-reader-catalog__cached-badge">已缓存</span>
                  <span>{{ formatShortDate(chapter.updatedAt) }}</span>
                </div>
                <p>{{ chapter.title }}</p>
                <small>{{ (chapter.wordCount ?? 0).toLocaleString() }} 字</small>
              </button>
              <button
                v-if="reader.catalogHasMore"
                class="mobile-book-reader-catalog__load-more"
                type="button"
                :disabled="reader.catalogLoading"
                @click="reader.loadMoreCatalog"
              >
                {{ reader.catalogLoading ? '正在加载...' : `继续加载章节（${reader.chapters.length}/${reader.catalogTotal}）` }}
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="authStore.commentEnabled && reader.commentsVisible" class="mobile-book-reader-panel mobile-book-reader-panel--comments">
          <header class="mobile-book-reader-panel__header">
            <div class="mobile-book-reader-drawer__header">
              <strong>读者评论</strong>
              <span>{{ reader.book?.title || '当前作品' }} · {{ reader.comments.length }}{{ reader.commentsTotal ? ` / ${reader.commentsTotal}` : '' }} 条</span>
            </div>
            <button class="mobile-book-reader-icon-btn" type="button" aria-label="关闭评论" @click="reader.closeOverlays">
              <el-icon :size="16"><CloseBold /></el-icon>
            </button>
          </header>

          <div class="mobile-book-reader-panel__body mobile-book-reader-comments">
            <section class="mobile-book-reader-comments__editor">
              <RealNameStatusBanner v-if="reader.showRealNameBanner" scene="comment" is-mobile compact />
              <el-input
                v-model="reader.commentDraft"
                type="textarea"
                :rows="3"
                maxlength="300"
                show-word-limit
                resize="none"
                placeholder="登录后可以发表评论"
              />
              <div class="mobile-book-reader-comments__editor-actions">
                <span>{{ authStore.user?.penName || authStore.user?.username || '游客' }}</span>
                <MobileGuestLoginButton v-if="authStore.authEnabled && !authStore.isAuthenticated" label="登录后评论" />
                <button v-else class="mobile-book-reader-comments__submit" type="button" @click="reader.handleSubmitComment">
                  {{ reader.commentSubmitting ? '发布中...' : '发布' }}
                </button>
              </div>
            </section>

            <div v-if="reader.commentsLoading" class="mobile-book-reader-state mobile-book-reader-state--inline">
              <el-skeleton animated :rows="6" />
            </div>

            <div v-else-if="reader.comments.length" class="mobile-book-reader-comments__list">
              <article
                v-for="comment in reader.comments"
                :id="`mobile-book-comment-${comment.id}`"
                :key="comment.id"
                class="mobile-book-reader-comment"
                :class="{ 'is-highlighted': reader.highlightedCommentId === comment.id }"
              >
                <div class="mobile-book-reader-comment__avatar">
                  <img v-if="safeImageUrl(comment.avatarUrl)" :src="safeImageUrl(comment.avatarUrl)" :alt="comment.authorName" />
                  <span v-else>{{ comment.authorName.charAt(0) }}</span>
                </div>
                <div class="mobile-book-reader-comment__body">
                  <div class="mobile-book-reader-comment__meta">
                    <div>
                      <strong>{{ comment.authorName }}</strong>
                      <span>@{{ comment.username }}</span>
                    </div>
                    <div class="mobile-book-reader-comment__side">
                      <time>{{ formatDateTime(comment.createdAt) }}</time>
                      <button
                        v-if="reader.canDeleteComment(comment)"
                        class="mobile-book-reader-comment__delete"
                        type="button"
                        @click="reader.handleDeleteComment(comment.id)"
                      >
                        {{ reader.deletingCommentId === comment.id ? '删除中...' : '删除' }}
                      </button>
                    </div>
                  </div>
                  <p>{{ comment.content }}</p>
                </div>
              </article>
              <button
                v-if="reader.commentsHasMore"
                class="mobile-focus-button--secondary"
                type="button"
                :disabled="reader.commentsLoading"
                @click="reader.loadMoreComments"
              >
                {{ reader.commentsLoading ? '正在加载...' : '继续加载评论' }}
              </button>
            </div>

            <div v-else class="mobile-book-reader-state mobile-book-reader-state--inline">
              <strong>还没有评论</strong>
              <p>这本书的第一条读者留言，可以由你来写。</p>
            </div>
          </div>
        </section>

        <section v-else-if="reader.settingsVisible" class="mobile-book-reader-panel mobile-book-reader-panel--settings">
          <header class="mobile-book-reader-panel__header">
            <div class="mobile-book-reader-drawer__header">
              <strong>阅读设置</strong>
              <span>适配手机单手阅读</span>
            </div>
            <button class="mobile-book-reader-icon-btn" type="button" aria-label="关闭设置" @click="reader.closeOverlays">
              <el-icon :size="16"><CloseBold /></el-icon>
            </button>
          </header>

          <div class="mobile-book-reader-panel__body mobile-book-reader-settings">
            <section class="mobile-book-reader-settings__group">
              <strong>主题</strong>
              <div class="mobile-book-reader-settings__row">
                <button
                  v-for="item in THEME_OPTIONS"
                  :key="item.value"
                  class="mobile-book-reader-settings__chip"
                  :class="{ active: reader.settings.theme === item.value }"
                  type="button"
                  @click="reader.settings.theme = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </section>

            <section class="mobile-book-reader-settings__group">
              <strong>字号</strong>
              <div class="mobile-book-reader-settings__row">
                <button
                  v-for="size in FONT_SIZE_OPTIONS"
                  :key="size"
                  class="mobile-book-reader-settings__chip"
                  :class="{ active: reader.settings.fontSize === size }"
                  type="button"
                  @click="reader.settings.fontSize = size"
                >
                  {{ size }}px
                </button>
              </div>
            </section>

            <section class="mobile-book-reader-settings__group">
              <strong>行距</strong>
              <div class="mobile-book-reader-settings__row">
                <button
                  v-for="height in LINE_HEIGHT_OPTIONS"
                  :key="height"
                  class="mobile-book-reader-settings__chip"
                  :class="{ active: reader.settings.lineHeight === height }"
                  type="button"
                  @click="reader.settings.lineHeight = height"
                >
                  {{ height }}
                </button>
              </div>
            </section>

            <section class="mobile-book-reader-settings__group">
              <strong>字体</strong>
              <div class="mobile-book-reader-settings__row">
                <button
                  v-for="font in FONT_FAMILY_OPTIONS"
                  :key="font.value"
                  class="mobile-book-reader-settings__chip"
                  :class="{ active: reader.settings.fontFamily === font.value }"
                  type="button"
                  :style="{ fontFamily: font.stack }"
                  @click="reader.settings.fontFamily = font.value"
                >
                  {{ font.label }}
                </button>
              </div>
            </section>

            <section class="mobile-book-reader-settings__group">
              <strong>字重</strong>
              <div class="mobile-book-reader-settings__row">
                <button
                  v-for="weight in FONT_WEIGHT_OPTIONS"
                  :key="weight"
                  class="mobile-book-reader-settings__chip"
                  :class="{ active: reader.settings.fontWeight === weight }"
                  type="button"
                  :style="{ fontWeight: weight }"
                  @click="reader.settings.fontWeight = weight"
                >
                  {{ weight === 400 ? '常规' : weight === 500 ? '中等' : '加粗' }}
                </button>
              </div>
            </section>

            <!-- 阅读工具 -->
            <section class="mobile-book-reader-settings__group">
              <strong>阅具</strong>
              <div class="mobile-book-reader-settings__row mobile-book-reader-settings__tools">
                <button
                  class="mobile-book-reader-settings__chip"
                  :class="{ active: readingEnhance.autoScrollActive.value }"
                  type="button"
                  @click="readingEnhance.toggleAutoScroll"
                >
                  {{ readingEnhance.autoScrollActive.value ? '⏸ 滚屏中' : '▶ 自动滚屏' }}
                </button>
                <div v-if="readingEnhance.autoScrollActive.value" style="display:flex;align-items:center;gap:4px">
                  <input type="range" min="1" max="10" :value="readingEnhance.autoScrollSpeed.value" @input="readingEnhance.autoScrollSpeed.value = Number(($event.target as HTMLInputElement).value)" style="width:50px" />
                  <span style="font-size:11px">{{ readingEnhance.autoScrollSpeed.value }}</span>
                </div>
                <button
                  class="mobile-book-reader-settings__chip"
                  :class="{ active: readingEnhance.volumeKeysEnabled.value }"
                  type="button"
                  @click="readingEnhance.toggleVolumeKeys"
                >
                  {{ readingEnhance.volumeKeysEnabled.value ? '🔊 音量键' : '🔈 音量键' }}
                </button>
              </div>
              <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--nw-text-muted,#64748b)">
                <span>⏱ {{ readingEnhance.formattedTime.value }}</span>
                <span>📖 {{ readingEnhance.readingSpeed.value }} 字/分</span>
                <span>📊 {{ readingEnhance.wordsRead.value.toLocaleString() }} 字</span>
              </div>
              <div style="margin-top:4px;display:flex;gap:6px">
                <button
                  style="font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--nw-border,rgba(203,213,225,0.6));background:var(--nw-bg-hover,rgba(99,102,241,0.08));color:var(--nw-text-primary,#0f172a);cursor:pointer"
                  @click="readingEnhance.focusActive.value ? readingEnhance.stopFocus() : readingEnhance.startFocus()"
                >
                  {{ readingEnhance.focusActive.value ? '⏸ 暂停专注' : '⏱ 开始专注' }}
                </button>
                <button
                  v-if="readingEnhance.formattedTime.value !== '00:00'"
                  style="font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid var(--nw-border,rgba(203,213,225,0.6));background:var(--nw-bg-hover,rgba(99,102,241,0.08));color:var(--nw-text-primary,#0f172a);cursor:pointer"
                  @click="readingEnhance.resetFocus"
                >
                  重置
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </transition>

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
      :novel-id="bookNovelId"
      @close="mailboxVisible = false"
      @open-chat="openCharacterChat"
      @open-moments="momentsVisible = true"
    />
    <CharacterMoments
      :visible="momentsVisible"
      :novel-id="bookNovelId"
      @close="momentsVisible = false"
    />
    <CharacterChatSheet
      :visible="chatVisible"
      :novel-id="bookNovelId"
      :character-id="chatCharacter?.id || ''"
      :character-name="chatCharacter?.name || ''"
      :character-portrait="chatCharacter?.portraitImagePath ? `/api/novels/${bookNovelId}/characters/${chatCharacter.id}/portrait?w=200` : ''"
      :chapter-info="chatCharacter?.currentState || ''"
      @close="chatVisible = false"
    />
    <SideStoryPlaza
      :visible="sideStoryPlazaVisible"
      :novel-id="bookNovelId"
      @close="sideStoryPlazaVisible = false"
      @open-reader="(id: string) => { sideStoryReaderId = id; sideStoryReaderVisible = true; }"
      @open-generate="() => { sideStoryPlazaVisible = false; sideStoryGenVisible = true; }"
    />
    <SideStoryGenerateSheet
      :visible="sideStoryGenVisible"
      :novel-id="bookNovelId"
      @close="sideStoryGenVisible = false"
      @generated="() => { sideStoryGenVisible = false; sideStoryPlazaVisible = true; }"
    />
    <SideStoryReader
      :visible="sideStoryReaderVisible"
      :story-id="sideStoryReaderId"
      @close="sideStoryReaderVisible = false"
      @deleted="() => { sideStoryReaderVisible = false; sideStoryPlazaVisible = true; }"
    />
    <ForkConfirmSheet
      :visible="forkSheetVisible"
      :novel-id="bookNovelId"
      :novel-title="reader.book?.title ?? ''"
      :chapter="bookChapterNumber ?? 1"
      @close="forkSheetVisible = false"
      @forked="() => { forkSheetVisible = false; }"
    />
    <MobileBookComicViewer
      v-model:visible="publicComic.visible.value"
      :book-id="reader.book?.id ?? ''"
      :manifest="publicComic.manifest.value"
    />
  </div>
</template>

<style scoped src="../styles/mobile-book-reader.css"></style>

<style scoped>
/* 注入书城阅读器主题变量到共用听书面板组件 */
.mobile-book-reader-tts-panel-host {
  --rtts-text: var(--reader-text-color);
  --rtts-muted: var(--reader-muted-color);
  --rtts-line: var(--reader-line-color);
  --rtts-surface: var(--reader-paper-background);
  --rtts-paper: var(--reader-paper-background);
  --rtts-accent-from: var(--star-brand-sky, #f97316);
  --rtts-accent-to: var(--star-brand-teal, #fb7185);
  --rtts-accent-from-soft: color-mix(in srgb, var(--star-brand-sky, #f97316) 14%, transparent);
  --rtts-accent-to-soft: color-mix(in srgb, var(--star-brand-teal, #fb7185) 10%, transparent);
  --rtts-accent-line: color-mix(in srgb, var(--star-brand-sky, #f97316) 55%, var(--reader-line-color));
  --rtts-panel-width: min(calc(100% - 24px), 480px);
  --rtts-z: 24;
}

/* 下集预告 */
.mobile-book-reader-next-preview {
  --next-preview-surface-from: color-mix(in srgb, var(--star-brand-sky, #f97316) 8%, #fff7ed);
  --next-preview-surface-to: color-mix(in srgb, var(--star-brand-sky, #f97316) 12%, #ffedd5);
  --next-preview-accent-soft: color-mix(in srgb, var(--star-brand-sky, #f97316) 8%, transparent);
  --next-preview-accent: var(--star-brand-sky, #f97316);
  --next-preview-text-strong: color-mix(in srgb, var(--star-brand-sky, #c2410c) 80%, #7c2d12);
  --next-preview-text: color-mix(in srgb, var(--star-brand-sky, #7c2d12) 70%, #78350f);
  --next-preview-text-muted: color-mix(in srgb, var(--star-brand-sky, #78350f) 60%, #9a3412);
  --next-preview-cta-bg: var(--star-brand-sky, #f97316);
  --next-preview-cta-text: #fff;
  margin-top: 20px;
  padding: 16px 18px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--next-preview-surface-from), var(--next-preview-surface-to));
  position: relative;
  overflow: hidden;
}

.mobile-book-reader-next-preview::before {
  content: '';
  position: absolute;
  top: -20px;
  right: -20px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--next-preview-accent-soft);
}

.mobile-book-reader-next-preview__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--next-preview-text-strong);
  margin-bottom: 8px;
  position: relative;
}

.mobile-book-reader-next-preview__chapter {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--next-preview-text-muted);
  opacity: 0.7;
}

.mobile-book-reader-next-preview__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--next-preview-text);
  margin: 0 0 8px 0;
  line-height: 1.4;
  position: relative;
}

.mobile-book-reader-next-preview__summary {
  font-size: 13px;
  line-height: 1.7;
  color: var(--next-preview-text);
  margin: 0 0 14px 0;
  opacity: 0.85;
  position: relative;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mobile-book-reader-next-preview__cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--next-preview-cta-bg);
  color: var(--next-preview-cta-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.1s;
  position: relative;
}

.mobile-book-reader-next-preview__cta:active {
  transform: scale(0.98);
}

/* 番外广场入口 */
.mobile-book-reader-side-story-entry {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.mobile-book-reader-side-story-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  cursor: pointer;
  transition: transform 0.1s;
}

.mobile-book-reader-side-story-btn:active {
  transform: scale(0.98);
}

.mobile-book-reader-side-story-icon {
  font-size: 22px;
}

.mobile-book-reader-side-story-text {
  flex: 1;
  text-align: left;
  font-size: 15px;
  font-weight: 600;
  color: #4f46e5;
}

.mobile-book-reader-side-story-arrow {
  font-size: 20px;
  color: #a5b4fc;
}

/* 抱走创作入口 */
.mobile-book-reader-fork-entry {
  margin-top: 12px;
}

.mobile-book-reader-fork-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #d1fae5, #a7f3d0);
  cursor: pointer;
  transition: transform 0.1s;
}

.mobile-book-reader-fork-btn:active {
  transform: scale(0.98);
}

.mobile-book-reader-fork-icon {
  font-size: 22px;
}

.mobile-book-reader-fork-text {
  flex: 1;
  text-align: left;
  font-size: 15px;
  font-weight: 600;
  color: #047857;
}

.mobile-book-reader-fork-arrow {
  font-size: 20px;
  color: #6ee7b7;
}

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
</style>
