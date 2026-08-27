<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getAdminBookPage } from '../../api/bookstore';
import { offlineBook, reOnlineBook } from '../../api/moderation';
import type { BookStore } from '../../api/types';
import { resolveCoverSrc } from '../../utils/deploy-path';
import Icon from '../../components/shared/Icon.vue';

const loading = ref(false);
const books = ref<BookStore[]>([]);
const booksLoaded = ref(false);
const bookPage = ref(0);
const bookTotal = ref(0);
const bookHasMore = ref(false);
const searchKeyword = ref('');
const statusFilter = ref<'all' | 'approved' | 'pending' | 'offline' | 'rejected'>('all');

const offlineBooks = computed(() => books.value.filter((b) => b.publishStatus === 'offline'));
const pendingBooks = computed(() => books.value.filter((b) => b.publishStatus !== 'approved' && b.publishStatus !== 'offline'));

const heroStats = computed(() => [
  { label: '作品总数', value: booksLoaded.value ? bookTotal.value : '--' },
  { label: '上架中', value: booksLoaded.value ? books.value.filter(b => b.publishStatus === 'approved').length : '--' },
  { label: '待处理', value: booksLoaded.value ? pendingBooks.value.length : '--' },
  { label: '已下架', value: booksLoaded.value ? offlineBooks.value.length : '--' },
]);

const filteredBooks = computed(() => {
  let result = books.value;
  if (statusFilter.value !== 'all') {
    result = result.filter((b) => b.publishStatus === statusFilter.value);
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase();
    result = result.filter(
      (b) => b.title.toLowerCase().includes(kw) || (b.authorName ?? '').toLowerCase().includes(kw),
    );
  }
  return result;
});

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿', pending: '待审', approved: '上架中', rejected: '被拒', offline: '已下架',
  };
  return map[status] ?? status;
}

function getStatusClass(status: string): string {
  const map: Record<string, string> = {
    approved: 'status--success',
    offline: 'status--danger',
    pending: 'status--warning',
    rejected: 'status--danger',
    draft: 'status--muted',
  };
  return map[status] ?? '';
}

async function loadBooks(reset = false) {
  loading.value = true;
  try {
    const result = await getAdminBookPage({
      page: reset ? 1 : bookPage.value + 1,
      pageSize: 50,
    });
    books.value = reset ? result.items : [...books.value, ...result.items];
    bookPage.value = result.page;
    bookTotal.value = result.total;
    bookHasMore.value = result.page < result.totalPages;
    booksLoaded.value = true;
  } catch {
    if (reset) {
      books.value = [];
      bookPage.value = 0;
      bookTotal.value = 0;
      bookHasMore.value = false;
    }
  } finally {
    loading.value = false;
  }
}

async function handleOffline(book: BookStore) {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确定下架《${book.title}》？请输入下架原因。`,
      '下架作品',
      {
        confirmButtonText: '确认下架',
        cancelButtonText: '取消',
        inputPlaceholder: '下架原因（必填）',
        inputValidator: (val: string) => (val?.trim() ? true : '请填写下架原因'),
        type: 'warning',
      },
    ) as { value: string };
    await offlineBook({ novelId: book.novelId, reason });
    ElMessage.success(`《${book.title}》已下架`);
    await loadBooks(true);
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.error || '下架失败');
    }
  }
}

async function handleReOnline(book: BookStore) {
  try {
    await ElMessageBox.confirm(
      `确定重新上架《${book.title}》？`,
      '重新上架',
      {
        confirmButtonText: '确认上架',
        cancelButtonText: '取消',
        type: 'success',
      },
    );
    await reOnlineBook(book.novelId);
    ElMessage.success(`《${book.title}》已重新上架`);
    await loadBooks(true);
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.error || '重新上架失败');
    }
  }
}

onMounted(() => {
  void loadBooks(true);
});
</script>

<template>
  <div class="desktop-admin-bookstore">
    <div class="desktop-greeting">
      <h1>书城管理</h1>
      <p>管理书城中的所有作品，支持上下架操作。</p>
    </div>

    <!-- 数据概览 -->
    <div class="stat-grid">
      <div v-for="stat in heroStats" :key="stat.label" class="stat-card nw-panel">
        <div class="stat-card-label">{{ stat.label }}</div>
        <div class="stat-card-value">{{ stat.value }}</div>
      </div>
    </div>

    <!-- 筛选工具栏 -->
    <div class="nw-panel bookstore-toolbar">
      <div class="bookstore-filters">
        <div class="bookstore-search">
          <Icon name="search" :size="16" />
          <input v-model="searchKeyword" type="text" placeholder="搜索书名或作者…" />
        </div>
        <div class="bookstore-status-tabs">
          <button
            class="status-tab"
            :class="{ 'is-active': statusFilter === 'all' }"
            @click="statusFilter = 'all'"
          >
            全部
          </button>
          <button
            class="status-tab"
            :class="{ 'is-active': statusFilter === 'approved' }"
            @click="statusFilter = 'approved'"
          >
            上架中
          </button>
          <button
            class="status-tab"
            :class="{ 'is-active': statusFilter === 'pending' }"
            @click="statusFilter = 'pending'"
          >
            待审核
          </button>
          <button
            class="status-tab"
            :class="{ 'is-active': statusFilter === 'offline' }"
            @click="statusFilter = 'offline'"
          >
            已下架
          </button>
        </div>
      </div>
      <button class="desktop-btn" @click="loadBooks(true)">
        <Icon name="refreshCw" :size="14" /> 刷新
      </button>
    </div>

    <!-- 书籍列表 -->
    <div class="nw-panel">
      <div v-if="loading && !books.length" class="nw-state nw-state--loading">
        <span class="nw-state__spinner" />
        <span>加载中…</span>
      </div>

      <div v-else-if="filteredBooks.length" class="book-list">
        <article v-for="book in filteredBooks" :key="book.id" class="book-row">
          <div class="book-cover">
            <img v-if="book.coverUrl || book.cover" :src="resolveCoverSrc(book.coverUrl || book.cover)" :alt="book.title" />
            <div v-else class="book-cover-fallback">
              <span>{{ book.title?.charAt(0) || '书' }}</span>
            </div>
          </div>
          <div class="book-info">
            <div class="book-title-row">
              <strong class="book-title">{{ book.title }}</strong>
              <span class="book-status" :class="getStatusClass(book.publishStatus)">
                {{ getStatusLabel(book.publishStatus) }}
              </span>
            </div>
            <div class="book-meta">
              <span>{{ book.category || '未分类' }}</span>
              <span>{{ book.authorName || book.userId?.slice(0, 6) || '--' }}</span>
              <span>{{ (book.viewCount ?? 0).toLocaleString() }} 阅读</span>
              <span>{{ (book.likeCount ?? 0).toLocaleString() }} 点赞</span>
            </div>
            <p v-if="book.offlineReason" class="book-offline-reason">
              下架原因：{{ book.offlineReason }}
            </p>
          </div>
          <div class="book-actions">
            <button
              v-if="book.publishStatus === 'approved'"
              class="desktop-btn desktop-btn--danger"
              @click="handleOffline(book)"
            >
              下架此书
            </button>
            <button
              v-if="book.publishStatus === 'offline'"
              class="desktop-btn desktop-btn--primary"
              @click="handleReOnline(book)"
            >
              重新上架
            </button>
          </div>
        </article>

        <div v-if="bookHasMore && !searchKeyword.trim() && statusFilter === 'all'" class="book-list-footer">
          <button class="desktop-btn" :disabled="loading" @click="loadBooks()">
            {{ loading ? '加载中…' : '加载更多' }}
          </button>
        </div>
      </div>

      <div v-else class="nw-state nw-state--empty">
        <p class="nw-state__title">暂无作品</p>
        <p class="nw-state__desc">{{ searchKeyword ? '没有找到匹配的作品' : '书城暂无作品' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-admin-bookstore {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-4);
}

.stat-card {
  padding: var(--nw-space-5);
}

.stat-card-label {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin-bottom: var(--nw-space-2);
}

.stat-card-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--nw-text-primary);
  font-family: var(--nw-font-display);
}

.bookstore-toolbar {
  padding: var(--nw-space-4) var(--nw-space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-4);
}

.bookstore-filters {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
  flex: 1;
}

.bookstore-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-primary);
  max-width: 320px;
}

.bookstore-search input {
  flex: 1;
  padding: 8px 0;
  border: none;
  background: transparent;
  color: var(--nw-text-primary);
  font-size: 14px;
  outline: none;
}

.bookstore-search svg {
  color: var(--nw-text-muted);
}

.bookstore-status-tabs {
  display: flex;
  gap: 4px;
}

.status-tab {
  padding: 6px 14px;
  border-radius: var(--nw-radius-sm);
  border: none;
  background: transparent;
  color: var(--nw-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.status-tab:hover {
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
}

.status-tab.is-active {
  color: var(--nw-accent-strong);
  background: color-mix(in srgb, var(--nw-accent-start) 12%, transparent);
  font-weight: 600;
}

.book-list {
  display: flex;
  flex-direction: column;
}

.book-row {
  display: flex;
  gap: var(--nw-space-4);
  padding: var(--nw-space-4) var(--nw-space-5);
  border-bottom: 1px solid var(--nw-border);
  align-items: center;
}

.book-row:last-child {
  border-bottom: none;
}

.book-cover {
  width: 64px;
  aspect-ratio: 6 / 8;
  border-radius: var(--nw-radius-md);
  overflow: hidden;
  background: var(--nw-bg-secondary);
  flex-shrink: 0;
}

.book-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-cover-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: var(--nw-accent-gradient);
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.book-info {
  flex: 1;
  min-width: 0;
}

.book-title-row {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  margin-bottom: 4px;
}

.book-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.book-status {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 999px;
}

.book-status.status--success {
  background: color-mix(in srgb, var(--nw-success) 12%, transparent);
  color: var(--nw-success);
}

.book-status.status--danger {
  background: color-mix(in srgb, var(--nw-danger) 12%, transparent);
  color: var(--nw-danger);
}

.book-status.status--warning {
  background: color-mix(in srgb, var(--nw-warning) 12%, transparent);
  color: var(--nw-warning);
}

.book-status.status--muted {
  background: var(--nw-bg-secondary);
  color: var(--nw-text-muted);
}

.book-meta {
  display: flex;
  gap: var(--nw-space-4);
  font-size: 13px;
  color: var(--nw-text-secondary);
  flex-wrap: wrap;
}

.book-offline-reason {
  font-size: 12px;
  color: var(--nw-danger);
  margin: 6px 0 0 0;
}

.book-actions {
  flex-shrink: 0;
}

.book-list-footer {
  padding: var(--nw-space-4);
  display: flex;
  justify-content: center;
}
</style>
