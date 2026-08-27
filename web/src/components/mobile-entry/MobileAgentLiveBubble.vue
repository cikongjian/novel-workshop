<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import { Check } from '@element-plus/icons-vue';
import type { AgentLiveBubble } from '../../composables/useAgentLiveFeed';

const props = defineProps<{
  bubble: AgentLiveBubble;
  active: boolean;
}>();

const emit = defineEmits<{
  completed: [role: string];
}>();

const initial = computed(() => props.bubble.label.slice(0, 1));

const statusLabel = computed(() => {
  switch (props.bubble.status) {
    case 'done': return '已完成';
    case 'working': return '进行中';
    default: return '等待中';
  }
});

// 完成时触发一次性反馈（震动 + 上抛事件）
const prevStatus = ref<typeof props.bubble.status>(props.bubble.status);
watch(
  () => props.bubble.status,
  (next, prev) => {
    if (prev === 'working' && next === 'done') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(20);
      }
      emit('completed', props.bubble.role);
    }
    prevStatus.value = next;
  },
);

const hasProgress = computed(() => props.bubble.progressLines.length > 0);
</script>

<template>
  <article
    class="mobile-live-bubble"
    :class="{
      'is-working': bubble.status === 'working',
      'is-done': bubble.status === 'done',
      'is-active': active,
    }"
    :style="{ '--bubble-color': bubble.color }"
  >
    <div class="mobile-live-bubble__avatar">
      <span class="mobile-live-bubble__initial">{{ initial }}</span>
      <span v-if="bubble.status === 'done'" class="mobile-live-bubble__check">
        <el-icon><Check /></el-icon>
      </span>
      <span v-else-if="bubble.status === 'working'" class="mobile-live-bubble__pulse" />
    </div>

    <div class="mobile-live-bubble__body">
      <div class="mobile-live-bubble__header">
        <strong>{{ bubble.label }}</strong>
        <span class="mobile-live-bubble__status">{{ statusLabel }}</span>
      </div>

      <div v-if="hasProgress" class="mobile-live-bubble__progress">
        <p
          v-for="(line, index) in bubble.progressLines"
          :key="`${bubble.role}-${index}-${line.slice(0, 16)}`"
          class="mobile-live-bubble__line"
        >{{ line }}</p>
      </div>
      <p v-else-if="bubble.status === 'working'" class="mobile-live-bubble__placeholder">
        正在思考…
      </p>
      <p v-else-if="bubble.status === 'idle'" class="mobile-live-bubble__placeholder">
        排队中
      </p>

      <div v-if="bubble.tokenUsage && (bubble.tokenUsage.input || bubble.tokenUsage.output)" class="mobile-live-bubble__tokens">
        <span>↑ {{ bubble.tokenUsage.input }}</span>
        <span>↓ {{ bubble.tokenUsage.output }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.mobile-live-bubble {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 72%, transparent);
  background: color-mix(in srgb, var(--nw-bg-secondary) 92%, transparent);
  transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
  animation: mobile-live-bubble-enter 0.3s ease-out;
}

.mobile-live-bubble.is-working {
  border-color: color-mix(in srgb, var(--bubble-color) 36%, transparent);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--bubble-color) 14%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--nw-bg-secondary) 96%, var(--nw-bg-primary)),
    color-mix(in srgb, var(--bubble-color) 6%, var(--nw-bg-secondary))
  );
}

.mobile-live-bubble.is-done {
  border-color: color-mix(in srgb, var(--mobile-focus-status-success) 28%, var(--nw-border));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--mobile-focus-status-success) 8%, var(--nw-bg-secondary)),
    color-mix(in srgb, var(--mobile-focus-status-success) 12%, var(--nw-bg-primary))
  );
}

.mobile-live-bubble.is-active {
  box-shadow: 0 10px 26px color-mix(in srgb, var(--bubble-color) 18%, transparent);
}

.mobile-live-bubble__avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--bubble-color) 16%, var(--nw-bg-secondary));
  border: 1.5px solid color-mix(in srgb, var(--bubble-color) 32%, transparent);
  color: var(--bubble-color);
  font-weight: 800;
  font-size: 15px;
}

.mobile-live-bubble__initial {
  line-height: 1;
}

.mobile-live-bubble__check {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--mobile-focus-status-success);
  color: var(--mobile-focus-on-accent);
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--nw-bg-secondary);
  animation: mobile-live-bubble-check 0.24s ease-out;
}

.mobile-live-bubble__check .el-icon {
  font-size: 10px;
}

.mobile-live-bubble__pulse {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--bubble-color);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--bubble-color) 50%, transparent);
  animation: mobile-live-bubble-pulse 1.2s ease-out infinite;
}

.mobile-live-bubble__body {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.mobile-live-bubble__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mobile-live-bubble__header strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--nw-text-primary);
  line-height: 1.3;
}

.mobile-live-bubble__status {
  font-size: 10px;
  font-weight: 700;
  color: var(--nw-text-secondary);
  background: color-mix(in srgb, var(--nw-border) 46%, transparent);
  padding: 2px 7px;
  border-radius: 999px;
  flex-shrink: 0;
}

.mobile-live-bubble.is-working .mobile-live-bubble__status {
  color: var(--bubble-color);
  background: color-mix(in srgb, var(--bubble-color) 14%, var(--nw-bg-secondary));
}

.mobile-live-bubble.is-done .mobile-live-bubble__status {
  color: color-mix(in srgb, var(--mobile-focus-status-success) 88%, var(--nw-text-primary));
  background: color-mix(in srgb, var(--mobile-focus-status-success) 16%, var(--nw-bg-secondary));
}

.mobile-live-bubble__progress {
  display: grid;
  gap: 3px;
}

.mobile-live-bubble__line {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--nw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mobile-live-bubble__placeholder {
  margin: 0;
  font-size: 11px;
  color: var(--nw-text-muted);
  font-style: italic;
}

.mobile-live-bubble__tokens {
  display: flex;
  gap: 10px;
  font-size: 10px;
  color: var(--nw-text-muted);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}

.mobile-live-bubble__tokens span {
  font-weight: 600;
}

@keyframes mobile-live-bubble-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes mobile-live-bubble-pulse {
  0% {
    transform: scale(0.9);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--bubble-color) 50%, transparent);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 8px color-mix(in srgb, var(--bubble-color) 0%, transparent);
  }
  100% {
    transform: scale(0.9);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--bubble-color) 0%, transparent);
  }
}

@keyframes mobile-live-bubble-check {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-live-bubble,
  .mobile-live-bubble__pulse,
  .mobile-live-bubble__check {
    animation: none !important;
  }
}
</style>
