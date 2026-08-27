<script setup lang="ts">
import { computed } from 'vue';
import type { ChapterPacing, PacingProfile } from '../types';

const props = defineProps<{
  pacing: ChapterPacing[];
  currentChapter?: number;
  compact?: boolean;
}>();

const LABELS: Record<keyof PacingProfile, string> = {
  dialogue: '对话',
  action: '动作',
  description: '描写',
  psychology: '心理',
  narration: '叙述',
};

const COLORS: Record<keyof PacingProfile, string> = {
  dialogue: '#3b82f6',
  action: '#ef4444',
  description: '#22c55e',
  psychology: '#f59e0b',
  narration: '#6b7280',
};

const currentPacing = computed(() => {
  if (!props.currentChapter) return null;
  return props.pacing.find(p => p.chapterNumber === props.currentChapter) ?? null;
});

const keys: (keyof PacingProfile)[] = ['dialogue', 'action', 'description', 'psychology', 'narration'];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
</script>

<template>
  <div class="mpc-chart" :class="{ 'mpc-chart--compact': compact }">
    <div v-if="currentPacing" class="mpc-current">
      <div v-for="key in keys" :key="key" class="mpc-bar-row">
        <span class="mpc-label">{{ LABELS[key] }}</span>
        <div class="mpc-bar-track">
          <div
            class="mpc-bar-fill"
            :style="{ width: pct(currentPacing.profile[key]), backgroundColor: COLORS[key] }"
          />
        </div>
        <span v-if="!compact" class="mpc-value">{{ pct(currentPacing.profile[key]) }}</span>
      </div>
      <div v-if="currentPacing.monotonyWarning && !compact" class="mpc-warning">
        <span class="mpc-warning-tag">节奏偏单调</span>
        <span>与上一章相似，建议调整节奏</span>
      </div>
      <div v-if="compact && currentPacing.dominantType" class="mpc-dominant">
        主 {{ LABELS[currentPacing.dominantType as keyof PacingProfile] || currentPacing.dominantType }}
      </div>
    </div>
    <div v-else class="mpc-empty">
      {{ compact ? '无数据' : '暂无节奏数据（定稿后自动生成）' }}
    </div>
  </div>
</template>

<style scoped>
.mpc-chart {
  padding: 8px 0;
}

.mpc-chart--compact {
  padding: 4px 0;
}

.mpc-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.mpc-chart--compact .mpc-bar-row {
  margin-bottom: 3px;
}

.mpc-label {
  width: 28px;
  font-size: 11px;
  font-weight: 500;
  color: var(--nw-text-secondary, #555);
  flex-shrink: 0;
}

.mpc-chart--compact .mpc-label {
  width: 24px;
  font-size: 10px;
}

.mpc-bar-track {
  flex: 1;
  height: 10px;
  background: color-mix(in srgb, var(--nw-border, #eee) 50%, transparent);
  border-radius: 5px;
  overflow: hidden;
}

.mpc-chart--compact .mpc-bar-track {
  height: 6px;
}

.mpc-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.4s ease;
  min-width: 3px;
}

.mpc-value {
  width: 32px;
  font-size: 10px;
  font-weight: 500;
  color: var(--nw-text-muted, #999);
  text-align: right;
  flex-shrink: 0;
}

.mpc-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, #f59e0b 10%, transparent);
  font-size: 11px;
  color: #b45309;
}

.mpc-warning-tag {
  padding: 2px 6px;
  border-radius: 4px;
  background: #f59e0b;
  color: #fff;
  font-weight: 600;
}

.mpc-dominant {
  margin-top: 4px;
  font-size: 10px;
  color: var(--nw-text-muted, #999);
}

.mpc-empty {
  font-size: 11px;
  color: var(--nw-text-muted, #999);
  text-align: center;
  padding: 8px 0;
}

.mpc-chart--compact .mpc-empty {
  padding: 4px 0;
  font-size: 10px;
}
</style>