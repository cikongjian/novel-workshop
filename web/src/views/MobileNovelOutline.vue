<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Reading } from '@element-plus/icons-vue';
import MobileActionRow from '../components/mobile-focus/MobileActionRow.vue';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { fetchNovel } from '../api/novels';
import { fetchOutline } from '../api/outline';
import { PLOT_THREAD_STATUS_LABELS, STATUS_LABELS, type NovelMetadata, type OutlineData, type PlotThreadStatus } from '../types';
import { useThemeMode } from '../composables/useThemeMode';

type OutlineAction = {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: unknown;
};

const route = useRoute();
const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const novel = ref<NovelMetadata | null>(null);
const outline = ref<OutlineData>({ chapters: [], plotThreads: [], foreshadowing: [] });

const novelId = computed(() => String(route.params.id || ''));
const recentOutlineChapters = computed(() => outline.value.chapters.slice(0, 6));
const activeThreads = computed(() => outline.value.plotThreads.filter((item) => item.status !== 'resolved').slice(0, 6));
const activeForeshadowing = computed(() => outline.value.foreshadowing.filter((item) => !item.isResolved).slice(0, 6));
const heroStats = computed(() => [
  { label: '大纲章节', value: outline.value.chapters.length },
  { label: '主线/支线', value: outline.value.plotThreads.length },
  { label: '伏笔', value: outline.value.foreshadowing.length },
]);

const actions = computed<OutlineAction[]>(() => {
  if (!novelId.value) return [];
  return [
    {
      id: 'chapters',
      title: '回章节中心',
      description: '继续切换章节、预览内容或直接开始阅读。',
      route: `/m/novel/${novelId.value}/chapters`,
      icon: Reading,
    },
  ];
});

function navigate(path: string) {
  void router.push(path);
}

function formatNovelStatus(status?: NovelMetadata['status']): string {
  if (!status) return '--';
  return STATUS_LABELS[status] ?? status;
}
function formatPlotThreadStatus(status: PlotThreadStatus): string {
  return PLOT_THREAD_STATUS_LABELS[status] ?? status;
}
function getTensionTone(tension: number): string {
  if (tension >= 8) return 'mobile-focus-tag--gold';
  if (tension >= 5) return 'mobile-focus-tag--sky';
  return 'mobile-focus-tag--ink';
}
function getThreadTone(status: PlotThreadStatus): string {
  switch (status) {
    case 'climax':
      return 'mobile-focus-tag--gold';
    case 'developing':
      return 'mobile-focus-tag--sky';
    case 'resolved':
      return 'mobile-focus-tag--teal';
    case 'abandoned':
      return 'mobile-focus-tag--ink';
    case 'planted':
    default:
      return 'mobile-focus-tag--ink';
  }
}
function getForeshadowingPriorityTone(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high':
      return 'mobile-focus-tag--gold';
    case 'medium':
      return 'mobile-focus-tag--sky';
    case 'low':
    default:
      return 'mobile-focus-tag--ink';
  }
}
function formatForeshadowingPriority(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high':
      return '高优先';
    case 'medium':
      return '中优先';
    case 'low':
    default:
      return '低优先';
  }
}

async function loadData() {
  if (!novelId.value) return;
  loading.value = true;
  try {
    const [novelData, outlineData] = await Promise.all([
      fetchNovel(novelId.value),
      fetchOutline(novelId.value),
    ]);
    novel.value = novelData;
    outline.value = outlineData;
  } catch {
    novel.value = null;
    outline.value = { chapters: [], plotThreads: [], foreshadowing: [] };
  } finally {
    loading.value = false;
  }
}

watch(novelId, () => {
  void loadData();
}, { immediate: true });
</script>

<template>
  <div class="mobile-novel-outline-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar title="大纲预览" subtitle="结构速览" :brand-size="28">
        <template #leading>
          <button class="mobile-focus-button--secondary" type="button" @click="navigate(`/m/novel/${novelId}`)">
            返回详情
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-novel-outline-main mobile-focus-main">
        <MobileSectionCard kicker="Outline Snapshot" hero class="mobile-novel-outline-hero">
          <h1>{{ novel?.title || '当前作品' }}</h1>
          <p class="mobile-focus-note">先看章节规划、主线和伏笔密度，再决定下一步回章节中心继续推进。</p>

          <MobileStatGroup :items="heroStats" />

          <div class="mobile-focus-meta">
            <span class="mobile-focus-tag mobile-focus-tag--sky">{{ formatNovelStatus(novel?.status) }}</span>
            <span class="mobile-focus-tag mobile-focus-tag--sky">{{ novel?.chapterCount || 0 }} 实际章节</span>
            <span class="mobile-focus-tag mobile-focus-tag--sky">{{ (novel?.wordCount || 0).toLocaleString() }} 字</span>
          </div>

          <div class="mobile-focus-actions">
            <MobileActionRow
              v-for="item in actions"
              :key="item.id"
              class="mobile-novel-outline-action"
              :title="item.title"
              :description="item.description"
              :icon="item.icon"
              accent="sky"
              @click="navigate(item.route)"
            />
          </div>
        </MobileSectionCard>

        <MobileSectionCard kicker="Chapters" title="前几章结构" class="mobile-novel-outline-panel">
          <div v-if="loading" class="mobile-novel-outline-loading mobile-focus-loading">
            <el-skeleton animated :rows="6" />
          </div>

          <div v-else-if="recentOutlineChapters.length" class="mobile-focus-list">
            <article v-for="chapter in recentOutlineChapters" :key="chapter.chapterNumber" class="mobile-novel-outline-card mobile-focus-item">
              <div class="mobile-focus-item__top">
                <strong>第 {{ chapter.chapterNumber }} 章 · {{ chapter.title }}</strong>
                <span class="mobile-focus-tag" :class="getTensionTone(chapter.tensionTarget)">
                  张力 {{ chapter.tensionTarget }}
                </span>
              </div>
              <p class="mobile-novel-outline-card__summary">{{ chapter.summary || '当前章节大纲还没有摘要。' }}</p>
              <div class="mobile-focus-item__meta">
                <span>{{ chapter.beats.length }} 个场景节拍</span>
                <span>{{ chapter.plotThreadsAdvanced.length }} 条主线推进</span>
              </div>
            </article>
          </div>

          <div v-else class="mobile-focus-empty">
            <strong>还没有章节大纲</strong>
            <p>当前作品还没有形成可浏览的大纲结构，建议先回章节中心生成内容后再来看。</p>
          </div>
        </MobileSectionCard>

        <section class="mobile-novel-outline-grid">
          <MobileSectionCard kicker="Threads" title="进行中的主线" class="mobile-novel-outline-panel">
            <div v-if="activeThreads.length" class="mobile-focus-list">
              <article v-for="thread in activeThreads" :key="thread.id" class="mobile-novel-outline-card mobile-focus-item">
                <div class="mobile-focus-item__top">
                  <strong>{{ thread.name }}</strong>
                  <span class="mobile-focus-tag" :class="getThreadTone(thread.status)">
                    {{ formatPlotThreadStatus(thread.status) }}
                  </span>
                </div>
                <p class="mobile-novel-outline-card__summary">{{ thread.description || thread.notes || '当前主线还没有补充说明。' }}</p>
                <div class="mobile-focus-item__meta">
                  <span v-if="thread.plantedInChapter">埋点第 {{ thread.plantedInChapter }} 章</span>
                  <span>{{ thread.relatedCharacters.length }} 个关联角色</span>
                </div>
              </article>
            </div>

            <div v-else class="mobile-focus-empty">
              <strong>没有进行中的主线</strong>
              <p>大纲里暂时没有可展示的主线推进。</p>
            </div>
          </MobileSectionCard>

          <MobileSectionCard kicker="Foreshadowing" title="未回收伏笔" class="mobile-novel-outline-panel">
            <div v-if="activeForeshadowing.length" class="mobile-focus-list">
              <article v-for="item in activeForeshadowing" :key="item.id" class="mobile-novel-outline-card mobile-focus-item">
                <div class="mobile-focus-item__top">
                  <strong>第 {{ item.plantedInChapter }} 章埋点</strong>
                  <span class="mobile-focus-tag" :class="getForeshadowingPriorityTone(item.priority)">
                    {{ formatForeshadowingPriority(item.priority) }}
                  </span>
                </div>
                <p class="mobile-novel-outline-card__summary">{{ item.hint }}</p>
                <div class="mobile-focus-item__meta">
                  <span>{{ item.relatedPlotThreads.length }} 条关联主线</span>
                </div>
              </article>
            </div>

            <div v-else class="mobile-focus-empty">
              <strong>没有未回收伏笔</strong>
              <p>当前伏笔可能已收束，或尚未建立伏笔追踪。</p>
            </div>
          </MobileSectionCard>
        </section>
      </main>
    </div>

    <MobileWorkbenchDock />
  </div>
</template>

<style scoped src="../styles/mobile-novel-outline.css"></style>
