<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, RefreshRight } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { fetchNovelSummaries, getCoverUrl } from '../api/novels';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useThemeMode } from '../composables/useThemeMode';
import { extractApiErrorMessage } from '../utils/api-error';
import { STATUS_LABELS, type NovelMetadata, type NovelStatus } from '../types';
import { getNovelConstitutionTagLabels } from '../config/novel-constitution-tags';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const loadError = ref(false);
const novels = ref<NovelMetadata[]>([]);
const search = ref('');
const debouncedSearch = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, (val) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    debouncedSearch.value = val;
  }, 200);
});
const activeStatus = ref<NovelStatus | 'all'>('all');

const statusFilters: Array<{ label: string; value: NovelStatus | 'all' }> = [
  { label: '全部', value: 'all' },
  { label: '构思中', value: 'planning' },
  { label: '连载中', value: 'writing' },
  { label: '暂停', value: 'paused' },
  { label: '完结', value: 'completed' },
  { label: '已发布', value: 'published' },
];

const filteredNovels = computed(() => {
  const keyword = debouncedSearch.value.trim().toLowerCase();
  return novels.value.filter((novel) => {
    const matchesStatus = activeStatus.value === 'all' || novel.status === activeStatus.value;
    if (!matchesStatus) return false;
    if (!keyword) return true;
    return [novel.title, novel.synopsis, novel.description].some((field) =>
      (field || '').toLowerCase().includes(keyword),
    );
  });
});

const stats = computed(() => ({
  total: novels.value.length,
  writing: novels.value.filter((item) => item.status === 'writing').length,
  completed: novels.value.filter((item) => item.status === 'completed' || item.status === 'published').length,
}));

const heroStats = computed(() => [
  { label: '全部作品', value: stats.value.total },
  { label: '连载中', value: stats.value.writing },
  { label: '完结与发布', value: stats.value.completed },
]);

function formatStatus(status: NovelMetadata['status']): string {
  return STATUS_LABELS[status] ?? status;
}

const MOBILE_THUMB_WIDTH = 400;

function getNovelCoverUrl(novel: NovelMetadata): string | null {
  if (!novel.coverImage) return null;
  return getCoverUrl(novel.id, novel.coverImage || novel.updatedAt || novel.createdAt, MOBILE_THUMB_WIDTH);
}

function getNovelCoverFallback(novel: NovelMetadata): string {
  const firstChar = novel.title?.trim().charAt(0);
  return firstChar || '书';
}

function openNovel(id: string) {
  void router.push(`/m/novel/${id}`);
}

function openCreate() {
  void router.push('/m/fate');
}

async function loadNovels() {
  loading.value = true;
  loadError.value = false;
  try {
    novels.value = (await fetchNovelSummaries()).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
    );
  } catch (err) {
    loadError.value = true;
    ElMessage.error(extractApiErrorMessage(err, '作品加载失败，请下拉刷新重试'));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadNovels();
});

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: () => loadNovels(),
});
</script>

<template>
  <div ref="pullContainerRef" class="mobile-novels-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
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
      <MobileTopbar title="作品库" subtitle="我的作品">
        <template #actions>
          <button class="mobile-focus-button--primary" type="button" @click="openCreate">
            <el-icon :size="14"><Plus /></el-icon>
            开书
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-novels-main mobile-focus-main">
        <MobileSectionCard kicker="Library" hero class="mobile-novels-hero">
          <h1>继续你的创作</h1>
          <p class="mobile-focus-note">接上灵感，把故事写下去。</p>
          <MobileStatGroup :items="heroStats" />
        </MobileSectionCard>

        <MobileSectionCard kicker="Filter" title="筛选" class="mobile-novels-panel">
          <div class="mobile-focus-searchbar">
            <input v-model="search" class="mobile-focus-input" type="text" placeholder="搜书名、简介，或者记得的一句设定" />
            <button class="mobile-focus-button--secondary" type="button" :disabled="loading" @click="loadNovels">
              <el-icon :size="14" :class="{ 'is-loading': loading }"><RefreshRight /></el-icon>
              刷新
            </button>
          </div>

          <div class="mobile-focus-chip-row">
            <button
              v-for="item in statusFilters"
              :key="item.value"
              class="mobile-focus-chip"
              :class="{ active: activeStatus === item.value }"
              type="button"
              @click="activeStatus = item.value"
            >
              {{ item.label }}
            </button>
          </div>
        </MobileSectionCard>

        <MobileSectionCard kicker="Results" :title="`${filteredNovels.length} 本作品`" class="mobile-novels-panel">
          <template #actions>
            <button class="mobile-focus-button--ghost" type="button" @click="activeStatus = 'all'; search = ''">
              清空
            </button>
          </template>

          <div v-if="loading" class="mobile-novels-loading mobile-focus-loading">
            <el-skeleton animated :rows="5" />
          </div>

          <div v-else-if="loadError && novels.length === 0" class="mobile-focus-empty">
            <strong>作品加载失败</strong>
            <p>网络好像开了点小差，重试一下就好了。</p>
            <button class="mobile-focus-button--primary" type="button" @click="loadNovels">
              重新加载
            </button>
          </div>

          <div v-else-if="filteredNovels.length" class="mobile-focus-list">
            <button
              v-for="novel in filteredNovels"
              :key="novel.id"
              class="mobile-novels-card mobile-focus-book-card mobile-focus-item mobile-focus-item--clickable"
              type="button"
              @click="openNovel(novel.id)"
            >
              <div class="mobile-novels-card__cover mobile-focus-book-card__cover">
                <img v-if="getNovelCoverUrl(novel)" :src="getNovelCoverUrl(novel)!" :alt="novel.title" loading="lazy" />
                <div v-else class="mobile-novels-card__cover-fallback mobile-focus-book-card__cover-fallback">
                  <span>{{ getNovelCoverFallback(novel) }}</span>
                </div>
              </div>

              <div class="mobile-novels-card__content mobile-focus-book-card__content">
                <div class="mobile-focus-item__top">
                  <strong>{{ novel.title }}</strong>
                  <span>{{ formatStatus(novel.status) }}</span>
                </div>
                <p>{{ novel.synopsis || novel.description || '从这里接着写剧情、补设定，或者先回看一下你已经写到哪里。' }}</p>
                <div v-if="getNovelConstitutionTagLabels(novel.constitutionTags).length" class="mobile-focus-item__meta">
                  <span
                    v-for="tag in getNovelConstitutionTagLabels(novel.constitutionTags).slice(0, 2)"
                    :key="`${novel.id}-${tag}`"
                  >{{ tag }}</span>
                </div>
                <div class="mobile-focus-item__meta">
                  <span>{{ novel.chapterCount || 0 }} 章</span>
                  <span>{{ (novel.wordCount || 0).toLocaleString() }} 字</span>
                </div>
              </div>
            </button>
          </div>

          <div v-else class="mobile-focus-empty">
            <strong>没有匹配的作品</strong>
            <p>换个筛选试试，或者直接开新书。</p>
            <button class="mobile-focus-button--primary" type="button" @click="openCreate">
              去开书
            </button>
          </div>
        </MobileSectionCard>
      </main>
    </div>

    <MobileCreateNovelSheet v-model="createSheetVisible" @created-detail="handleCreatedDetail" />

    <MobileWorkbenchDock />
  </div>
</template>

<style scoped>
.mobile-novels-page {
  --mobile-focus-accent: var(--star-brand-teal);
  --mobile-focus-accent-strong: var(--star-brand-sky);
  --mobile-focus-tint: color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent);
}

.mobile-novels-header__brand {
  overflow: hidden;
}

.mobile-novels-card {
  width: 100%;
  text-align: left;
  background: color-mix(in srgb, var(--nw-bg-card) 92%, transparent);
}

</style>
