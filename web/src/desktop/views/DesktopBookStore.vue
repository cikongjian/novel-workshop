<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getBookStoreList } from '../../api/bookstore';
import { extractApiErrorMessage, isAbortError } from '../../api/errors';
import type { BookStore, BookStoreListResponse, BookStoreSort } from '../../api/types';
import { resolveCoverSrc } from '../../utils/deploy-path';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import LazyImage from '../../components/shared/LazyImage.vue';
import { useRequestCache } from '../../composables/useRequestCache';

const router = useRouter();
const { cachedFetch, invalidate } = useRequestCache<BookStoreListResponse<BookStore>>(60000);

const loading = ref(false);
const loadingMore = ref(false);
const error = ref<unknown>(null);
const data = ref<BookStoreListResponse<BookStore> | null>(null);
const books = ref<BookStore[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 24;

const keyword = ref('');
const activeCategory = ref('');
const sortKey = ref<BookStoreSort>('hot');

const SORT_OPTIONS = [
  { key: 'hot' as BookStoreSort, label: '热门' },
  { key: 'updated' as BookStoreSort, label: '更新' },
  { key: 'new' as BookStoreSort, label: '最新' },
];

const categories = computed(() => {
  const set = new Set<string>();
  books.value.forEach(b => set.add(b.category || '未分类'));
  return ['全部', ...Array.from(set)];
});

const hasMore = computed(() => books.value.length < total.value);

async function fetchBooks(reset = false) {
  const nextPage = reset ? 1 : page.value;
  const queryKey = `bookstore_${nextPage}_${pageSize}_${activeCategory.value}_${keyword.value}_${sortKey.value}`;

  if (reset) {
    loading.value = true;
    error.value = null;
  } else {
    loadingMore.value = true;
  }

  try {
    const result = await cachedFetch(queryKey, () =>
      getBookStoreList({
        page: nextPage,
        pageSize,
        category: activeCategory.value || undefined,
        keyword: keyword.value.trim() || undefined,
        sort: sortKey.value,
      })
    );

    if (reset) {
      books.value = result.items;
    } else {
      books.value = [...books.value, ...result.items];
    }
    total.value = result.total;
    page.value = result.page;
    data.value = result;
  } catch (err) {
    if (!isAbortError(err)) {
      error.value = err;
      if (reset) books.value = [];
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function loadMore() {
  if (!hasMore.value || loadingMore.value) return;
  page.value += 1;
  void fetchBooks(false);
}

function handleKeywordChange() {
  invalidate();
  page.value = 1;
  void fetchBooks(true);
}

function handleCategoryChange(category: string) {
  activeCategory.value = category === '全部' ? '' : category;
  invalidate();
  page.value = 1;
  void fetchBooks(true);
}

function handleSortChange(sort: BookStoreSort) {
  sortKey.value = sort;
  invalidate();
  page.value = 1;
  void fetchBooks(true);
}

watch(keyword, () => {
  handleKeywordChange();
});

const errorMessage = computed(() => {
  if (!error.value || isAbortError(error.value)) return '';
  return extractApiErrorMessage(error.value);
});

function fmt(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
}

function coverOf(b: BookStore): string {
  return resolveCoverSrc(b.cover || b.coverUrl);
}

void fetchBooks(true);
</script>

<template>
  <div class="desktop-bookstore">
    <div class="bookstore-hero nw-panel">
      <div class="bookstore-hero-content">
        <h1 class="bookstore-title">书城</h1>
        <p class="bookstore-sub">发现精彩作品 · {{ total }} 部作品等你阅读</p>
      </div>
      <div class="bookstore-hero-actions">
        <input
          v-model="keyword"
          class="nw-input bookstore-search"
          placeholder="搜索作品 / 作者…"
        />
        <select
          v-model="sortKey"
          class="nw-input bookstore-sort"
          @change="handleSortChange(sortKey)"
        >
          <option v-for="o in SORT_OPTIONS" :key="o.key" :value="o.key">
            {{ o.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="world-categories">
      <button
        v-for="c in categories"
        :key="c"
        class="world-cat-btn"
        :class="{ 'is-active': activeCategory === (c === '全部' ? '' : c) }"
        @click="handleCategoryChange(c)"
      >
        {{ c }}
      </button>
    </div>

    <StateView
      :loading="loading && books.length === 0"
      :error="errorMessage ? new Error(errorMessage) : null"
      :error-message="errorMessage"
      :empty="!!data && books.length === 0"
      @retry="() => fetchBooks(true)"
    >
      <template #empty>
        <p class="nw-state__title">没有匹配的作品</p>
        <p class="nw-state__desc">换个分类或搜索词试试</p>
      </template>

      <div class="bookstore-grid">
        <article
          v-for="b in books"
          :key="b.id"
          class="bookstore-card"
          @click="router.push(`/desktop/book/${b.id}`)"
        >
          <div class="bookstore-card-cover">
            <LazyImage
              v-if="coverOf(b)"
              :src="coverOf(b)"
              :alt="b.title"
              :fallback-text="b.title"
              aspect-ratio="3/4"
            />
            <span v-else class="bookstore-card-letter">
              {{ (b.title || '?').slice(0, 1) }}
            </span>
          </div>
          <div class="bookstore-card-body">
            <h3 class="bookstore-card-title">{{ b.title }}</h3>
            <div class="bookstore-card-meta">
              <Icon name="user" :size="12" />
              <span>{{ b.authorName || '匿名' }}</span>
              <span class="desktop-card-meta-dot" />
              <span class="nw-tag nw-tag--muted">{{ b.category || '未分类' }}</span>
            </div>
            <p v-if="b.description" class="bookstore-card-desc">{{ b.description }}</p>
            <div class="bookstore-card-stats">
              <span><Icon name="sparkles" :size="11" /> {{ fmt(b.viewCount || 0) }}</span>
              <span><Icon name="bookOpen" :size="11" /> {{ b.chapterCount || 0 }} 章</span>
              <span><Icon name="pen" :size="11" /> {{ fmt(b.wordCount || 0) }} 字</span>
            </div>
          </div>
        </article>
      </div>

      <div v-if="!loading && hasMore" class="bookstore-loadmore">
        <button
          class="nw-button"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </StateView>
  </div>
</template>
