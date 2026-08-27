<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchWriterScore, type WriterScoreResult } from '../../api/writer-scores';

const props = defineProps<{
  userId: string;
}>();

const score = ref<WriterScoreResult | null>(null);

async function load() {
  if (!props.userId) return;
  try {
    score.value = await fetchWriterScore(props.userId);
  } catch { /* 忽略 */ }
}

watch(() => props.userId, load, { immediate: true });
</script>

<template>
  <span v-if="score" class="writer-level-badge" :class="`writer-level-badge--lv${score.level}`">
    Lv.{{ score.level }}
  </span>
</template>

<style scoped>
.writer-level-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  background: color-mix(in srgb, var(--mobile-focus-accent, var(--mobile-focus-status-sky)) 12%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-accent, var(--mobile-focus-status-sky)) 88%, var(--nw-text-primary));
}

.writer-level-badge--lv0 { opacity: 0.7; }
.writer-level-badge--lv4,
.writer-level-badge--lv5 {
  background: color-mix(in srgb, var(--mobile-focus-status-teal) 15%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-teal) 88%, var(--nw-text-primary));
}
.writer-level-badge--lv6,
.writer-level-badge--lv7,
.writer-level-badge--lv8 {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mobile-focus-accent, var(--mobile-focus-status-sky)) 20%, transparent),
    color-mix(in srgb, var(--mobile-focus-status-teal) 20%, transparent)
  );
  color: color-mix(in srgb, var(--mobile-focus-accent-strong, var(--mobile-focus-status-sky)) 88%, var(--nw-text-primary));
}
</style>
