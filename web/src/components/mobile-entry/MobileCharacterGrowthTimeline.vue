<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterEvent } from '../../api/characters';

const props = defineProps<{
  events: CharacterEvent[];
}>();

const EVENT_LABELS: Record<CharacterEvent['type'], string> = {
  action: '主动选择',
  encounter: '命运遭遇',
  relationship: '关系转折',
  revelation: '认知变化',
  achievement: '能力突破',
  loss: '代价与失去',
};

const visibleEvents = computed(() => {
  const unique = new Map<string, CharacterEvent>();
  for (const event of props.events ?? []) {
    unique.set(`${event.chapterNumber}:${event.type}:${event.summary.trim()}`, event);
  }
  return [...unique.values()]
    .sort((left, right) => left.chapterNumber - right.chapterNumber || left.importance - right.importance)
    .slice(-6);
});
</script>

<template>
  <section v-if="visibleEvents.length" class="character-growth-timeline">
    <h3 class="character-growth-timeline__title">成长节点</h3>
    <ol class="character-growth-timeline__list">
      <li v-for="event in visibleEvents" :key="event.id" class="character-growth-timeline__item">
        <span class="character-growth-timeline__dot" aria-hidden="true" />
        <div class="character-growth-timeline__content">
          <div class="character-growth-timeline__meta">
            <span>第 {{ event.chapterNumber }} 章</span>
            <span>{{ EVENT_LABELS[event.type] }}</span>
          </div>
          <p class="character-growth-timeline__summary">{{ event.summary }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>
