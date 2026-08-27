<script setup lang="ts">
/**
 * 桌面端·我的收藏
 * 复用 getMyFavoriteBookPage。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { favoriteBook, getBookStorePublicChapters, getMyFavoriteBookPage } from '../../api/bookstore';
import { extractApiErrorMessage } from '../../api/errors';
import { GENRE_LABELS, type BookStore } from '../../types';
import { resolveCoverSrc } from '../../utils/deploy-path';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';

const router = useRouter();
const books = ref<BookStore[]>([]);
const loading = ref(false);
const loadError = ref('');
const hasMore = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await getMyFavoriteBookPage({ page: 1, pageSize: 30 });
    books.value = res.items;
    hasMore.value = books.value.length < res.total;
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载收藏失败');
  } finally { loading.value = false; }
}
load();

function fmt(n: number): string { return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n); }

function coverOf(book: BookStore): string {
  return resolveCoverSrc(book.cover || book.coverUrl) || '';
}

async function continueReading(book: BookStore): Promise<void> {
  try {
    const chapters = await getBookStorePublicChapters(book.id);
    const first = chapters[0]?.chapterNumber ?? 1;
    await router.push(`/desktop/book/${book.id}/read/${first}`);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '无法打开阅读页'));
  }
}

async function removeFavorite(book: BookStore): Promise<void> {
  try {
    const res = await favoriteBook(book.id);
    if (!res.favorited) {
      books.value = books.value.filter((item) => item.id !== book.id);
      ElMessage.success('已取消收藏');
    } else {
      ElMessage.success('已收藏');
    }
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '操作失败'));
  }
}

const sorted = computed(() => [...books.value].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)));
</script>

<template>
  <div class="desktop-mynovels">
    <div class="desktop-greeting">
      <h1>我的收藏 <span class="desktop-section-count">{{ books.length }}</span></h1>
      <button class="desktop-btn" :disabled="loading" @click="load"><Icon name="refresh" :size="14" /> {{ loading ? '加载中' : '刷新' }}</button>
    </div>

    <StateView :loading="loading" :error="loadError ? new Error(loadError) : null" :error-message="loadError" :empty="!loading && !books.length" @retry="load">
      <template #empty>
        <p class="nw-state__title">还没有收藏</p>
        <p class="nw-state__desc">去书城逛逛，收藏喜欢的作品吧。</p>
        <RouterLink to="/desktop" class="desktop-btn desktop-btn--primary"><Icon name="store" :size="16" /> 浏览书城</RouterLink>
      </template>

      <div class="novel-grid">
        <article v-for="b in sorted" :key="b.id" class="novel-card" @click="router.push(`/desktop/book/${b.id}`)">
          <div class="novel-card-cover" :style="coverOf(b) ? { backgroundImage: `url(${coverOf(b)})` } : {}">
            <span v-if="!coverOf(b)" class="novel-card-fallback">{{ (b.title || '?').slice(0, 1) }}</span>
            <span class="novel-card-status">{{ GENRE_LABELS[b.category as keyof typeof GENRE_LABELS] ?? b.category ?? '未分类' }}</span>
          </div>
          <div class="novel-card-body">
            <h3 class="novel-card-title">{{ b.title }}</h3>
            <div class="novel-card-meta">
              <span><Icon name="user" :size="12" /> {{ b.authorName || '匿名' }}</span>
              <span class="desktop-card-meta-dot" />
              <span><Icon name="sparkles" :size="12" /> {{ fmt(b.viewCount || 0) }} 阅读</span>
            </div>
            <p v-if="b.description" class="novel-card-synopsis">{{ b.description }}</p>
            <div class="novel-card-actions">
              <button class="desktop-btn desktop-btn--primary" type="button" @click.stop="continueReading(b)">
                <Icon name="bookOpen" :size="14" /> 继续阅读
              </button>
              <button class="desktop-btn" type="button" @click.stop="router.push(`/desktop/book/${b.id}`)">
                详情
              </button>
              <button class="desktop-btn" type="button" @click.stop="removeFavorite(b)">
                取消收藏
              </button>
            </div>
          </div>
        </article>
      </div>
    </StateView>
  </div>
</template>
