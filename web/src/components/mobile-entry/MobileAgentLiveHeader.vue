<script setup lang="ts">
import { computed } from 'vue';
import type { AgentLiveFeed, PipelineKind } from '../../composables/useAgentLiveFeed';

const props = defineProps<{
  feed: AgentLiveFeed;
  chapterNumber: number;
}>();

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const progressRatio = computed(() => {
  if (props.feed.totalCount === 0) return 0;
  return props.feed.completedCount / props.feed.totalCount;
});
const dashOffset = computed(() => CIRCUMFERENCE * (1 - progressRatio.value));
const progressPercent = computed(() => Math.round(progressRatio.value * 100));

const headline = computed(() => {
  if (props.feed.failureMessage) return '生成遇到问题';
  if (props.feed.pendingStart) return '任务已提交，正在拉起第一个 Agent';
  if (props.feed.nodes.length === 0) return '等待管线启动…';
  if (!props.feed.isGenerating && props.feed.completedCount === props.feed.totalCount) {
    return '本轮管线已完成';
  }
  if (props.feed.activeRole) {
    return `${props.feed.nodes.find((n) => n.role === props.feed.activeRole)?.label ?? 'Agent'} 正在工作`;
  }
  return '准备中…';
});

const PIPELINE_KIND_LABEL: Record<PipelineKind, string> = {
  unknown: '生成管线',
  chapter: '章节管线',
  'shuangwen-blueprint': '爽文成书',
  'shuangwen-chapter': '爽文章节',
  'short-story': '短篇管线',
  revision: '修订管线',
  'finalize-full': '定稿管线',
  'batch-revision': '批量修订',
  rebirth: '重生提取',
};
</script>

<template>
  <header class="mobile-live-header">
    <div class="mobile-live-header__ring" :style="{ '--ring-offset': dashOffset + 'px' }">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="mobile-live-header__ring-track" cx="22" cy="22" :r="RADIUS" fill="none" stroke-width="3" />
        <circle
          class="mobile-live-header__ring-progress"
          cx="22"
          cy="22"
          :r="RADIUS"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
          transform="rotate(-90 22 22)"
        />
        <defs>
          <linearGradient id="mobile-live-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop class="mobile-live-header__ring-stop--from" offset="0%" />
            <stop class="mobile-live-header__ring-stop--to" offset="100%" />
          </linearGradient>
        </defs>
      </svg>
      <div class="mobile-live-header__ring-text">
        <strong>{{ progressPercent }}<small>%</small></strong>
        <span>{{ feed.completedCount }}/{{ feed.totalCount }}</span>
      </div>
    </div>

    <div class="mobile-live-header__body">
      <div class="mobile-live-header__title-row">
        <strong>第 {{ chapterNumber }} 章生成中</strong>
        <span class="mobile-live-header__layout-tag">{{ PIPELINE_KIND_LABEL[feed.pipelineKind] }}</span>
      </div>
      <p class="mobile-live-header__headline">{{ headline }}</p>
      <div class="mobile-live-header__meta">
        <span v-if="feed.failureMessage" class="mobile-live-header__chip mobile-live-header__chip--danger">
          {{ feed.failureMessage }}
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.mobile-live-header {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.mobile-live-header__ring {
  position: relative;
  width: 56px;
  height: 56px;
}

.mobile-live-header__ring svg {
  width: 100%;
  height: 100%;
}

.mobile-live-header__ring circle:last-of-type {
  transition: stroke-dashoffset 0.5s ease-out;
}

.mobile-live-header__ring-track {
  stroke: color-mix(in srgb, var(--nw-border) 72%, transparent);
}

.mobile-live-header__ring-progress {
  stroke: url("#mobile-live-ring-gradient");
}

.mobile-live-header__ring-stop--from {
  stop-color: var(--mobile-focus-accent);
}

.mobile-live-header__ring-stop--to {
  stop-color: var(--mobile-focus-accent-strong);
}

.mobile-live-header__ring-text {
  position: absolute;
  inset: 0;
  display: grid;
  justify-items: center;
  align-content: center;
  line-height: 1;
}

.mobile-live-header__ring-text strong {
  font-size: 15px;
  font-weight: 800;
  color: var(--nw-text-primary);
}

.mobile-live-header__ring-text strong small {
  font-size: 9px;
  font-weight: 700;
  color: var(--nw-text-muted);
  margin-left: 1px;
}

.mobile-live-header__ring-text span {
  font-size: 10px;
  color: var(--nw-text-muted);
  margin-top: 2px;
}

.mobile-live-header__body {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.mobile-live-header__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mobile-live-header__title-row strong {
  font-size: 16px;
  font-weight: 700;
  color: var(--nw-text-primary);
  line-height: 1.3;
}

.mobile-live-header__layout-tag {
  font-size: 10px;
  font-weight: 700;
  color: var(--nw-text-secondary);
  background: color-mix(in srgb, var(--nw-border) 46%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0;
}

.mobile-live-header__headline {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mobile-live-header__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.mobile-live-header__chip {
  font-size: 10px;
  font-weight: 600;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0;
}

.mobile-live-header__chip--ink {
  color: var(--nw-text-secondary);
  background: color-mix(in srgb, var(--nw-border) 42%, transparent);
}

.mobile-live-header__chip--danger {
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 88%, var(--nw-text-primary));
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 12%, var(--nw-bg-secondary));
}
</style>
