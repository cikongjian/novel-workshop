<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterStateSnapshot, CharacterQuote } from '../../api/character-growth';

const props = defineProps<{
  snapshots: CharacterStateSnapshot[];
  quotes: CharacterQuote[];
}>();

const stats = computed(() => {
  const snaps = props.snapshots ?? [];
  if (snaps.length === 0) return null;
  const peak = snaps.reduce((a, b) =>
    b.emotionState.intensity > a.emotionState.intensity ? b : a,
  );
  return {
    appearances: snaps.length,
    critical: snaps.filter((s) => s.isCritical).length,
    peakChapter: peak.chapterNumber,
    quotes: props.quotes?.length ?? 0,
  };
});
</script>

<template>
  <div v-if="stats" class="char-stats">
    <div class="char-stats__item">
      <span class="char-stats__num">{{ stats.appearances }}</span>
      <span class="char-stats__label">出场章</span>
    </div>
    <div class="char-stats__item">
      <span class="char-stats__num">{{ stats.critical }}</span>
      <span class="char-stats__label">关键时刻</span>
    </div>
    <div class="char-stats__item">
      <span class="char-stats__num">{{ stats.peakChapter }}</span>
      <span class="char-stats__label">情绪峰值</span>
    </div>
    <div class="char-stats__item">
      <span class="char-stats__num">{{ stats.quotes }}</span>
      <span class="char-stats__label">高光台词</span>
    </div>
  </div>
</template>

<style scoped>
.char-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.char-stats__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 9px 4px;
  background: rgba(148, 163, 184, 0.06);
  border: 1px solid var(--nw-border, rgba(148, 163, 184, 0.14));
  border-radius: 10px;
}
.char-stats__num {
  font-size: 17px;
  font-weight: 800;
  color: var(--nw-text-primary, #1e293b);
  line-height: 1.1;
}
.char-stats__label {
  margin-top: 2px;
  font-size: 10px;
  color: var(--nw-text-muted, #94a3b8);
}
</style>
