<script setup lang="ts">
/**
 * 桌面端·工作台仪表盘
 * 全部模块拉取真实书城数据（/bookstore/list），无伪造：
 * - KPI：在架作品 / 总章节 / 总字数 / 总阅读
 * - 作品表：标题/作者/分类/字数/阅读/点赞
 * - 分类分布：按 category 聚合
 * - 热门作品：按阅读量排序
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAsyncData } from '../../composables/useAsyncData';
import { useDesktopSearch } from '../../composables/useDesktopSearch';
import { useDesktopCreate } from '../../composables/useDesktopCreate';
import { extractApiErrorMessage, isAbortError } from '../../api/errors';
import { getBookStoreList } from '../../api/bookstore';
import { fetchActiveAnnouncements } from '../../api/announcements';
import { fetchNovelSummaries } from '../../api/novels';
import { useAuthStore } from '../../stores/auth';
import type { BookStore, BookStoreListResponse } from '../../api/types';
import type { NovelMetadata } from '../../types';
import type { AnnouncementWithReadStatus } from '../../types/announcement';
import { resolveCoverSrc } from '../../utils/deploy-path';
import StateView from '../../components/shared/StateView.vue';
import StatCard from '../../components/shared/StatCard.vue';
import Icon from '../../components/shared/Icon.vue';

const PAGE_SIZE = 50;

const router = useRouter();
const { openCreate } = useDesktopCreate();

function openDetail(b: BookStore): void {
  router.push(`/desktop/book/${b.id}`);
}

const { data, loading, error, run } = useAsyncData<BookStoreListResponse<BookStore>, []>(
  () => getBookStoreList({ page: 1, pageSize: PAGE_SIZE }),
  { immediate: true },
);

const errorMessage = computed(() => {
  if (!error.value || isAbortError(error.value)) return '';
  return extractApiErrorMessage(error.value);
});
const stateError = computed(() => (errorMessage.value ? error.value : null));
const books = computed<BookStore[]>(() => data.value?.items ?? []);
const ready = computed(() => !!data.value);

const metrics = computed(() => {
  const items = books.value;
  return {
    works: data.value?.total ?? items.length,
    chapters: items.reduce((s, b) => s + (b.chapterCount || 0), 0),
    words: items.reduce((s, b) => s + (b.wordCount || 0), 0),
    views: items.reduce((s, b) => s + (b.viewCount || 0), 0),
  };
});

const categoryStats = computed(() => {
  const map = new Map<string, number>();
  for (const b of books.value) {
    const c = b.category || '未分类';
    map.set(c, (map.get(c) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));
});
const maxCategory = computed(() => Math.max(1, ...categoryStats.value.map((c) => c.count)));

const topBooks = computed(() =>
  [...books.value].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 5),
);

const latestBooks = computed(() =>
  [...books.value]
    .sort((a, b) => String(b.publishTime || '').localeCompare(String(a.publishTime || '')))
    .slice(0, 5),
);

/** 我的创作（需登录） */
const authStore = useAuthStore();
const myNovels = ref<NovelMetadata[]>([]);
const announcements = ref<AnnouncementWithReadStatus[]>([]);
const extraLoading = ref(false);

async function loadExtra(): Promise<void> {
  if (!authStore.isAuthenticated) return;
  extraLoading.value = true;
  try {
    const [novelsRes, annRes] = await Promise.allSettled([
      fetchNovelSummaries(),
      fetchActiveAnnouncements().catch(() => []),
    ]);
    if (novelsRes.status === 'fulfilled') myNovels.value = novelsRes.value;
    if (annRes.status === 'fulfilled') announcements.value = annRes.value;
  } finally { extraLoading.value = false; }
}
onMounted(loadExtra);

const myWritingNovels = computed(() => myNovels.value.filter(n => n.status === 'writing'));
const myCompletedNovels = computed(() => myNovels.value.filter(n => n.status === 'completed' || n.status === 'published'));
const unreadAnnouncements = computed(() => announcements.value.filter(a => !a.isRead));

const quickLinks = [
  { to: '/desktop/novels', icon: 'book', label: '我的作品', desc: '创作管理' },
  { to: '/desktop/analytics', icon: 'layers', label: '数据分析', desc: '运营看板' },
  { to: '/desktop/me', icon: 'user', label: '个人中心', desc: '资料与积分' },
];

/** 顶栏搜索 + 分类筛选（作用于作品列表表格） */
const { query } = useDesktopSearch();
const activeCategory = ref('全部');
const categories = computed(() => ['全部', ...Array.from(new Set(books.value.map((b) => b.category || '未分类')))]);
const filteredBooks = computed(() => {
  const q = query.value.trim().toLowerCase();
  return books.value.filter((b) => {
    const matchQ = !q || (b.title || '').toLowerCase().includes(q) || (b.authorName || '').toLowerCase().includes(q);
    const matchC = activeCategory.value === '全部' || (b.category || '未分类') === activeCategory.value;
    return matchQ && matchC;
  });
});
const filteredEmpty = computed(() => ready.value && filteredBooks.value.length === 0);
const filteredEmptyHint = computed(() => (books.value.length > 0 ? '无匹配作品，换个关键词或分类' : '暂无作品'));

/** 表头排序（字数/阅读/点赞） */
type SortKey = 'wordCount' | 'viewCount' | 'likeCount';
const sortKey = ref<SortKey | null>(null);
const sortDir = ref<'asc' | 'desc'>('desc');
function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'desc';
  }
}
const displayBooks = computed(() => {
  const list = [...filteredBooks.value];
  if (sortKey.value) {
    const k = sortKey.value;
    const dir = sortDir.value === 'asc' ? 1 : -1;
    list.sort((a, b) => ((Number(a[k]) || 0) - (Number(b[k]) || 0)) * dir);
  }
  return list;
});

function fmt(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
}

/** 解析作品封面图地址（沿用移动端既有 resolveCoverSrc，dev 下走 /api 代理） */
function coverOf(b: BookStore): string {
  return resolveCoverSrc(b.cover || b.coverUrl);
}

const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

function refresh(): void {
  void run();
}
</script>

<template>
  <div class="desktop-dashboard">
    <div class="desktop-greeting">
      <div class="desktop-greeting-left">
        <h1>工作台</h1>
        <span class="desktop-greeting-meta">{{ today }}</span>
      </div>
    </div>

    <div class="desktop-kpi-row">
      <StatCard icon="book" accent="indigo" :value="ready ? metrics.works : '—'" label="在架作品" />
      <StatCard icon="layers" accent="sky" :value="ready ? metrics.chapters : '—'" label="章节总数" />
      <StatCard icon="pen" accent="emerald" :value="ready ? fmt(metrics.words) : '—'" label="累计字数" />
      <StatCard icon="sparkles" accent="amber" :value="ready ? fmt(metrics.views) : '—'" label="总阅读" />
    </div>

    <!-- 公告横幅 -->
    <div v-if="unreadAnnouncements.length" class="home-announcements">
      <div v-for="ann in unreadAnnouncements.slice(0, 2)" :key="ann.id" class="home-announcement">
        <Icon name="sparkles" :size="16" />
        <div class="home-ann-body">
          <div class="home-ann-title">{{ ann.title }}</div>
          <div class="home-ann-content">{{ ann.content }}</div>
        </div>
      </div>
    </div>

    <!-- 我的创作概览（登录后） -->
    <div v-if="authStore.isAuthenticated && myNovels.length" class="nw-panel home-my-novels">
      <div class="nw-panel__head">
        <h2 class="nw-panel__title">我的创作 <span class="desktop-section-count">{{ myNovels.length }}</span></h2>
        <RouterLink to="/desktop/novels" class="desktop-btn" style="font-size:12px;padding:4px 12px">全部 →</RouterLink>
      </div>
      <div class="home-novel-strip">
        <div
          v-for="n in myNovels.slice(0, 6)"
          :key="n.id"
          class="home-novel-item"
          @click="router.push(`/desktop/novel/${n.id}`)"
        >
          <div
            class="home-novel-cover"
            :style="n.coverImage ? { backgroundImage: `url(${resolveCoverSrc(n.coverImage)})` } : {}"
          >
            <span class="home-novel-letter">{{ (n.title || '?').slice(0, 1) }}</span>
          </div>
          <div class="home-novel-info">
            <div class="home-novel-title">{{ n.title }}</div>
            <div class="home-novel-meta">
              <span class="nw-tag" :class="{ 'nw-tag--muted': n.status === 'planning' }">{{ n.status }}</span>
              <span class="home-novel-words">{{ fmt(n.wordCount ?? 0) }} 字</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="home-quick-links">
      <RouterLink v-for="link in quickLinks" :key="link.to" :to="link.to" class="home-quick-link">
        <div class="home-quick-icon"><Icon :name="link.icon" :size="20" /></div>
        <div class="home-quick-body">
          <span class="home-quick-label">{{ link.label }}</span>
          <span class="home-quick-desc">{{ link.desc }}</span>
        </div>
        <Icon name="chevronDown" :size="14" style="transform:rotate(-90deg);color:var(--nw-text-muted)" />
      </RouterLink>
    </div>

    <div class="desktop-main-grid">
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">
            作品列表 <span class="desktop-section-count">{{ filteredBooks.length }}/{{ books.length }}</span>
          </h2>
          <button class="desktop-btn" :disabled="loading" @click="refresh">
            <Icon name="refresh" :size="14" /> {{ loading ? '加载中' : '刷新' }}
          </button>
        </div>

        <div v-if="books.length" class="desktop-filterbar">
          <button
            v-for="c in categories"
            :key="c"
            class="desktop-chip"
            :class="{ 'is-active': activeCategory === c }"
            @click="activeCategory = c"
          >{{ c }}</button>
        </div>

        <StateView
          :loading="loading && !data"
          :error="stateError"
          :error-message="errorMessage"
          :empty="filteredEmpty"
          @retry="refresh"
        >
          <template #loading>
            <div v-for="i in 5" :key="i" class="nw-row-skeleton" />
          </template>
          <template #empty>
            <p class="nw-state__title">{{ filteredEmptyHint }}</p>
          </template>

          <table class="nw-table">
            <thead>
              <tr>
                <th>作品</th>
                <th>作者</th>
                <th>分类</th>
                <th class="desktop-sort" :class="{ 'is-active': sortKey === 'wordCount' }" @click="toggleSort('wordCount')">
                  字数 <Icon :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'" :size="12" class="desktop-sort-icon" />
                </th>
                <th class="desktop-sort" :class="{ 'is-active': sortKey === 'viewCount' }" @click="toggleSort('viewCount')">
                  阅读 <Icon :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'" :size="12" class="desktop-sort-icon" />
                </th>
                <th class="desktop-sort" :class="{ 'is-active': sortKey === 'likeCount' }" @click="toggleSort('likeCount')">
                  点赞 <Icon :name="sortDir === 'asc' ? 'chevronUp' : 'chevronDown'" :size="12" class="desktop-sort-icon" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in displayBooks" :key="b.id" class="desktop-row-clickable" @click="openDetail(b)">
                <td>
                  <div class="desktop-work-cell">
                    <div
                      class="desktop-work-thumb"
                      :style="coverOf(b) ? { backgroundImage: `url(${coverOf(b)})` } : {}"
                    >{{ coverOf(b) ? '' : (b.title || '?').slice(0, 1) }}</div>
                    <span class="desktop-work-name">{{ b.title }}</span>
                  </div>
                </td>
                <td>{{ b.authorName || '—' }}</td>
                <td><span class="nw-tag">{{ b.category || '未分类' }}</span></td>
                <td>{{ fmt(b.wordCount || 0) }}</td>
                <td>{{ fmt(b.viewCount || 0) }}</td>
                <td>{{ b.likeCount || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </StateView>
      </div>

      <div class="desktop-side">
        <div class="nw-panel">
          <div class="nw-panel__head"><h2 class="nw-panel__title">热门作品</h2></div>
          <div class="desktop-toplist">
            <div v-for="(b, i) in topBooks" :key="b.id" class="desktop-top-item">
              <span class="desktop-top-rank" :class="{ 'is-top': i < 3 }">{{ i + 1 }}</span>
              <span class="desktop-top-name">{{ b.title }}</span>
              <span class="desktop-top-views">{{ fmt(b.viewCount || 0) }}</span>
            </div>
          </div>
        </div>

        <div class="nw-panel">
          <div class="nw-panel__head"><h2 class="nw-panel__title">最新上架</h2></div>
          <div class="desktop-toplist">
            <div v-for="b in latestBooks" :key="b.id" class="desktop-top-item">
              <div
                class="desktop-work-thumb sm"
                :style="coverOf(b) ? { backgroundImage: `url(${coverOf(b)})` } : {}"
              >{{ coverOf(b) ? '' : (b.title || '?').slice(0, 1) }}</div>
              <span class="desktop-top-name">{{ b.title }}</span>
              <span class="desktop-top-views">{{ fmt(b.wordCount || 0) }} 字</span>
            </div>
          </div>
        </div>

        <div v-if="categoryStats.length" class="nw-panel">
          <div class="nw-panel__head"><h2 class="nw-panel__title">分类分布</h2></div>
          <div class="desktop-genres">
            <div v-for="c in categoryStats" :key="c.label" class="desktop-genre">
              <span class="desktop-genre-label">{{ c.label }}</span>
              <div class="desktop-genre-bar">
                <div class="desktop-genre-fill" :style="{ width: `${(c.count / maxCategory) * 100}%` }" />
              </div>
              <span class="desktop-genre-count">{{ c.count }}</span>
            </div>
          </div>
        </div>

        <div class="nw-panel">
          <div class="nw-panel__head"><h2 class="nw-panel__title">快捷操作</h2></div>
          <div class="desktop-actions">
            <RouterLink to="/desktop/bookstore" class="desktop-action"><Icon name="store" :size="18" /><span>浏览书城</span></RouterLink>
            <a class="desktop-action" href="/m"><Icon name="smartphone" :size="18" /><span>移动端首页</span></a>
            <button type="button" class="desktop-action" @click="openCreate">
              <Icon name="plus" :size="18" /><span>新建作品</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
