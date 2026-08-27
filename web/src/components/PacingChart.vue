<script setup lang="ts">
import { computed } from 'vue';
import type { ChapterPacing, PacingProfile } from '../types';

const props = defineProps<{
  pacing: ChapterPacing[];
  currentChapter?: number;
}>();

const LABELS: Record<keyof PacingProfile, string> = {
  dialogue: '对话',
  action: '动作',
  description: '描写',
  psychology: '心理',
  narration: '叙述',
};

const COLORS: Record<keyof PacingProfile, string> = {
  dialogue: '#409eff',
  action: '#f56c6c',
  description: '#67c23a',
  psychology: '#e6a23c',
  narration: '#909399',
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
  <div class="pacing-chart">
    <!-- 当前章节雷达式条形图 -->
    <div v-if="currentPacing" class="pacing-current">
      <div v-for="key in keys" :key="key" class="pacing-bar-row">
        <span class="pacing-label">{{ LABELS[key] }}</span>
        <div class="pacing-bar-track">
          <div
            class="pacing-bar-fill"
            :style="{ width: pct(currentPacing.profile[key]), backgroundColor: COLORS[key] }"
          />
        </div>
        <span class="pacing-value">{{ pct(currentPacing.profile[key]) }}</span>
      </div>
      <div v-if="currentPacing.monotonyWarning" class="pacing-warning">
        <el-tag type="warning" size="small">节奏单调</el-tag>
        <span>与上一章节奏高度相似，建议调整</span>
      </div>
    </div>
    <div v-else class="pacing-empty">
      暂无节奏数据（定稿后自动生成）
    </div>
  </div>
</template>

<style scoped>
.pacing-chart {
  padding: 4px 0;
}
.pacing-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pacing-label {
  width: 32px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.pacing-bar-track {
  flex: 1;
  height: 14px;
  background: var(--el-fill-color-lighter);
  border-radius: 7px;
  overflow: hidden;
}
.pacing-bar-fill {
  height: 100%;
  border-radius: 7px;
  transition: width 0.3s ease;
  min-width: 2px;
}
.pacing-value {
  width: 36px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: right;
  flex-shrink: 0;
}
.pacing-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-warning);
}
.pacing-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 12px 0;
}
</style>
