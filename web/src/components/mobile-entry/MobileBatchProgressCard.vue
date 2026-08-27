<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  progress: number;
  running: boolean;
  finalizing: boolean;
  currentChapterNumber: number | null;
  currentIndex: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
  activeAgentLabel: string;
  progressDescription: string;
  estimatedRemaining?: string | null;
  finalizeSucceeded?: number;
  finalizeFailed?: number;
  canCancel?: boolean;
  canRetry?: boolean;
  canClear?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  retry: [];
  clear: [];
}>();

const title = computed(() => {
  if (props.finalizing) return '批量定稿中';
  if (props.running) return '批量生成中';
  if (props.totalCount > 0) return '批量任务已完成';
  return '暂无批量任务';
});

const chapterLabel = computed(() => {
  if (props.finalizing) return '正在收尾';
  if (props.currentChapterNumber != null) return `第 ${props.currentChapterNumber} 章`;
  if (props.totalCount > 0) return '等待下一次启动';
  return '未开始';
});

const summaryText = computed(() => {
  if (props.finalizing) {
    const succeeded = props.finalizeSucceeded ?? 0;
    const failed = props.finalizeFailed ?? 0;
    return `${succeeded}/${props.totalCount || succeeded} 已定稿${failed > 0 ? `，失败 ${failed}` : ''}`;
  }
  if (props.totalCount === 0) return '可以直接发起新的批量章节任务。';
  return `${props.completedCount}/${props.totalCount} 已完成，失败 ${props.failedCount}，当前序号 ${Math.max(props.currentIndex, props.completedCount)}/${props.totalCount}`;
});
</script>

<template>
  <section class="mobile-batch-progress-card">
    <div class="mobile-batch-progress-card__top">
      <div class="mobile-batch-progress-card__title">
        <span class="mobile-batch-progress-card__eyebrow">Batch</span>
        <strong>{{ title }}</strong>
        <p>{{ chapterLabel }}</p>
      </div>

      <div class="mobile-batch-progress-card__meta">
        <span class="mobile-focus-tag" :class="running || finalizing ? 'mobile-focus-tag--sky' : 'mobile-focus-tag--teal'">
          {{ progress }}%
        </span>
        <span v-if="estimatedRemaining && running" class="mobile-focus-tag mobile-focus-tag--ink">
          预计 {{ estimatedRemaining }}
        </span>
      </div>
    </div>

    <div class="mobile-batch-progress-card__bar">
      <div class="mobile-batch-progress-card__fill" :style="{ width: `${progress}%` }" />
    </div>

    <div class="mobile-batch-progress-card__stats">
      <span>总计 {{ totalCount }} 章</span>
      <span>完成 {{ completedCount }}</span>
      <span>失败 {{ failedCount }}</span>
      <span v-if="finalizing">定稿 {{ finalizeSucceeded ?? 0 }}</span>
    </div>

    <div class="mobile-batch-progress-card__stage">
      <strong>{{ activeAgentLabel || (finalizing ? '定稿流程' : '写作助手') }}</strong>
      <p>{{ summaryText }}</p>
      <p class="mobile-batch-progress-card__description">{{ progressDescription }}</p>
    </div>

    <div v-if="canCancel || canRetry || canClear" class="mobile-batch-progress-card__actions">
      <button
        v-if="canCancel"
        class="mobile-focus-button--secondary"
        type="button"
        @click="emit('cancel')"
      >
        取消任务
      </button>
      <button
        v-if="canRetry"
        class="mobile-focus-button--ghost"
        type="button"
        @click="emit('retry')"
      >
        重试失败章节
      </button>
      <button
        v-if="canClear"
        class="mobile-focus-button--ghost"
        type="button"
        @click="emit('clear')"
      >
        清空状态
      </button>
    </div>
  </section>
</template>

<style scoped>
.mobile-batch-progress-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 14%, var(--nw-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, var(--nw-bg-secondary) 98%, transparent), color-mix(in srgb, var(--mobile-focus-surface-muted) 76%, var(--nw-bg-secondary)));
}

.mobile-batch-progress-card__top,
.mobile-batch-progress-card__actions,
.mobile-batch-progress-card__stats {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.mobile-batch-progress-card__title {
  display: grid;
  gap: 3px;
}

.mobile-batch-progress-card__eyebrow {
  display: inline-flex;
  width: fit-content;
  padding: 0 9px;
  min-height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.mobile-batch-progress-card__title strong,
.mobile-batch-progress-card__stage strong {
  color: var(--nw-text-primary);
}

.mobile-batch-progress-card__title strong {
  font-size: 18px;
}

.mobile-batch-progress-card__title p,
.mobile-batch-progress-card__stage p,
.mobile-batch-progress-card__stats span {
  margin: 0;
  font-size: 12px;
  color: var(--nw-text-muted);
}

.mobile-batch-progress-card__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.mobile-batch-progress-card__bar {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent);
  overflow: hidden;
}

.mobile-batch-progress-card__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  transition: width var(--nw-duration-normal) var(--nw-ease-smooth);
  position: relative;
  overflow: hidden;
}

.mobile-batch-progress-card__fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: mobile-batch-progress-shimmer 1.5s ease-in-out infinite;
}

@keyframes mobile-batch-progress-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.mobile-batch-progress-card__stats {
  flex-wrap: wrap;
  justify-content: flex-start;
}

.mobile-batch-progress-card__stage {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--mobile-focus-surface) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--nw-border) 48%, transparent);
}

.mobile-batch-progress-card__description {
  line-height: 1.65;
  color: var(--nw-text-secondary);
}

.mobile-batch-progress-card__actions {
  flex-wrap: wrap;
  justify-content: flex-start;
}

@media (max-width: 420px) {
  .mobile-batch-progress-card__top {
    display: grid;
  }

  .mobile-batch-progress-card__meta {
    justify-content: flex-start;
  }

  .mobile-batch-progress-card__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
