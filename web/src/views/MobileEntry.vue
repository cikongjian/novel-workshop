<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { resolveCoverSrc } from '../utils/deploy-path';
import { ArrowRight, CollectionTag, RefreshRight, Search, Star, View } from '@element-plus/icons-vue';
import LandingFooterCompact from '../components/landing/LandingFooterCompact.vue';
import { getBookStoreList } from '../api/bookstore';
import type { BookStoreSort } from '../api/types';
import { useHomepagePublicData } from '../composables/useHomepagePublicData';
import { useThemeMode } from '../composables/useThemeMode';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useAsyncData } from '../composables/useAsyncData';
import { useAuthStore } from '../stores/auth';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { formatBookWordCount, formatPublishedChapterText } from '../utils/bookstore-display';
import { BOOKSTORE_SORT_OPTIONS, getBookStoreSortLabel } from '../utils/bookstore-sort';
import LazyImage from '../components/shared/LazyImage.vue';
import { brand } from '../config/brand';

type RawBook = {
  id: string;
  novelId?: string;
  title?: string;
  authorName?: string;
  introduction?: string;
  description?: string;
  category?: string;
  tags?: string[];
  coverUrl?: string;
  cover?: string;
  publishStatus?: string;
  viewCount?: number;
  likeCount?: number;
  favoriteCount?: number;
  chapterCount?: number;
  wordCount?: number;
  publishedChapterCount?: number;
  publishedWordCount?: number;
  publishedChapters?: unknown[];
  publishTime?: string;
};

type MobileBook = {
  id: string;
  title: string;
  authorName: string;
  introduction: string;
  category: string;
  coverUrl: string;
  publishStatus: string;
  viewCount: number;
  likeCount: number;
  favoriteCount: number;
  chapterCount: number;
  wordCount: number;
  publishTime: string;
};

const CATEGORY_OPTIONS = [
  { value: '', label: '全部' },
  { value: '玄幻', label: '玄幻' },
  { value: '都市', label: '都市' },
  { value: '历史', label: '历史' },
  { value: '科幻', label: '科幻' },
  { value: '武侠', label: '武侠' },
  { value: '仙侠', label: '仙侠' },
] as const;

const router = useRouter();
const authStore = useAuthStore();
const { homepage } = useHomepagePublicData();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const loadingMore = ref(false);
const books = ref<MobileBook[]>([]);
const total = ref(0);
const page = ref(1);
const searchText = ref('');
const keyword = ref('');
const activeCategory = ref('');
const activeSort = ref<BookStoreSort>('updated');
const followDefaultSort = ref(true);

const { run: runSearch, abort: abortSearch } = useAsyncData(
  async (signal, reset: boolean) => {
    const nextPage = reset ? 1 : page.value;
    const response = await getBookStoreList({
      page: nextPage,
      pageSize: 8,
      category: activeCategory.value || undefined,
      keyword: keyword.value || undefined,
      sort: followDefaultSort.value ? undefined : activeSort.value,
    }, { signal });

    const mapped = (response.items as unknown as RawBook[]).map(normalizeBook);
    total.value = response.total;
    page.value = response.page;
    if (followDefaultSort.value) {
      activeSort.value = response.appliedSort;
    }

    if (reset) {
      books.value = mapped;
    } else {
      mergeBooks(mapped);
    }

    return mapped;
  },
);

const activeSortLabel = computed(() => getBookStoreSortLabel(activeSort.value, 'short'));
const isGuestMode = computed(() => authStore.initialized && !authStore.isAuthenticated);
const featuredBook = computed(() => books.value[0] ?? null);
const visibleBooks = computed(() => books.value.slice(featuredBook.value ? 1 : 0));
const hasMore = computed(() => books.value.length < total.value);

function normalizeBook(item: RawBook): MobileBook {
  return {
    id: item.id,
    title: item.title?.trim() || '未命名作品',
    authorName: item.authorName?.trim() || brand.displayName,
    introduction: item.introduction?.trim() || item.description?.trim() || '这本书暂时还没有简介。',
    category: item.category?.trim() || '未分类',
    coverUrl: item.coverUrl?.trim() || item.cover?.trim() || '',
    publishStatus: item.publishStatus?.trim() || 'ongoing',
    viewCount: Number(item.viewCount) || 0,
    likeCount: Number(item.likeCount) || 0,
    favoriteCount: Number(item.favoriteCount) || 0,
    chapterCount:
      Number(item.publishedChapterCount)
      || (item.chapterCount != null ? Number(item.chapterCount) : 0)
      || (Array.isArray(item.publishedChapters) ? item.publishedChapters.length : 0),
    wordCount: Number(item.publishedWordCount) || Number(item.wordCount) || 0,
    publishTime: item.publishTime || '',
  };
}

function mergeBooks(next: MobileBook[]) {
  const merged = new Map<string, MobileBook>();
  for (const book of [...books.value, ...next]) {
    merged.set(book.id, book);
  }
  books.value = [...merged.values()];
}

function formatCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(value);
}

function formatRank(value: number): string {
  return String(value).padStart(2, '0');
}

function formatPublishTime(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '刚刚上架';
  const diff = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return '今日上架';
  if (diff < 7 * day) return `${Math.max(1, Math.floor(diff / day))} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function getStatusText(status: string): string {
  if (status === 'approved' || status === 'ongoing') return '连载中';
  if (status === 'completed') return '已完结';
  if (status === 'pending') return '待发布';
  return '更新中';
}

function openBook(bookId: string) {
  void router.push(`/m/bookstore/${bookId}`);
}

async function loadBooks(reset = false) {
  if (reset) {
    loading.value = true;
    abortSearch();
  } else {
    loadingMore.value = true;
  }

  try {
    await runSearch(reset);
  } catch (error: any) {
    if (reset) books.value = [];
    if (error?.code !== 'ERR_CANCELED') {
      ElMessage.error(error?.response?.data?.error || '加载书城失败');
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function applyFilters() {
  keyword.value = searchText.value.trim();
  page.value = 1;
  void loadBooks(true);
}

function changeCategory(value: string) {
  if (activeCategory.value === value) return;
  activeCategory.value = value;
  page.value = 1;
  void loadBooks(true);
}

function changeSort(value: BookStoreSort) {
  if (!followDefaultSort.value && activeSort.value === value) return;
  followDefaultSort.value = false;
  activeSort.value = value;
  page.value = 1;
  void loadBooks(true);
}

function loadMore() {
  if (!hasMore.value || loadingMore.value) return;
  page.value += 1;
  void loadBooks(false);
}

function navigateToLogin() {
  void router.push('/m/login');
}

onMounted(() => {
  void loadBooks(true);
});

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: () => loadBooks(true),
});
</script>

<template>
  <div ref="pullContainerRef" class="mobile-entry-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div
      class="mobile-focus-pull-indicator"
      :class="{
        'mobile-focus-pull-indicator--visible': pullDistance > 0,
        'mobile-focus-pull-indicator--triggered': triggered,
        'mobile-focus-pull-indicator--refreshing': refreshing,
      }"
      :style="{ '--pull-offset': pullDistance > 0 || refreshing ? '0px' : '-60px' }"
    >
      <span v-if="refreshing" class="mobile-focus-pull-spinner" />
      <span v-else class="mobile-focus-pull-arrow">↓</span>
      <span>{{ refreshing ? '刷新中...' : triggered ? '松手刷新' : '下拉刷新' }}</span>
    </div>
    <div class="mobile-focus-shell">
      <main class="mobile-entry-main mobile-focus-main">
        <section class="mobile-entry-deck">
          <div class="mobile-entry-deck__brand">
            <div class="mobile-entry-deck__brand-copy">
              <strong>{{ brand.displayName }} 书城</strong>
            </div>
            <button
              v-if="isGuestMode"
              class="mobile-entry-deck__brand-action"
              type="button"
              @click="navigateToLogin"
            >
              登录
            </button>
          </div>

          <section class="mobile-entry-searchbar">
            <label class="mobile-entry-search">
              <el-icon :size="16"><Search /></el-icon>
              <input
                v-model="searchText"
                class="mobile-entry-search__input"
                type="text"
                placeholder="搜书名 / 作者 / 热门题材"
                @keyup.enter="applyFilters"
              />
            </label>
            <div class="mobile-entry-searchbar__actions">
              <button class="mobile-entry-searchbar__submit" type="button" @click="applyFilters">开找</button>
              <button class="mobile-entry-searchbar__refresh" type="button" aria-label="刷新书单" @click="loadBooks(true)">
                <el-icon :size="14"><RefreshRight /></el-icon>
              </button>
            </div>
          </section>

          <section class="mobile-entry-toolbar">
            <div class="mobile-entry-toolbar__chips">
              <button
                v-for="item in CATEGORY_OPTIONS"
                :key="item.value || 'all'"
                class="mobile-entry-toolbar__chip"
                :class="{ active: activeCategory === item.value }"
                type="button"
                @click="changeCategory(item.value)"
              >
                {{ item.label }}
              </button>
            </div>

            <div class="mobile-entry-sort">
              <button
                v-for="item in BOOKSTORE_SORT_OPTIONS"
                :key="item.value"
                class="mobile-entry-sort__button"
                :class="{ active: activeSort === item.value }"
                type="button"
                @click="changeSort(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </section>
        </section>

        <section v-if="featuredBook" class="mobile-entry-spotlight">
          <button class="mobile-entry-featured" type="button" @click="openBook(featuredBook.id)">
            <div class="mobile-entry-featured__cover">
              <LazyImage
                v-if="featuredBook.coverUrl"
                :src="resolveCoverSrc(featuredBook.coverUrl)"
                :alt="featuredBook.title"
                :fallback-text="featuredBook.title"
                aspect-ratio="6/8"
                loading="eager"
              />
              <div v-else class="mobile-entry-featured__fallback">
                <span>{{ featuredBook.title.charAt(0) }}</span>
              </div>
            </div>

            <div class="mobile-entry-featured__content">
              <div class="mobile-entry-featured__eyebrow">
                <span class="mobile-entry-rank mobile-entry-rank--featured">{{ formatRank(1) }}</span>
                <span class="mobile-entry-featured__label">{{ activeSortLabel }}优先看</span>
              </div>

              <div class="mobile-entry-featured__copy">
                <strong>{{ featuredBook.title }}</strong>
                <span>{{ featuredBook.authorName }}</span>
                <p>{{ featuredBook.introduction }}</p>
              </div>

              <div class="mobile-entry-featured__footer">
                <div class="mobile-focus-meta mobile-entry-featured__chips">
                  <span class="mobile-focus-tag mobile-focus-tag--gold">{{ featuredBook.category }}</span>
                  <span class="mobile-focus-tag mobile-focus-tag--ink">{{ getStatusText(featuredBook.publishStatus) }}</span>
                  <span class="mobile-focus-tag mobile-focus-tag--sky">{{ formatPublishTime(featuredBook.publishTime) }}</span>
                </div>

                <div class="mobile-entry-featured__stats">
                  <span><el-icon><View /></el-icon>{{ formatCount(featuredBook.viewCount) }}</span>
                  <span><el-icon><Star /></el-icon>{{ formatCount(featuredBook.likeCount) }}</span>
                  <span><el-icon><CollectionTag /></el-icon>{{ formatCount(featuredBook.favoriteCount) }}</span>
                  <span>{{ formatPublishedChapterText(featuredBook.chapterCount) }}</span>
                  <span>{{ formatBookWordCount(featuredBook.wordCount) }}</span>
                </div>

                <span class="mobile-entry-featured__action">
                  立即开看
                  <el-icon :size="14"><ArrowRight /></el-icon>
                </span>
              </div>
            </div>
          </button>
        </section>

        <section v-if="loading || visibleBooks.length || !featuredBook" class="mobile-entry-list-section">
          <div v-if="loading" class="mobile-focus-loading">
            <el-skeleton animated :rows="6" />
          </div>

          <div v-else-if="visibleBooks.length" class="mobile-entry-grid">
            <button
              v-for="(book, index) in visibleBooks"
              :key="book.id"
              class="mobile-entry-grid-card"
              type="button"
              @click="openBook(book.id)"
            >
              <div class="mobile-entry-grid-card__cover">
                <span class="mobile-entry-rank">{{ formatRank(index + 2) }}</span>
                <LazyImage
                  v-if="book.coverUrl"
                  :src="resolveCoverSrc(book.coverUrl)"
                  :alt="book.title"
                  :fallback-text="book.title"
                  aspect-ratio="6/8"
                />
                <div v-else class="mobile-entry-grid-card__fallback">
                  <span>{{ book.title.charAt(0) }}</span>
                </div>
              </div>

              <div class="mobile-entry-grid-card__content">
                <div class="mobile-entry-grid-card__top">
                  <strong>{{ book.title }}</strong>
                  <span>{{ book.category }}</span>
                </div>
                <p>{{ book.authorName }}</p>
                <div class="mobile-entry-grid-card__meta">
                  <span><el-icon><View /></el-icon>{{ formatCount(book.viewCount) }}</span>
                  <span><el-icon><CollectionTag /></el-icon>{{ formatCount(book.favoriteCount) }}</span>
                  <span>{{ formatPublishedChapterText(book.chapterCount) }}</span>
                </div>
              </div>
            </button>
          </div>

          <div v-else class="mobile-focus-empty">
            <strong>这一栏暂时还没刷到想看的</strong>
            <p>换个题材、作者名，下一本可能就中了。</p>
            <button class="mobile-focus-button--primary" type="button" @click="changeCategory('')">
              回到全站
            </button>
          </div>

          <button
            v-if="!loading && hasMore"
            class="mobile-entry-loadmore"
            type="button"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? '继续上新中...' : '继续刷下一批' }}
          </button>
        </section>

        <section class="mobile-entry-footer-stack">
          <LandingFooterCompact class="mobile-entry-filing-footer" :footer="homepage.footer" />
        </section>
      </main>
    </div>

    <MobileWorkbenchDock />
  </div>
</template>

<style scoped>
.mobile-entry-page {
  --mobile-focus-accent: #f59e0b;
  --mobile-focus-accent-strong: var(--star-brand-sky, #38bdf8);
  --mobile-focus-tint: rgba(245, 158, 11, 0.14);
  --me-deck-border: color-mix(in srgb, var(--star-brand-sky, #7dd3fc) 14%, var(--nw-border, transparent));
  --me-deck-bg: var(--nw-glass, rgba(7, 16, 30, 0.82));
  --me-deck-shadow: var(--nw-shadow-lg, rgba(2, 8, 23, 0.28));
  --me-search-border: color-mix(in srgb, var(--star-brand-sky, #7dd3fc) 10%, var(--nw-border, transparent));
  --me-search-bg: color-mix(in srgb, var(--nw-text-primary) 8%, var(--nw-bg-secondary));
  --me-search-color: var(--nw-text-secondary, rgba(226, 232, 240, 0.78));
  --me-search-placeholder: var(--nw-text-muted, rgba(148, 163, 184, 0.76));
  --me-refresh-bg: color-mix(in srgb, var(--nw-text-primary) 10%, var(--nw-bg-secondary));
  --me-chip-color: var(--nw-text-secondary, rgba(226, 232, 240, 0.72));
  --me-chip-active-border: color-mix(in srgb, var(--star-brand-sky, #38bdf8) 24%, var(--nw-border, transparent));
  --me-chip-active-bg: color-mix(in srgb, var(--star-brand-sky, #38bdf8) 16%, var(--nw-bg-secondary));
  --me-chip-active-color: var(--star-brand-sky, #e0f2fe);
  --me-sort-color: var(--nw-text-muted, rgba(203, 213, 225, 0.74));
  --me-featured-border: color-mix(in srgb, var(--star-brand-sky, #7dd3fc) 12%, var(--nw-border, transparent));
  --me-featured-bg-from: var(--nw-bg-card, rgba(15, 23, 42, 0.82));
  --me-featured-bg-to: color-mix(in srgb, var(--nw-bg-card) 90%, var(--nw-bg-secondary));
  --me-featured-shadow: var(--nw-shadow-md, rgba(2, 8, 23, 0.2));
  --me-featured-cover: linear-gradient(160deg, color-mix(in srgb, var(--star-brand-sky, #172033) 35%, var(--nw-bg-secondary)) 0%, color-mix(in srgb, var(--star-brand-sky, #32486b) 55%, var(--nw-bg-secondary)) 100%);
  --me-card-border: color-mix(in srgb, var(--star-brand-sky, #7dd3fc) 14%, var(--nw-border, transparent));
  --me-card-bg-from: var(--nw-bg-card, rgba(15, 23, 42, 0.82));
  --me-card-bg-to: color-mix(in srgb, var(--nw-bg-card) 90%, var(--nw-bg-secondary));
  --me-card-shadow: var(--nw-shadow-md, rgba(2, 8, 23, 0.2));
  --me-title-color: var(--nw-text-primary, #f8fafc);
  --me-author-color: var(--nw-text-secondary, rgba(226, 232, 240, 0.72));
  --me-desc-color: var(--nw-text-secondary, rgba(226, 232, 240, 0.82));
  --me-meta-bg: color-mix(in srgb, var(--nw-text-primary) 12%, var(--nw-bg-secondary));
  --me-meta-color: var(--nw-text-secondary, rgba(226, 232, 240, 0.86));
  --me-loadmore-bg: color-mix(in srgb, var(--nw-text-primary) 10%, var(--nw-bg-secondary));
  --me-loadmore-color: var(--nw-text-secondary, rgba(226, 232, 240, 0.82));
  --me-grid-cover-bg: linear-gradient(160deg, color-mix(in srgb, var(--star-brand-sky, #172033) 35%, var(--nw-bg-secondary)) 0%, color-mix(in srgb, var(--star-brand-sky, #2c4468) 55%, var(--nw-bg-secondary)) 100%);
  --me-fallback-bg: rgba(255, 255, 255, 0.12);
  --me-fallback-color: var(--nw-text-primary, #fff7ed);
  --me-label-color: #fbbf24;
  --me-link-color: #fde68a;
  background: var(--mobile-focus-page-bg);
  color-scheme: dark;
}

.mobile-entry-main {
  gap: 14px;
  padding-bottom: 16px;
}

.mobile-entry-deck {
  position: sticky;
  top: calc(env(safe-area-inset-top, 0px) + 8px);
  z-index: 14;
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--me-deck-border);
  border-radius: 22px;
  background: var(--me-deck-bg);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 36px var(--me-deck-shadow);
  will-change: transform;
}

.mobile-entry-deck__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-entry-deck__brand-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.mobile-entry-deck__brand-copy strong {
  color: var(--me-title-color);
  font-size: 16px;
  font-weight: 800;
}

.mobile-entry-deck__brand-action {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.12);
  color: #fde68a;
  font-size: 12px;
  font-weight: 700;
  touch-action: manipulation;
  transform: translateZ(0);
}

.mobile-entry-searchbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding-top: 2px;
}

.mobile-entry-searchbar__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.mobile-entry-searchbar__submit {
  min-width: 70px;
  min-height: 42px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #f59e0b, #fb7185);
  color: #fff7ed;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 10px 22px rgba(245, 158, 11, 0.22);
}

.mobile-entry-searchbar__refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  min-height: 42px;
  padding: 0;
  border: 0;
  border-radius: 14px;
  background: var(--me-refresh-bg);
  color: var(--me-search-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nw-text-primary) 8%, var(--nw-bg-secondary));
}

.mobile-entry-deck__brand-action:active,
.mobile-entry-searchbar__submit:active,
.mobile-entry-searchbar__refresh:active {
  filter: brightness(1.12);
}

.mobile-entry-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 13px;
  border-radius: 14px;
  border: 1px solid var(--me-search-border);
  background: var(--me-search-bg);
  color: var(--me-search-color);
}

.mobile-entry-search__input {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--me-title-color);
  font: inherit;
}

.mobile-entry-search__input::placeholder {
  color: var(--me-search-placeholder);
}

.mobile-entry-search__input:focus {
  outline: none;
}

.mobile-entry-toolbar {
  display: grid;
  gap: 8px;
}

.mobile-entry-toolbar__chips,
.mobile-entry-sort {
  display: flex;
  gap: 8px 14px;
  overflow-x: auto;
  scrollbar-width: none;
}

.mobile-entry-toolbar__chips::-webkit-scrollbar,
.mobile-entry-sort::-webkit-scrollbar {
  display: none;
}

.mobile-entry-toolbar__chip {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--me-chip-color);
  font-size: 12px;
  font-weight: 700;
}

.mobile-entry-toolbar__chip.active {
  border-color: var(--me-chip-active-border);
  background: var(--me-chip-active-bg);
  color: var(--me-chip-active-color);
}

.mobile-entry-sort__button,
.mobile-entry-loadmore {
  border: 0;
  font-size: 13px;
  font-weight: 700;
}

.mobile-entry-sort__button {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 0 8px;
  border-radius: 0;
  background: transparent;
  color: var(--me-sort-color);
  box-shadow: inset 0 -1px 0 transparent;
}

.mobile-entry-sort__button.active {
  color: var(--me-title-color);
  box-shadow: inset 0 -2px 0 rgba(250, 204, 21, 0.9);
}

.mobile-entry-spotlight,
.mobile-entry-list-section,
.mobile-entry-footer-stack {
  display: grid;
  gap: 12px;
}

.mobile-entry-featured {
  display: grid;
  grid-template-columns: clamp(112px, 28vw, 132px) minmax(0, 1fr);
  gap: 14px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--me-featured-border);
  border-radius: 22px;
  background: linear-gradient(180deg, var(--me-featured-bg-from), var(--me-featured-bg-to));
  text-align: left;
  box-shadow: 0 10px 24px var(--me-featured-shadow);
}

.mobile-entry-featured__cover {
  width: 100%;
  aspect-ratio: 6 / 8;
  overflow: hidden;
  align-self: start;
  border-radius: 16px;
  background: var(--me-featured-cover);
}

.mobile-entry-featured__cover img,
.mobile-entry-featured__cover :deep(.lazy-image-wrapper),
.mobile-entry-featured__fallback {
  display: block;
  width: 100%;
  height: 100%;
}

.mobile-entry-featured__cover img {
  object-fit: cover;
}

.mobile-entry-featured__fallback,
.mobile-entry-grid-card__fallback {
  display: grid;
  place-items: center;
}

.mobile-entry-featured__fallback span,
.mobile-entry-grid-card__fallback span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--me-fallback-bg);
  color: var(--me-fallback-color);
  font-size: 22px;
  font-weight: 800;
}

.mobile-entry-featured__content,
.mobile-entry-featured__copy {
  display: grid;
  gap: 6px;
}

.mobile-entry-featured__content {
  align-content: space-between;
  gap: 10px;
}

.mobile-entry-featured__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mobile-entry-featured__label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--me-label-color);
}

.mobile-entry-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f59e0b, #fb7185);
  color: white;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(245, 158, 11, 0.26);
}

.mobile-entry-rank--featured {
  min-width: 34px;
  height: 30px;
}

.mobile-entry-featured__copy strong {
  color: var(--me-title-color);
  font-size: 17px;
  line-height: 1.22;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mobile-entry-featured__copy span,
.mobile-entry-grid-card__top span,
.mobile-entry-grid-card__content p {
  color: var(--me-author-color);
  font-size: 12px;
}

.mobile-entry-featured__copy p {
  margin: 0;
  color: var(--me-desc-color);
  font-size: 12px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mobile-entry-featured__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.mobile-entry-featured__chips,
.mobile-entry-featured__stats,
.mobile-entry-grid-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mobile-entry-featured__stats span,
.mobile-entry-grid-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--me-meta-bg);
  color: var(--me-meta-color);
  font-size: 11px;
  font-weight: 700;
}

.mobile-entry-featured__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.16);
  color: var(--me-link-color);
  font-size: 12px;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.18);
}

.mobile-entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.mobile-entry-grid-card {
  display: grid;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--me-card-border);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--me-card-bg-from), var(--me-card-bg-to));
  box-shadow: 0 10px 24px var(--me-card-shadow);
  text-align: left;
}

.mobile-entry-grid-card__cover {
  position: relative;
  aspect-ratio: 0.82;
  overflow: hidden;
  border-radius: 14px;
  background: var(--me-grid-cover-bg);
}

.mobile-entry-grid-card__cover img,
.mobile-entry-grid-card__cover :deep(.lazy-image-wrapper),
.mobile-entry-grid-card__fallback {
  display: block;
  width: 100%;
  height: 100%;
}

.mobile-entry-grid-card__cover img {
  object-fit: cover;
}

.mobile-entry-grid-card .mobile-entry-rank {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
  min-width: 30px;
  height: 26px;
  font-size: 11px;
}

.mobile-entry-grid-card__content {
  display: grid;
  gap: 6px;
}

.mobile-entry-grid-card__top {
  display: grid;
  gap: 3px;
}

.mobile-entry-grid-card__top strong {
  color: var(--me-title-color);
  font-size: 16px;
  line-height: 1.25;
}

.mobile-entry-loadmore {
  min-height: 42px;
  border-radius: 16px;
  background: var(--me-loadmore-bg);
  color: var(--me-loadmore-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nw-text-primary) 8%, var(--nw-bg-secondary));
}

.mobile-entry-filing-footer {
  margin-top: 4px;
}

@media (max-width: 560px) {
  .mobile-entry-featured {
    grid-template-columns: clamp(104px, 30vw, 120px) minmax(0, 1fr);
    gap: 12px;
  }

  .mobile-entry-featured__cover {
    width: 100%;
  }

  .mobile-entry-featured__copy strong {
    font-size: 15px;
  }

  .mobile-entry-featured__copy p {
    -webkit-line-clamp: 2;
  }
}

@media (max-width: 380px) {
  .mobile-entry-featured {
    grid-template-columns: 1fr;
  }

  .mobile-entry-featured__cover {
    width: 100%;
    max-width: 220px;
  }
}
</style>

<style>
html.dark.warm-night .mobile-entry-page {
  --star-brand-sky: #f59e0b;
  --mobile-focus-accent: #f59e0b;
  --mobile-focus-accent-strong: #d97706;
  --mobile-focus-tint: rgba(245, 158, 11, 0.14);
  --me-label-color: #fde68a;
  --me-link-color: #fde68a;
}
</style>
