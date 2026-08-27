<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterIdentityLabel } from '../../types';

const props = defineProps<{
  labels: CharacterIdentityLabel[];
}>();

const CATEGORY_ORDER: Record<CharacterIdentityLabel['category'], number> = {
  growth: 0,
  social: 1,
  relationship: 2,
  reader: 3,
  structural: 4,
};

const visibleLabels = computed(() => {
  const unique = [...new Map(
    (props.labels ?? []).map(label => [label.label, label]),
  ).values()].sort((left, right) => (
    CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category]
      || right.confidence - left.confidence
  ));
  const detailLabels = unique.filter(label => label.category !== 'structural');
  return (detailLabels.length > 0 ? detailLabels : unique).slice(0, 8);
});
</script>

<template>
  <div v-if="visibleLabels.length" class="character-identity-labels" aria-label="角色身份标签">
    <span
      v-for="item in visibleLabels"
      :key="item.key"
      class="character-identity-labels__item"
      :class="`character-identity-labels__item--${item.category}`"
    >
      {{ item.label }}
    </span>
  </div>
</template>
