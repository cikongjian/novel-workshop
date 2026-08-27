<script setup lang="ts">
/**
 * 桌面端·数据分析（书城数据洞察）
 * 真实数据 → KPI 大卡 + 分类柱状图 + 环形占比 + 阅读量排行 + 点赞收藏排行 + 活跃作品榜
 */
import { computed } from 'vue';
import { useAsyncData } from '../../composables/useAsyncData';
import { extractApiErrorMessage, isAbortError } from '../../api/errors';
import { getBookStoreList } from '../../api/bookstore';
import type { BookStore, BookStoreListResponse } from '../../api/types';
import type { EChartsOption } from 'echarts';
import StateView from '../../components/shared/StateView.vue';
import NwChart from '../../components/shared/NwChart.vue';
import Icon from '../../components/shared/Icon.vue';

const PALETTE = ['#6366f1', '#a855f7', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
const AXIS_LABEL = '#64748b';
const SPLIT_LINE = 'rgba(148,163,184,0.2)';

const { data, loading, error, run } = useAsyncData<BookStoreListResponse<BookStore>, []>(
  () => getBookStoreList({ page: 1, pageSize: 100 }),
  { immediate: true },
);

const errorMessage = computed(() => {
  if (!error.value || isAbortError(error.value)) return '';
  return extractApiErrorMessage(error.value);
});
const stateError = computed(() => (errorMessage.value ? error.value : null));
const books = computed<BookStore[]>(() => data.value?.items ?? []);
const totalBooks = computed(() => data.value?.total ?? books.value.length);

// KPI 汇总
const totalViews = computed(() => books.value.reduce((s, b) => s + (b.viewCount || 0), 0));
const totalLikes = computed(() => books.value.reduce((s, b) => s + (b.likeCount || 0), 0));
const totalFavorites = computed(() => books.value.reduce((s, b) => s + (b.favoriteCount || 0), 0));
const totalComments = computed(() => books.value.reduce((s, b) => s + (b.commentCount || 0), 0));

// 分类统计
const categoryStats = computed(() => {
  const map = new Map<string, { count: number; views: number; likes: number }>();
  for (const b of books.value) {
    const c = b.category || '未分类';
    const cur = map.get(c) ?? { count: 0, views: 0, likes: 0 };
    cur.count++;
    cur.views += b.viewCount || 0;
    cur.likes += b.likeCount || 0;
    map.set(c, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.count - a.count);
});

// 排行榜
const topByViews = computed(() =>
  [...books.value].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 8),
);

const topByLikes = computed(() =>
  [...books.value].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)).slice(0, 5),
);

const topByFavorites = computed(() =>
  [...books.value].sort((a, b) => (b.favoriteCount || 0) - (a.favoriteCount || 0)).slice(0, 5),
);

// 分类柱状图（作品数 + 阅读量双轴）
const categoryBarOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 16, right: 48, top: 32, bottom: 8, containLabel: true },
  legend: {
    top: 0,
    right: 0,
    textStyle: { color: AXIS_LABEL, fontSize: 11 },
    itemWidth: 12,
    itemHeight: 8,
  },
  xAxis: {
    type: 'category',
    data: categoryStats.value.map((c) => c.label),
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    axisLabel: { color: AXIS_LABEL, fontSize: 11, interval: 0 },
  },
  yAxis: [
    {
      type: 'value',
      name: '作品数',
      minInterval: 1,
      splitLine: { lineStyle: { color: SPLIT_LINE } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
      nameTextStyle: { color: AXIS_LABEL, fontSize: 10, padding: [0, 0, 0, -12] },
    },
    {
      type: 'value',
      name: '阅读量',
      splitLine: { show: false },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
      nameTextStyle: { color: AXIS_LABEL, fontSize: 10, padding: [0, -12, 0, 0] },
    },
  ],
  series: [
    {
      name: '作品数',
      type: 'bar',
      data: categoryStats.value.map((c) => c.count),
      barMaxWidth: 28,
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#818cf8' },
            { offset: 1, color: '#6366f1' },
          ],
        },
      },
    },
    {
      name: '阅读量',
      type: 'line',
      yAxisIndex: 1,
      data: categoryStats.value.map((c) => c.views),
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2, color: '#a855f7' },
      itemStyle: { color: '#a855f7', borderWidth: 2, borderColor: '#fff' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(168, 85, 247, 0.25)' },
            { offset: 1, color: 'rgba(168, 85, 247, 0.02)' },
          ],
        },
      },
    },
  ],
}));

// 环形占比
const categoryDonutOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item', formatter: '{b}: {c} 本 ({d}%)' },
  legend: {
    orient: 'vertical',
    right: 8,
    top: 'center',
    textStyle: { color: AXIS_LABEL, fontSize: 11 },
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 8,
  },
  series: [
    {
      type: 'pie',
      radius: ['52%', '78%'],
      center: ['36%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
      label: {
        show: true,
        position: 'center',
        formatter: '{totalBooks|' + totalBooks.value + '}\n{totalLabel|作品总数}',
        rich: {
          totalBooks: {
            fontSize: 28,
            fontWeight: 800,
            color: '#6366f1',
            lineHeight: 36,
          },
          totalLabel: {
            fontSize: 12,
            color: AXIS_LABEL,
            lineHeight: 18,
          },
        },
      },
      emphasis: {
        scale: true,
        scaleSize: 6,
        label: { show: true },
      },
      data: categoryStats.value.map((c) => ({ name: c.label, value: c.count })),
      color: PALETTE,
    },
  ],
}));

// 阅读量横向排行
const topViewsOption = computed<EChartsOption>(() => {
  const items = [...topByViews.value].reverse();
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 16, right: 40, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: SPLIT_LINE } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
    },
    yAxis: {
      type: 'category',
      data: items.map((b) => b.title.length > 10 ? b.title.slice(0, 10) + '…' : b.title),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: AXIS_LABEL, fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: items.map((b, i) => ({
          value: b.viewCount || 0,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: PALETTE[i % PALETTE.length] + '40' },
                { offset: 1, color: PALETTE[i % PALETTE.length] },
              ],
            },
          },
        })),
        barMaxWidth: 20,
        label: {
          show: true,
          position: 'right',
          color: AXIS_LABEL,
          fontSize: 11,
          formatter: (p: any) => p.value >= 10000 ? (p.value / 10000).toFixed(1) + '万' : p.value,
        },
      },
    ],
  };
});

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
  return n.toLocaleString();
}

function refresh(): void {
  void run();
}
</script>

<template>
  <div class="analytics-page">
    <!-- 顶部 Hero -->
    <section class="da-hero">
      <div class="da-hero__bg">
        <div class="da-hero__glow da-hero__glow--1"></div>
        <div class="da-hero__glow da-hero__glow--2"></div>
        <div class="da-hero__grid"></div>
      </div>
      <div class="da-hero__content">
        <div class="da-hero__left">
          <div class="da-hero__badge">
            <Icon name="pieChart" :size="14" />
            数据洞察
          </div>
          <h1 class="da-hero__title">
            <span class="da-hero__title-accent">书城数据</span>
            <span class="da-hero__title-sub">全景分析</span>
          </h1>
          <p class="da-hero__subtitle">实时掌握作品表现、读者偏好与分类趋势</p>
        </div>
        <div class="da-hero__actions">
          <button class="da-refresh-btn" :disabled="loading" @click="refresh">
            <Icon name="refresh" :size="14" :class="{ 'is-spin': loading }" />
            {{ loading ? '刷新中' : '刷新数据' }}
          </button>
        </div>
      </div>
    </section>

    <StateView :loading="loading && !data" :error="stateError" :error-message="errorMessage" @retry="refresh">
      <template #loading>
        <div class="da-skeleton-grid">
          <div class="da-skeleton-card" v-for="i in 4" :key="i"></div>
        </div>
      </template>

      <!-- KPI 大卡 -->
      <div class="da-kpi-grid">
        <div class="da-kpi da-kpi--views">
          <div class="da-kpi__icon">
            <Icon name="eye" :size="20" />
          </div>
          <div class="da-kpi__info">
            <span class="da-kpi__value">{{ fmtNum(totalViews) }}</span>
            <span class="da-kpi__label">总阅读量</span>
          </div>
          <div class="da-kpi__deco"></div>
        </div>
        <div class="da-kpi da-kpi--likes">
          <div class="da-kpi__icon">
            <Icon name="heart" :size="20" />
          </div>
          <div class="da-kpi__info">
            <span class="da-kpi__value">{{ fmtNum(totalLikes) }}</span>
            <span class="da-kpi__label">总点赞数</span>
          </div>
          <div class="da-kpi__deco"></div>
        </div>
        <div class="da-kpi da-kpi--favs">
          <div class="da-kpi__icon">
            <Icon name="bookmark" :size="20" />
          </div>
          <div class="da-kpi__info">
            <span class="da-kpi__value">{{ fmtNum(totalFavorites) }}</span>
            <span class="da-kpi__label">总收藏数</span>
          </div>
          <div class="da-kpi__deco"></div>
        </div>
        <div class="da-kpi da-kpi--comments">
          <div class="da-kpi__icon">
            <Icon name="messageCircle" :size="20" />
          </div>
          <div class="da-kpi__info">
            <span class="da-kpi__value">{{ fmtNum(totalComments) }}</span>
            <span class="da-kpi__label">总评论数</span>
          </div>
          <div class="da-kpi__deco"></div>
        </div>
      </div>

      <!-- 第一行：分类分析 -->
      <div class="da-chart-row">
        <div class="da-card da-chart-card">
          <div class="da-card__head">
            <div class="da-card__icon da-card__icon--indigo">
              <Icon name="barChart" :size="16" />
            </div>
            <div>
              <h3 class="da-card__title">分类作品与阅读分析</h3>
              <p class="da-card__subtitle">各分类作品数量与对应阅读量趋势</p>
            </div>
          </div>
          <div class="da-chart-body"><NwChart :option="categoryBarOption" height="280px" /></div>
        </div>

        <div class="da-card da-chart-card">
          <div class="da-card__head">
            <div class="da-card__icon da-card__icon--purple">
              <Icon name="pieChart" :size="16" />
            </div>
            <div>
              <h3 class="da-card__title">分类占比分布</h3>
              <p class="da-card__subtitle">各分类作品数量占比</p>
            </div>
          </div>
          <div class="da-chart-body"><NwChart :option="categoryDonutOption" height="280px" /></div>
        </div>
      </div>

      <!-- 第二行：排行榜 -->
      <div class="da-chart-row">
        <div class="da-card da-rank-card">
          <div class="da-card__head">
            <div class="da-card__icon da-card__icon--blue">
              <Icon name="trendingUp" :size="16" />
            </div>
            <div>
              <h3 class="da-card__title">阅读量排行榜</h3>
              <p class="da-card__subtitle">全作品阅读量 Top 8</p>
            </div>
          </div>
          <div class="da-chart-body"><NwChart :option="topViewsOption" height="320px" /></div>
        </div>

        <div class="da-card da-list-card">
          <div class="da-card__head">
            <div class="da-card__icon da-card__icon--pink">
              <Icon name="heart" :size="16" />
            </div>
            <div>
              <h3 class="da-card__title">互动榜单</h3>
              <p class="da-card__subtitle">点赞与收藏 Top 5</p>
            </div>
          </div>

          <div class="da-list-section">
            <div class="da-list-section__head">
              <span class="da-list-section__title">点赞榜</span>
            </div>
            <div class="da-list">
              <div
                v-for="(book, i) in topByLikes"
                :key="'like-' + book.id"
                class="da-list-item"
              >
                <span class="da-list-rank" :class="{ 'is-top': i < 3 }">{{ i + 1 }}</span>
                <span class="da-list-name">{{ book.title }}</span>
                <span class="da-list-value">{{ fmtNum(book.likeCount || 0) }}</span>
              </div>
            </div>
          </div>

          <div class="da-list-divider"></div>

          <div class="da-list-section">
            <div class="da-list-section__head">
              <span class="da-list-section__title">收藏榜</span>
            </div>
            <div class="da-list">
              <div
                v-for="(book, i) in topByFavorites"
                :key="'fav-' + book.id"
                class="da-list-item"
              >
                <span class="da-list-rank" :class="{ 'is-top': i < 3 }">{{ i + 1 }}</span>
                <span class="da-list-name">{{ book.title }}</span>
                <span class="da-list-value">{{ fmtNum(book.favoriteCount || 0) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 分类明细 -->
      <div class="da-card">
        <div class="da-card__head">
          <div class="da-card__icon da-card__icon--green">
            <Icon name="layers" :size="16" />
          </div>
          <div>
            <h3 class="da-card__title">分类明细</h3>
            <p class="da-card__subtitle">各分类作品数、阅读量、点赞数一览</p>
          </div>
        </div>

        <div class="da-category-grid">
          <div
            v-for="(cat, i) in categoryStats"
            :key="cat.label"
            class="da-category-card"
            :style="{ '--cat-accent': PALETTE[i % PALETTE.length] }"
          >
            <div class="da-category-card__head">
              <span class="da-category-card__name">{{ cat.label }}</span>
              <span class="da-category-card__count">{{ cat.count }} 本</span>
            </div>
            <div class="da-category-card__stats">
              <div class="da-category-stat">
                <Icon name="eye" :size="12" />
                <span>{{ fmtNum(cat.views) }}</span>
              </div>
              <div class="da-category-stat">
                <Icon name="heart" :size="12" />
                <span>{{ fmtNum(cat.likes) }}</span>
              </div>
            </div>
            <div class="da-category-card__bar">
              <div
                class="da-category-card__bar-fill"
                :style="{
                  width: Math.max(6, (cat.count / Math.max(...categoryStats.map(c => c.count), 1)) * 100) + '%',
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </StateView>
  </div>
</template>

<style scoped>
.analytics-page {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

/* Hero */
.da-hero {
  position: relative;
  border-radius: var(--nw-radius-xl);
  overflow: hidden;
  padding: var(--nw-space-6) var(--nw-space-8);
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
}

.da-hero__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.da-hero__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.12;
}

.da-hero__glow--1 {
  width: 350px;
  height: 350px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  top: -120px;
  right: 15%;
  animation: daFloat 8s ease-in-out infinite;
}

.da-hero__glow--2 {
  width: 280px;
  height: 280px;
  background: linear-gradient(135deg, #0ea5e9, #14b8a6);
  bottom: -100px;
  left: 20%;
  opacity: 0.08;
  filter: blur(60px);
  animation: daFloat 11s ease-in-out infinite reverse;
}

@keyframes daFloat {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-15px) scale(1.05); }
}

.da-hero__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.06) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

.da-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-6);
}

.da-hero__left {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
  min-width: 0;
  flex: 1;
}

.da-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-accent-start) 10%, transparent), color-mix(in srgb, var(--nw-accent-end) 8%, transparent));
  color: var(--nw-accent-start);
  font-size: 12px;
  font-weight: 600;
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--nw-accent-start) 20%, transparent);
}

:global(html.dark) .da-hero__badge {
  color: var(--nw-accent-end);
}

.da-hero__title {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  line-height: 1.2;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.da-hero__title-accent {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.da-hero__title-sub {
  font-size: 16px;
  color: var(--nw-text-primary);
  font-weight: 600;
}

.da-hero__subtitle {
  font-size: 13px;
  color: var(--nw-text-muted);
  margin: 0;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.da-refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--nw-radius-lg);
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.da-refresh-btn:hover:not(:disabled) {
  border-color: #6366f1;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.06);
}

.da-refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.is-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Skeleton */
.da-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-4);
}

.da-skeleton-card {
  height: 100px;
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-xl);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* KPI Cards */
.da-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-4);
}

.da-kpi {
  position: relative;
  padding: var(--nw-space-5);
  border-radius: var(--nw-radius-lg);
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  display: flex;
  align-items: center;
  gap: var(--nw-space-4);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.da-kpi:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -8px rgba(99, 102, 241, 0.15);
}

.da-kpi__icon {
  width: 48px;
  height: 48px;
  border-radius: var(--nw-radius-lg);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
}

.da-kpi--views .da-kpi__icon {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.da-kpi--likes .da-kpi__icon {
  background: linear-gradient(135deg, #f472b6, #ec4899);
  box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
}

.da-kpi--favs .da-kpi__icon {
  background: linear-gradient(135deg, #a78bfa, #8b5cf6);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}

.da-kpi--comments .da-kpi__icon {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.da-kpi__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.da-kpi__value {
  font-size: 26px;
  font-weight: 800;
  color: var(--nw-text-primary);
  line-height: 1;
}

.da-kpi__label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.da-kpi__deco {
  position: absolute;
  top: -20px;
  right: -20px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  opacity: 0.06;
}

.da-kpi--views .da-kpi__deco {
  background: #3b82f6;
}
.da-kpi--likes .da-kpi__deco {
  background: #ec4899;
}
.da-kpi--favs .da-kpi__deco {
  background: #8b5cf6;
}
.da-kpi--comments .da-kpi__deco {
  background: #10b981;
}

/* Card */
.da-card {
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-lg);
  padding: var(--nw-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.da-card__head {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.da-card__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--nw-radius-md);
  display: grid;
  place-items: center;
  color: #fff;
  flex-shrink: 0;
}

.da-card__icon--indigo {
  background: linear-gradient(135deg, #818cf8, #6366f1);
}
.da-card__icon--purple {
  background: linear-gradient(135deg, #c084fc, #a855f7);
}
.da-card__icon--blue {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
}
.da-card__icon--pink {
  background: linear-gradient(135deg, #f472b6, #ec4899);
}
.da-card__icon--green {
  background: linear-gradient(135deg, #34d399, #10b981);
}

.da-card__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
}

.da-card__subtitle {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin: 2px 0 0 0;
}

/* Chart rows */
.da-chart-row {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: var(--nw-space-5);
}

.da-chart-row:nth-of-type(2) {
  grid-template-columns: 1.2fr 1fr;
}

.da-chart-body {
  width: 100%;
}

/* Rank list card */
.da-list-card {
  display: flex;
  flex-direction: column;
}

.da-list-section {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
}

.da-list-section__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.da-list-section__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}

.da-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.da-list-item {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: 8px 10px;
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  transition: background 0.2s;
}

.da-list-item:hover {
  background: color-mix(in srgb, var(--nw-accent-start) 5%, var(--nw-bg-secondary));
}

.da-list-rank {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--nw-text-muted);
  flex-shrink: 0;
}

.da-list-rank.is-top {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border: none;
  color: #fff;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
}

.da-list-name {
  flex: 1;
  font-size: 13px;
  color: var(--nw-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.da-list-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  flex-shrink: 0;
}

.da-list-divider {
  height: 1px;
  background: var(--nw-border);
  margin: var(--nw-space-2) 0;
}

/* Category grid */
.da-category-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-3);
}

.da-category-card {
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-lg);
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
  transition: all 0.2s;
}

.da-category-card:hover {
  border-color: var(--cat-accent);
  transform: translateY(-1px);
}

.da-category-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.da-category-card__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--cat-accent);
}

.da-category-card__count {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.da-category-card__stats {
  display: flex;
  gap: var(--nw-space-4);
}

.da-category-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--nw-text-secondary);
}

.da-category-card__bar {
  height: 4px;
  border-radius: 999px;
  background: var(--nw-border);
  overflow: hidden;
  margin-top: 2px;
}

.da-category-card__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--cat-accent), color-mix(in srgb, var(--cat-accent) 60%, #fff));
  transition: width 0.6s ease;
}
</style>
