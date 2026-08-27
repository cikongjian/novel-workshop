<template>
  <span v-if="interactive" class="interactive-badge" :class="`interactive-badge--${variant}`">
    <span class="interactive-badge__dot" />
    <span class="interactive-badge__text">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * 互动小说书城徽章。
 * 在书城列表/详情卡片标题旁展示，标识该书为互动连载作品。
 */
const props = withDefaults(defineProps<{
  /** 是否为互动小说 */
  interactive: boolean;
  /** 展示样式：card 用于网格卡片（紧凑），detail 用于详情页（醒目） */
  variant?: 'card' | 'detail';
  /** 是否暂停推进（影响文案） */
  paused?: boolean;
}>(), {
  variant: 'card',
  paused: false,
});

const label = computed(() => (props.paused ? '互动暂停' : '互动连载中'));
</script>

<style scoped>
.interactive-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary)), color-mix(in srgb, var(--mobile-focus-accent-strong) 12%, var(--nw-bg-secondary)));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 20%, transparent);
}

.interactive-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: interactive-badge-pulse 1.8s ease-in-out infinite;
}

@keyframes interactive-badge-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.interactive-badge--detail {
  padding: 4px 12px;
  font-size: 13px;
  border-radius: 10px;
}

.interactive-badge--detail .interactive-badge__dot {
  width: 8px;
  height: 8px;
}
</style>
