<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  FolderOpened,
  Plus,
  ShoppingCart,
  UploadFilled,
  TrendCharts,
  User,
} from '@element-plus/icons-vue';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { usePullRefresh } from '../composables/usePullRefresh';
import { fetchNovelSummaries, getCoverUrl } from '../api/novels';
import { useAuthStore } from '../stores/auth';
import { useThemeMode } from '../composables/useThemeMode';
import { STATUS_LABELS, type NovelMetadata } from '../types';
import { getNovelConstitutionTagLabels } from '../config/novel-constitution-tags';
import { getGreeting } from '../utils/greeting-slogan';

type MobileShortcut = {
  id: string;
  title: string;
  subtitle: string;
  route?: string;
  action?: 'create';
  icon: unknown;
  accent: 'sky' | 'teal' | 'gold' | 'violet' | 'ink';
};

const router = useRouter();
const authStore = useAuthStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const novels = ref<NovelMetadata[]>([]);

const shortcuts: MobileShortcut[] = [
  {
    id: 'create',
    title: '开新书',
    subtitle: '新作品',
    action: 'create',
    icon: Plus,
    accent: 'sky',
  },
  {
    id: 'bookstore',
    title: '逛书城',
    subtitle: '看趋势',
    route: '/m',
    icon: ShoppingCart,
    accent: 'gold',
  },
  {
    id: 'library',
    title: '作品库',
    subtitle: '管理作品',
    route: '/m/novels',
    icon: FolderOpened,
    accent: 'teal',
  },
  {
    id: 'publish',
    title: '发布管理',
    subtitle: '书城运营',
    route: '/m/my-published',
    icon: UploadFilled,
    accent: 'violet',
  },
  {
    id: 'stats',
    title: '分析',
    subtitle: '写作数据',
    route: '/m/writer-stats',
    icon: TrendCharts,
    accent: 'ink',
  },
];

const recentNovels = computed(() => novels.value.slice(0, 4));
const currentUserName = computed(() => authStore.user?.penName || authStore.user?.username || '创作者');
// 欢迎标语（headline + 小标语 note）按时段 + 按天轮换，进入工作台时计算一次（重新挂载会刷新）
const greeting = getGreeting();
const heroStats = computed(() => [
  { label: '作品总数', value: novels.value.length },
  { label: '连载中', value: novels.value.filter((item) => item.status === 'writing').length },
]);

function formatStatus(status: NovelMetadata['status']): string {
  return STATUS_LABELS[status] ?? status;
}

function navigate(path: string) {
  void router.push(path);
}

function openCreate(_seedIdea?: unknown) {
  void router.push('/m/fate');
}

function openNovel(novelId: string) {
  void router.push(`/m/novel/${novelId}`);
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

async function loadData() {
  if (!authStore.user?.id) return;

  loading.value = true;
  try {
    const novelList = await fetchNovelSummaries();
    novels.value = novelList.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
    );
  } catch {
    novels.value = [];
  } finally {
    loading.value = false;
  }
}

function handleShortcut(item: MobileShortcut) {
  if (item.action === 'create') {
    openCreate();
    return;
  }
  if (item.route) navigate(item.route);
}

const { pullDistance, refreshing, triggered, pullContainerRef, refresh } = usePullRefresh({
  onRefresh: () => loadData(),
});

onMounted(async () => {
  await loadData();
});
</script>

<template>
  <div ref="pullContainerRef" class="mobile-app-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
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
    <div class="mobile-app-shell mobile-focus-shell">
      <MobileTopbar title="工作台" subtitle="创作中枢" :brand-size="32">
        <template #actions>
          <button class="mobile-app-header__profile mobile-focus-button--secondary" type="button" @click="navigate('/m/me')">
            <el-icon :size="14"><User /></el-icon>
            我的
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-app-main mobile-focus-main">
        <MobileSectionCard kicker="Workspace" hero class="mobile-app-hero">
          <h1>{{ currentUserName }}，{{ greeting.headline }}</h1>
          <p class="mobile-focus-note">{{ greeting.note }}</p>

          <MobileStatGroup :items="heroStats" />

          <div class="mobile-app-shortcuts" aria-label="工作台快捷入口">
            <button
              v-for="item in shortcuts"
              :key="item.id"
              class="mobile-app-shortcut"
              :class="`accent-${item.accent}`"
              type="button"
              @click="handleShortcut(item)"
            >
              <span class="mobile-app-shortcut__icon">
                <el-icon :size="22">
                  <component :is="item.icon" />
                </el-icon>
              </span>
              <strong>{{ item.title }}</strong>
              <span>{{ item.subtitle }}</span>
            </button>
          </div>
        </MobileSectionCard>

        <MobileSectionCard kicker="Recent" title="最近在写" hint="接着上次的进度继续" class="mobile-app-panel">
          <div v-if="loading" class="mobile-app-loading mobile-focus-loading">
            <el-skeleton animated :rows="4" />
          </div>

          <div v-else-if="recentNovels.length" class="mobile-focus-list">
            <button
              v-for="novel in recentNovels"
              :key="novel.id"
              class="mobile-app-novel mobile-focus-book-card mobile-focus-item mobile-focus-item--clickable"
              type="button"
              @click="openNovel(novel.id)"
            >
              <div class="mobile-app-novel__cover mobile-focus-book-card__cover">
                <img v-if="getNovelCoverUrl(novel)" :src="getNovelCoverUrl(novel)!" :alt="novel.title" />
                <div v-else class="mobile-app-novel__cover-fallback mobile-focus-book-card__cover-fallback">
                  <span>{{ getNovelCoverFallback(novel) }}</span>
                </div>
              </div>
              <div class="mobile-app-novel__content mobile-focus-book-card__content">
                <div class="mobile-focus-item__top">
                  <strong>{{ novel.title }}</strong>
                  <span>{{ formatStatus(novel.status) }}</span>
                </div>
                <p>{{ novel.synopsis || novel.description || '点击进入，继续你的故事' }}</p>
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
            <strong>你的第一个故事还在等你</strong>
            <p>每个大神都从第一章开始，现在就动笔吧。</p>
            <button class="mobile-focus-button--primary" type="button" @click="openCreate">
              开始创作
            </button>
          </div>
        </MobileSectionCard>

      </main>
    </div>

    <MobileWorkbenchDock />
  </div>
</template>

<style scoped>
.mobile-app-page {
  --mobile-focus-accent: var(--star-brand-sky);
  --mobile-focus-accent-strong: var(--star-brand-teal);
  --mobile-focus-tint: color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent);
}

.mobile-app-header__brand {
  overflow: hidden;
}

.mobile-app-header__profile {
  white-space: nowrap;
}

.mobile-app-hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent), transparent 34%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--nw-bg-secondary) 96%, transparent),
      color-mix(in srgb, var(--mobile-focus-accent) 4%, var(--nw-bg-card))
    );
}

.mobile-app-hero :deep(.mobile-focus-metrics) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mobile-app-shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
  gap: 8px;
}

.mobile-app-shortcut {
  min-width: 0;
  min-height: 86px;
  padding: 8px 4px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--nw-text-primary);
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 5px;
  text-align: center;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}

.mobile-app-shortcut:active {
  transform: scale(0.96);
  background: color-mix(in srgb, var(--nw-text-primary) 4%, transparent);
}

.mobile-app-shortcut__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 15px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--nw-bg-secondary) 72%, transparent),
    0 10px 22px color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
}

.mobile-app-shortcut strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.15;
  font-weight: 700;
}

.mobile-app-shortcut span:not(.mobile-app-shortcut__icon) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  line-height: 1.1;
  color: var(--nw-text-muted);
}

.mobile-app-shortcut.accent-sky .mobile-app-shortcut__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-sky) 13%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-sky) 88%, var(--nw-text-primary));
}

.mobile-app-shortcut.accent-teal .mobile-app-shortcut__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-teal) 13%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-teal) 88%, var(--nw-text-primary));
}

.mobile-app-shortcut.accent-gold .mobile-app-shortcut__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 13%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 82%, var(--nw-text-primary));
}

.mobile-app-shortcut.accent-violet .mobile-app-shortcut__icon {
  background: color-mix(in srgb, var(--nw-accent-start) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--nw-accent-start) 86%, var(--nw-text-primary));
}

.mobile-app-shortcut.accent-ink .mobile-app-shortcut__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-ink) 8%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-ink) 88%, var(--nw-text-primary));
}

@media (max-width: 420px) {
  .mobile-app-shortcuts {
    grid-template-columns: repeat(5, 72px);
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-app-shortcuts::-webkit-scrollbar {
    display: none;
  }
}

@media (max-width: 360px) {
  .mobile-app-hero {
    padding-inline: 14px;
  }
}
</style>
