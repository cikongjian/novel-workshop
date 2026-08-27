<script setup lang="ts">
/**
 * 桌面端·我的作品（丰富版）
 * 统计概览 + 状态筛选 + 搜索 + 排序 + 卡片网格。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAsyncData } from '../../composables/useAsyncData';
import { extractApiErrorMessage, isAbortError } from '../../api/errors';
import { fetchNovels, getCoverUrl } from '../../api/novels';
import { useDesktopCreate } from '../../composables/useDesktopCreate';
import { STATUS_LABELS, GENRE_LABELS, type NovelMetadata, type NovelStatus } from '../../types';
import StatCard from '../../components/shared/StatCard.vue';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';

const router = useRouter();
const { openCreate } = useDesktopCreate();

const { data, loading, error, run } = useAsyncData<NovelMetadata[], []>(
  () => fetchNovels(),
  { immediate: true },
);

const errorMessage = computed(() => {
  if (!error.value || isAbortError(error.value)) return '';
  return extractApiErrorMessage(error.value);
});
const stateError = computed(() => (errorMessage.value ? error.value : null));
const novels = computed<NovelMetadata[]>(() => data.value ?? []);

// 统计
const stats = computed(() => ({
  total: novels.value.length,
  writing: novels.value.filter(n => n.status === 'writing').length,
  completed: novels.value.filter(n => n.status === 'completed' || n.status === 'published').length,
  planning: novels.value.filter(n => n.status === 'planning').length,
  totalWords: novels.value.reduce((s, n) => s + (n.wordCount ?? 0), 0),
  totalChapters: novels.value.reduce((s, n) => s + (n.chapterCount ?? 0), 0),
}));

// 筛选
type FilterKey = 'all' | NovelStatus;
const activeFilter = ref<FilterKey>('all');
const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'planning', label: '构思中' },
  { key: 'writing', label: '连载中' },
  { key: 'completed', label: '已完结' },
];

// 搜索
const keyword = ref('');

// 排序
type SortKey = 'updated' | 'words' | 'chapters' | 'created';
const sortKey = ref<SortKey>('updated');
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: '最近更新' },
  { key: 'words', label: '字数最多' },
  { key: 'chapters', label: '章节最多' },
  { key: 'created', label: '创建时间' },
];

const filteredNovels = computed(() => {
  let list = novels.value;
  if (activeFilter.value !== 'all') {
    if (activeFilter.value === 'completed') {
      list = list.filter(n => n.status === 'completed' || n.status === 'published');
    } else {
      list = list.filter(n => n.status === activeFilter.value);
    }
  }
  const q = keyword.value.trim().toLowerCase();
  if (q) list = list.filter(n => n.title.toLowerCase().includes(q));
  const sorted = [...list];
  switch (sortKey.value) {
    case 'words': sorted.sort((a, b) => (b.wordCount ?? 0) - (a.wordCount ?? 0)); break;
    case 'chapters': sorted.sort((a, b) => (b.chapterCount ?? 0) - (a.chapterCount ?? 0)); break;
    case 'created': sorted.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); break;
    default: sorted.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }
  return sorted;
});

function coverOf(n: NovelMetadata): string { return getCoverUrl(n.id); }
const coverFailed = ref<Set<string>>(new Set());
function onCoverError(id: string): void {
  const next = new Set(coverFailed.value); next.add(id); coverFailed.value = next;
}
function fmt(n: number): string { return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n); }
function fmtDate(s?: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('zh-CN') : '—';
}
function open(id: string): void { router.push(`/desktop/novel/${id}`); }
function refresh(): void { void run(); }
</script>

<template>
  <div class="desktop-mynovels">
    <!-- 统计 -->
    <div class="desktop-kpi-row">
      <StatCard icon="book" accent="indigo" :value="stats.total" label="作品总数" />
      <StatCard icon="pen" accent="sky" :value="stats.writing" label="连载中" />
      <StatCard icon="checkCircle" accent="emerald" :value="stats.completed" label="已完结" />
      <StatCard icon="sparkles" accent="amber" :value="fmt(stats.totalWords)" label="累计字数" />
    </div>

    <!-- 工具栏 -->
    <div class="novels-toolbar nw-panel">
      <div class="novels-filter-tabs">
        <button
          v-for="tab in FILTER_TABS"
          :key="tab.key"
          class="world-cat-btn"
          :class="{ 'is-active': activeFilter === tab.key }"
          @click="activeFilter = tab.key"
        >{{ tab.label }}</button>
      </div>
      <div class="novels-toolbar-right">
        <input v-model="keyword" class="nw-input novels-search" placeholder="搜索作品名…" />
        <select v-model="sortKey" class="nw-input novels-sort">
          <option v-for="o in SORT_OPTIONS" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>
        <button class="desktop-btn" :disabled="loading" @click="refresh"><Icon name="refresh" :size="14" /></button>
        <button class="desktop-btn desktop-btn--primary" @click="openCreate"><Icon name="plus" :size="16" /> 新建</button>
      </div>
    </div>

    <StateView :loading="loading && !data" :error="stateError" :error-message="errorMessage" :empty="!!data && filteredNovels.length === 0" @retry="refresh">
      <template #loading>
        <div class="novel-grid">
          <div v-for="i in 6" :key="i" class="desktop-card--skeleton" style="height:280px;border-radius:16px" />
        </div>
      </template>
      <template #empty>
        <p class="nw-state__title">{{ novels.length === 0 ? '还没有作品' : '没有匹配的作品' }}</p>
        <p class="nw-state__desc">{{ novels.length === 0 ? '点击「新建」开始你的第一本。' : '换个筛选或搜索词试试' }}</p>
        <button v-if="novels.length === 0" class="desktop-btn desktop-btn--primary" @click="openCreate"><Icon name="plus" :size="16" /> 新建作品</button>
      </template>

      <div class="novel-grid">
        <article v-for="n in filteredNovels" :key="n.id" class="novel-card" @click="open(n.id)">
          <div class="novel-card-cover">
            <img
              v-if="coverOf(n) && !coverFailed.has(n.id)"
              :src="coverOf(n)"
              class="novel-card-img"
              loading="lazy"
              @error="onCoverError(n.id)"
            />
            <span v-else class="novel-card-fallback">{{ n.title.slice(0, 1) }}</span>
            <span class="novel-card-status">{{ STATUS_LABELS[n.status] || n.status }}</span>
          </div>
          <div class="novel-card-body">
            <h3 class="novel-card-title">{{ n.title }}</h3>
            <div class="novel-card-meta">
              <span class="nw-tag">{{ GENRE_LABELS[n.genre] || n.genre }}</span>
              <span><Icon name="bookOpen" :size="12" /> {{ n.chapterCount || 0 }} 章</span>
              <span class="desktop-card-meta-dot" />
              <span><Icon name="pen" :size="12" /> {{ fmt(n.wordCount || 0) }} 字</span>
            </div>
            <p v-if="n.synopsis" class="novel-card-synopsis">{{ n.synopsis }}</p>
            <div class="novel-card-foot">
              <span><Icon name="refresh" :size="11" /> {{ fmtDate(n.updatedAt) }}</span>
              <span v-if="n.targetChapters" class="novel-card-progress">
                {{ Math.min(Math.round(((n.chapterCount ?? 0) / n.targetChapters) * 100), 100) }}%
              </span>
            </div>
          </div>
        </article>
      </div>
    </StateView>
  </div>
</template>
