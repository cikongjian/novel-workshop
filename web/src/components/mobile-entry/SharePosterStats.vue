<script setup lang="ts">
import { computed } from 'vue';
import type { PosterStats } from '../../composables/useSharePoster';
import { CHANNEL_LABELS } from '../../composables/useSharePoster';

const props = defineProps<{
  stats: PosterStats | null;
  loading: boolean;
}>();

const conversionRate = computed(() => {
  if (!props.stats || props.stats.totalViews === 0) return 0;
  return Math.round((props.stats.totalReads / props.stats.totalViews) * 100);
});

const channelList = computed(() => {
  if (!props.stats) return [];
  return Object.entries(props.stats.channelStats)
    .map(([key, count]) => ({
      key,
      label: CHANNEL_LABELS[key] || key,
      count,
      percent: props.stats!.totalViews > 0 ? Math.round((count / props.stats!.totalViews) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
});

const deviceList = computed(() => {
  if (!props.stats) return [];
  return Object.entries(props.stats.deviceStats)
    .map(([key, count]) => ({
      key,
      label: key === 'mobile' ? '手机' : key === 'desktop' ? '电脑' : key,
      count,
      percent: props.stats!.totalViews > 0 ? Math.round((count / props.stats!.totalViews) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
});

const dailyList = computed(() => {
  if (!props.stats) return [];
  return Object.entries(props.stats.dailyStats)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7); // 最近7天
});

const maxDailyCount = computed(() => {
  if (!dailyList.value.length) return 1;
  return Math.max(...dailyList.value.map((d) => d.count), 1);
});

function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}月${day}日 ${hh}:${mm}`;
}

function formatDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}
</script>

<template>
  <div class="poster-stats">
    <div class="poster-stats__header">
      <span class="poster-stats__title">推广数据</span>
      <button
        v-if="!loading"
        class="poster-stats__refresh"
        type="button"
        title="刷新"
        @click="$emit('refresh')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
      </button>
    </div>

    <div v-if="loading" class="poster-stats__loading">加载中...</div>

    <div v-else-if="!stats || stats.totalViews === 0" class="poster-stats__empty">
      暂无访问数据，分享海报后这里会显示统计
    </div>

    <template v-else>
      <!-- 核心指标 -->
      <div class="poster-stats__metrics">
        <div class="poster-stats__metric">
          <strong>{{ stats.totalViews }}</strong>
          <span>总浏览</span>
        </div>
        <div class="poster-stats__metric">
          <strong>{{ stats.uniqueVisitors }}</strong>
          <span>访客数</span>
        </div>
        <div class="poster-stats__metric">
          <strong>{{ stats.totalReads }}</strong>
          <span>阅读点击</span>
        </div>
        <div class="poster-stats__metric poster-stats__metric--highlight">
          <strong>{{ conversionRate }}%</strong>
          <span>转化率</span>
        </div>
      </div>

      <!-- 渠道分布 -->
      <div v-if="channelList.length" class="poster-stats__section">
        <h4>渠道来源</h4>
        <div class="poster-stats__bars">
          <div v-for="ch in channelList" :key="ch.key" class="poster-stats__bar-row">
            <span class="poster-stats__bar-label">{{ ch.label }}</span>
            <div class="poster-stats__bar-track">
              <div class="poster-stats__bar-fill" :style="{ width: ch.percent + '%' }" />
            </div>
            <span class="poster-stats__bar-count">{{ ch.count }}</span>
          </div>
        </div>
      </div>

      <!-- 设备分布 -->
      <div v-if="deviceList.length" class="poster-stats__section">
        <h4>访问设备</h4>
        <div class="poster-stats__bars">
          <div v-for="dev in deviceList" :key="dev.key" class="poster-stats__bar-row">
            <span class="poster-stats__bar-label">{{ dev.label }}</span>
            <div class="poster-stats__bar-track">
              <div class="poster-stats__bar-fill poster-stats__bar-fill--device" :style="{ width: dev.percent + '%' }" />
            </div>
            <span class="poster-stats__bar-count">{{ dev.count }}</span>
          </div>
        </div>
      </div>

      <!-- 近7天趋势 -->
      <div v-if="dailyList.length" class="poster-stats__section">
        <h4>近7天访问趋势</h4>
        <div class="poster-stats__chart">
          <div
            v-for="day in dailyList"
            :key="day.date"
            class="poster-stats__chart-col"
          >
            <div class="poster-stats__chart-bar-wrap">
              <div
                class="poster-stats__chart-bar"
                :style="{ height: Math.max((day.count / maxDailyCount) * 100, 4) + '%' }"
                :title="`${day.count} 次`"
              />
            </div>
            <span class="poster-stats__chart-label">{{ formatDate(day.date) }}</span>
            <span class="poster-stats__chart-count">{{ day.count }}</span>
          </div>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="poster-stats__footer">
        <span>首次访问：{{ formatTime(stats.firstViewAt) }}</span>
        <span>最近访问：{{ formatTime(stats.lastViewAt) }}</span>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
export default { name: 'SharePosterStats' };
</script>

<style scoped>
/* 全部固定色值 */
.poster-stats {
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 14px 16px;
  max-height: 280px;
  overflow-y: auto;
}

.poster-stats__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.poster-stats__title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 1px;
}

.poster-stats__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
}

.poster-stats__loading,
.poster-stats__empty {
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  padding: 16px 0;
}

/* 核心指标 */
.poster-stats__metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.poster-stats__metric {
  text-align: center;
  padding: 10px 4px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.poster-stats__metric strong {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}

.poster-stats__metric span {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 2px;
}

.poster-stats__metric--highlight {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08));
  border-color: rgba(99, 102, 241, 0.2);
}

.poster-stats__metric--highlight strong {
  color: #6366f1;
}

/* 区块 */
.poster-stats__section {
  margin-bottom: 14px;
}

.poster-stats__section h4 {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

/* 条形图 */
.poster-stats__bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poster-stats__bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.poster-stats__bar-label {
  width: 56px;
  font-size: 11px;
  color: #475569;
  flex-shrink: 0;
}

.poster-stats__bar-track {
  flex: 1;
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.poster-stats__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  border-radius: 4px;
  transition: width 0.3s;
}

.poster-stats__bar-fill--device {
  background: linear-gradient(90deg, #0ea5e9, #06b6d4);
}

.poster-stats__bar-count {
  width: 28px;
  font-size: 11px;
  color: #64748b;
  text-align: right;
  flex-shrink: 0;
}

/* 柱状图 */
.poster-stats__chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 80px;
  padding: 4px 0;
}

.poster-stats__chart-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
}

.poster-stats__chart-bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.poster-stats__chart-bar {
  width: 70%;
  min-height: 3px;
  background: linear-gradient(180deg, #818cf8, #6366f1);
  border-radius: 4px 4px 0 0;
  transition: height 0.3s;
}

.poster-stats__chart-label {
  font-size: 9px;
  color: #94a3b8;
  white-space: nowrap;
}

.poster-stats__chart-count {
  font-size: 10px;
  color: #475569;
  font-weight: 500;
}

/* 底部信息 */
.poster-stats__footer {
  display: flex;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  font-size: 10px;
  color: #94a3b8;
}
</style>
