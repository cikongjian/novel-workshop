<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowLeft, CollectionTag, Reading, RefreshRight, Star, View } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { favoriteBook, getMyFavoriteBookPage } from '../api/bookstore';
import { resolveCoverSrc } from '../utils/deploy-path';
import type { BookStore } from '../api/types';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useThemeMode } from '../composables/useThemeMode';
import LazyImage from '../components/shared/LazyImage.vue';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const removingId = ref('');
const books = ref<BookStore[]>([]);
const bookPage = ref(0);
const bookTotal = ref(0);
const bookHasMore = ref(false);

onMounted(() => {
  void loadFavorites();
});

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: () => loadFavorites(true),
});

async function loadFavorites(reset = true) {
  loading.value = true;
  try {
    const result = await getMyFavoriteBookPage({
      page: reset ? 1 : bookPage.value + 1,
      pageSize: 20,
    });
    books.value = reset ? result.items : [...books.value, ...result.items];
    bookPage.value = result.page;
    bookTotal.value = result.total;
    bookHasMore.value = result.page < result.totalPages;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载收藏失败');
  } finally {
    loading.value = false;
  }
}

function goBack() {
  void router.push('/m/me');
}

function openBook(bookId: string) {
  void router.push(`/m/bookstore/${bookId}`);
}

async function removeFavorite(bookId: string) {
  removingId.value = bookId;
  try {
    await favoriteBook(bookId);
    books.value = books.value.filter((item) => item.id !== bookId);
    bookTotal.value = Math.max(0, bookTotal.value - 1);
    ElMessage.success('已取消收藏');
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '取消收藏失败');
  } finally {
    removingId.value = '';
  }
}

function formatCount(count = 0): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  return `${count}`;
}
</script>

<template>
  <div ref="pullContainerRef" class="mobile-favorites-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
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
      <MobileTopbar title="收藏书单" subtitle="读者留档">
        <template #actions>
          <button class="mobile-focus-button--secondary" type="button" @click="goBack">
            <el-icon :size="14"><ArrowLeft /></el-icon>
            返回
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main mobile-favorites-main">
        <MobileSectionCard
          hero
          kicker="Favorites"
          title="你的收藏都在这里"
          hint="继续读、重新挑、或者从这里取消收藏"
          class="mobile-favorites-hero"
        >
          <div class="mobile-favorites-hero__actions">
            <button class="mobile-focus-button--primary" type="button" @click="loadFavorites(true)">
              <el-icon :size="14"><RefreshRight /></el-icon>
              刷新收藏
            </button>
            <button class="mobile-focus-button--secondary" type="button" @click="router.push('/m')">
              去书城
            </button>
          </div>
        </MobileSectionCard>

        <MobileSectionCard kicker="Books" :title="`已收藏 ${bookTotal || books.length} 本`" class="mobile-favorites-panel">
          <div v-if="loading" class="mobile-focus-loading">
            <el-skeleton animated :rows="6" />
          </div>

          <div v-else-if="books.length" class="mobile-focus-list">
            <article v-for="book in books" :key="book.id" class="mobile-favorites-card">
              <button class="mobile-favorites-card__main" type="button" @click="openBook(book.id)">
                <div class="mobile-favorites-card__cover">
                  <LazyImage
                    v-if="book.cover"
                    :src="resolveCoverSrc(book.cover)"
                    :alt="book.title"
                    :fallback-text="book.title"
                    aspect-ratio="6/8"
                  />
                  <div v-else class="mobile-favorites-card__fallback">
                    <span>{{ book.title.charAt(0) }}</span>
                  </div>
                </div>

                <div class="mobile-favorites-card__body">
                  <div class="mobile-favorites-card__heading">
                    <div class="mobile-focus-item__top">
                      <strong>{{ book.title }}</strong>
                      <span class="mobile-favorites-card__badge">已收藏</span>
                    </div>
                    <div class="mobile-favorites-card__submeta">
                      <span>{{ book.category || '未分类' }}</span>
                      <span>{{ (book.publishedChapterCount ?? book.chapterCount ?? 0) }} 章</span>
                    </div>
                  </div>
                  <p>{{ book.description || '这本书暂时还没有简介。' }}</p>
                  <div class="mobile-favorites-card__meta">
                    <span><el-icon><View /></el-icon>{{ formatCount(book.viewCount) }}</span>
                    <span><el-icon><Star /></el-icon>{{ formatCount(book.likeCount) }}</span>
                    <span><el-icon><CollectionTag /></el-icon>{{ formatCount(book.favoriteCount ?? 0) }}</span>
                  </div>
                </div>
              </button>

              <div class="mobile-favorites-card__actions">
                <button class="mobile-focus-button--secondary" type="button" @click="openBook(book.id)">
                  <el-icon :size="14"><Reading /></el-icon>
                  去阅读
                </button>
                <button
                  class="mobile-focus-button--ghost"
                  type="button"
                  :disabled="removingId === book.id"
                  @click="removeFavorite(book.id)"
                >
                  {{ removingId === book.id ? '处理中...' : '取消收藏' }}
                </button>
              </div>
            </article>
            <button
              v-if="bookHasMore"
              class="mobile-focus-button--secondary"
              type="button"
              :disabled="loading"
              @click="loadFavorites(false)"
            >
              继续加载收藏
            </button>
          </div>

          <div v-else class="mobile-focus-empty">
            <strong>收藏书单还是空的</strong>
            <p>先去书城挑几本，后面这里会变成你的常读入口。</p>
            <button class="mobile-focus-button--primary" type="button" @click="router.push('/m')">
              去逛书城
            </button>
          </div>
        </MobileSectionCard>
      </main>
    </div>

    <MobileWorkbenchDock />
  </div>
</template>

<style scoped>
.mobile-favorites-page {
  --mobile-focus-accent: var(--star-brand-sky, #0ea5e9);
  --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6);
  --mobile-focus-tint: color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent);
}

.mobile-favorites-main {
  gap: 14px;
}

.mobile-favorites-hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent), transparent 34%),
    linear-gradient(180deg, var(--nw-bg-primary), color-mix(in srgb, var(--mobile-focus-accent) 6%, var(--nw-bg-secondary)));
}

.mobile-favorites-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mobile-favorites-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-border));
  background: var(--nw-bg-card, var(--nw-bg-secondary));
}

.mobile-favorites-card__main {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.mobile-favorites-card__cover {
  width: 88px;
  aspect-ratio: 6 / 8;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--star-brand-sky, #172033) 35%, var(--nw-bg-card)) 0%, color-mix(in srgb, var(--star-brand-sky, #2c4468) 55%, var(--nw-bg-card)) 100%);
}

.mobile-favorites-card__cover :deep(.lazy-image-wrapper),
.mobile-favorites-card__fallback {
  width: 100%;
  height: 100%;
  display: block;
}

.mobile-favorites-card__fallback {
  display: grid;
  place-items: center;
}

.mobile-favorites-card__fallback span {
  color: var(--nw-text-primary);
  font-size: 26px;
  font-weight: 800;
  opacity: 0.86;
}

.mobile-favorites-card__heading {
  display: grid;
  gap: 6px;
}

.mobile-favorites-card__submeta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mobile-favorites-card__submeta span {
  font-size: 11px;
  line-height: 1.35;
  color: var(--nw-text-muted);
}

.mobile-favorites-card__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent);
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-secondary));
  color: var(--mobile-focus-accent);
  font-size: 10px;
  font-weight: 700;
}

.mobile-favorites-card__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.mobile-favorites-card__body p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--nw-text-secondary);
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.mobile-favorites-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mobile-favorites-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-secondary));
  color: var(--mobile-focus-accent);
  font-size: 11px;
  font-weight: 700;
}

.mobile-favorites-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
