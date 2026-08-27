<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { RefreshRight, ArrowLeft } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { useTrendsMaster } from '../composables/useTrendsMaster';
import { useAuthStore } from '../stores/auth';
import { useThemeMode } from '../composables/useThemeMode';
import type { TrendsRecommendation, TrendsPlatformAnalysis, TrendsHistoryEntry } from '../api/trends';
import '../styles/mobile-trends.css';

const router = useRouter();
const authStore = useAuthStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const { isAdmin } = storeToRefs(authStore);
const {
  loading,
  refreshing,
  hasData,
  platforms,
  overallTrends,
  recommendations,
  lastUpdated,
  parseFailed,
  history,
  loadLatest,
  refresh,
} = useTrendsMaster();

const MAX_VISIBLE_RECS = 3;
const MAX_VISIBLE_PLATFORMS = 3;
const MAX_VISIBLE_HISTORY = 5;
const MAX_GENRE_ITEMS = 5;
const TOP_RANK_THRESHOLD = 3;

const showAllRecs = ref(false);
const showAllPlatforms = ref(false);

const heroStats = computed(() => [
  { label: '热门类型', value: overallTrends.value?.hotGenres?.length ?? 0 },
  { label: '新兴主题', value: overallTrends.value?.emergingThemes?.length ?? 0 },
  { label: '写作建议', value: recommendations.value.length },
]);

const visibleRecs = computed(() =>
  showAllRecs.value ? recommendations.value : recommendations.value.slice(0, MAX_VISIBLE_RECS),
);

const visiblePlatforms = computed(() =>
  showAllPlatforms.value ? platforms.value : platforms.value.slice(0, MAX_VISIBLE_PLATFORMS),
);

const visibleHistory = computed(() => history.value.slice(0, MAX_VISIBLE_HISTORY));

const updatedLabel = computed(() => {
  if (!lastUpdated.value) return '暂无数据';
  const d = new Date(lastUpdated.value);
  if (Number.isNaN(d.getTime())) return '未知';
  const now = Date.now();
  const diffHours = Math.floor((now - d.getTime()) / 3_600_000);
  if (diffHours < 1) return '刚刚更新';
  if (diffHours < 24) return `${diffHours} 小时前`;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' 更新';
});

const isStale = computed(() => {
  if (!lastUpdated.value) return true;
  const d = new Date(lastUpdated.value);
  return Date.now() - d.getTime() > 86_400_000;
});

function getTrendLabel(trend: string): string {
  const map: Record<string, string> = { rising: '上升', stable: '稳定', declining: '下降' };
  return map[trend] ?? trend;
}

function getConfidenceLabel(level: TrendsRecommendation['confidenceLevel']): string {
  const map: Record<string, string> = { high: '高', medium: '中', low: '低' };
  return map[level] ?? level;
}

function formatHistoryDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

function goBack() {
  void router.push('/m/app');
}
</script>

<template>
  <div class="mobile-trends-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar title="热点报告" subtitle="全网创作风向">
        <template #leading>
          <button class="mobile-focus-button--ghost" type="button" @click="goBack">
            <el-icon :size="18"><ArrowLeft /></el-icon>
          </button>
        </template>
        <template #actions>
          <button
            v-if="isAdmin"
            class="mobile-focus-button--secondary"
            type="button"
            :disabled="refreshing"
            @click="refresh"
          >
            <el-icon :size="14"><RefreshRight /></el-icon>
            {{ refreshing ? '分析中' : '刷新' }}
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-me-main mobile-focus-main">
        <!-- Loading -->
        <MobileSectionCard v-if="loading && !hasData" kicker="Loading" hero>
          <el-skeleton animated :rows="6" />
        </MobileSectionCard>

        <!-- Empty -->
        <MobileSectionCard v-else-if="!hasData" kicker="Trends" hero>
          <div class="mobile-focus-empty">
            <strong>暂无趋势数据</strong>
            <p>点击右上角"刷新"按钮获取最新全网热点分析。</p>
          </div>
        </MobileSectionCard>

        <!-- Hero: Overview -->
        <template v-if="hasData">
          <MobileSectionCard kicker="Overview" hero class="mobile-trends-hero">
            <h1 style="margin: 0; font-size: clamp(22px, 6vw, 28px); line-height: 1.15; letter-spacing: -0.02em;">
              全网创作风向
            </h1>
            <div class="mobile-trends-updated">
              <span class="mobile-trends-updated__dot" :class="{ 'mobile-trends-updated__dot--stale': isStale }" />
              {{ updatedLabel }}
            </div>
            <MobileStatGroup :items="heroStats" />
          </MobileSectionCard>

          <!-- Hot Genres & Themes -->
          <MobileSectionCard kicker="Trending" title="热门类型 & 主题">
            <div v-if="overallTrends?.hotGenres?.length" class="mobile-trends-tags">
              <span
                v-for="genre in overallTrends.hotGenres"
                :key="genre"
                class="mobile-trends-tag mobile-trends-tag--hot"
              >
                {{ genre }}
              </span>
            </div>

            <div v-if="overallTrends?.emergingThemes?.length" style="margin-top: 4px;">
              <p class="mobile-focus-note" style="margin-bottom: 6px;">新兴主题</p>
              <div class="mobile-trends-tags">
                <span
                  v-for="theme in overallTrends.emergingThemes"
                  :key="theme"
                  class="mobile-trends-tag mobile-trends-tag--emerging"
                >
                  {{ theme }}
                </span>
              </div>
            </div>

            <div v-if="overallTrends?.decliningThemes?.length" style="margin-top: 4px;">
              <p class="mobile-focus-note" style="margin-bottom: 6px;">退热中</p>
              <div class="mobile-trends-tags">
                <span
                  v-for="theme in overallTrends.decliningThemes"
                  :key="theme"
                  class="mobile-trends-tag mobile-trends-tag--declining"
                >
                  {{ theme }}
                </span>
              </div>
            </div>
          </MobileSectionCard>

          <!-- Market Insight -->
          <MobileSectionCard
            v-if="overallTrends?.marketInsight"
            kicker="Insight"
            title="市场洞察"
          >
            <div class="mobile-trends-insight" :class="{ 'mobile-trends-insight--error': parseFailed }">
              <p>{{ overallTrends.marketInsight }}</p>
              <button
                v-if="parseFailed && isAdmin"
                class="mobile-focus-button--secondary mobile-trends-retry-btn"
                type="button"
                :disabled="refreshing"
                @click="refresh"
              >
                <el-icon :size="14"><RefreshRight /></el-icon>
                {{ refreshing ? '分析中' : '重新分析' }}
              </button>
            </div>
            <div v-if="overallTrends.crossPlatformTrends?.length" class="mobile-trends-tags" style="margin-top: 4px;">
              <span
                v-for="trend in overallTrends.crossPlatformTrends"
                :key="trend"
                class="mobile-trends-tag mobile-trends-tag--rising"
              >
                {{ trend }}
              </span>
            </div>
          </MobileSectionCard>

          <!-- Writing Recommendations -->
          <MobileSectionCard
            v-if="recommendations.length"
            kicker="For You"
            title="写作建议"
            :hint="`基于全网热点生成 ${recommendations.length} 条创作灵感`"
          >
            <div class="mobile-focus-list">
              <article
                v-for="rec in visibleRecs"
                :key="rec.title"
                class="mobile-trends-rec"
              >
                <div class="mobile-trends-rec__head">
                  <strong>{{ rec.title }}</strong>
                  <span
                    class="mobile-trends-rec__confidence"
                    :class="`mobile-trends-rec__confidence--${rec.confidenceLevel}`"
                  >
                    {{ getConfidenceLabel(rec.confidenceLevel) }}
                  </span>
                </div>
                <div class="mobile-trends-rec__meta">
                  <span class="mobile-focus-tag mobile-focus-tag--sky">{{ rec.genre }}</span>
                  <span class="mobile-focus-tag mobile-focus-tag--ink">{{ rec.targetPlatform }}</span>
                  <span
                    v-for="t in rec.themes.slice(0, 2)"
                    :key="t"
                    class="mobile-focus-tag mobile-focus-tag--teal"
                  >
                    {{ t }}
                  </span>
                </div>
                <p class="mobile-trends-rec__reasoning">{{ rec.reasoning }}</p>
                <blockquote v-if="rec.storyHook" class="mobile-trends-rec__hook">
                  {{ rec.storyHook }}
                </blockquote>
              </article>
            </div>
            <button
              v-if="recommendations.length > MAX_VISIBLE_RECS"
              class="mobile-focus-button--ghost"
              type="button"
              style="justify-self: center;"
              @click="showAllRecs = !showAllRecs"
            >
              {{ showAllRecs ? '收起' : `查看全部 ${recommendations.length} 条` }}
            </button>
          </MobileSectionCard>

          <!-- Platform Breakdown -->
          <MobileSectionCard
            v-if="platforms.length"
            kicker="Platforms"
            title="平台解析"
          >
            <div class="mobile-focus-list">
              <article
                v-for="pf in visiblePlatforms"
                :key="pf.platform"
                class="mobile-trends-platform"
              >
                <div class="mobile-trends-platform__head">
                  <strong>{{ pf.platformName }}</strong>
                  <span>{{ pf.topGenres.length }} 个热门类型</span>
                </div>

                <div v-if="pf.topGenres.length" class="mobile-trends-genre-list">
                  <div
                    v-for="(g, idx) in pf.topGenres.slice(0, MAX_GENRE_ITEMS)"
                    :key="g.genre"
                    class="mobile-trends-genre-item"
                  >
                    <span
                      class="mobile-trends-genre-item__rank"
                      :class="{ 'mobile-trends-genre-item__rank--top': idx < TOP_RANK_THRESHOLD }"
                    >
                      {{ g.rank }}
                    </span>
                    <span class="mobile-trends-genre-item__name">{{ g.genre }}</span>
                    <span
                      class="mobile-trends-genre-item__trend"
                      :class="`mobile-trends-genre-item__trend--${g.trend}`"
                    >
                      {{ getTrendLabel(g.trend) }}
                    </span>
                  </div>
                </div>

                <p v-if="pf.keyInsight" class="mobile-trends-platform__insight">
                  {{ pf.keyInsight }}
                </p>
              </article>
            </div>
            <button
              v-if="platforms.length > MAX_VISIBLE_PLATFORMS"
              class="mobile-focus-button--ghost"
              type="button"
              style="justify-self: center;"
              @click="showAllPlatforms = !showAllPlatforms"
            >
              {{ showAllPlatforms ? '收起' : `查看全部 ${platforms.length} 个平台` }}
            </button>
          </MobileSectionCard>

          <!-- History -->
          <MobileSectionCard
            v-if="visibleHistory.length"
            kicker="History"
            title="历史报告"
          >
            <div class="mobile-focus-list">
              <div
                v-for="entry in visibleHistory"
                :key="entry.date"
                class="mobile-trends-history-item"
              >
                <div class="mobile-trends-history-item__info">
                  <span class="mobile-trends-history-item__date">{{ formatHistoryDate(entry.date) }}</span>
                  <span class="mobile-trends-history-item__summary">
                    {{ entry.hotGenres.slice(0, 3).join('、') || '暂无' }}
                  </span>
                </div>
                <span class="mobile-trends-history-item__count">{{ entry.recommendationCount }} 建议</span>
              </div>
            </div>
          </MobileSectionCard>
        </template>
      </main>
    </div>

    <MobileWorkbenchDock />
  </div>
</template>
