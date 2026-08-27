<script setup lang="ts">
import { computed, useSlots } from 'vue';

const props = withDefaults(defineProps<{
  kicker?: string;
  title?: string;
  hint?: string;
  hero?: boolean;
}>(), {
  kicker: '',
  title: '',
  hint: '',
  hero: false,
});

const slots = useSlots();
const hasActions = computed(() => Boolean(slots.actions));
</script>

<template>
  <section :class="[hero ? 'mobile-focus-hero' : 'mobile-focus-section']">
    <div
      v-if="kicker || title || hint || hasActions"
      class="mobile-focus-section__head"
      :class="{ 'mobile-focus-section__head--row': hasActions }"
    >
      <div class="mobile-focus-section__head">
        <p v-if="kicker" class="mobile-focus-kicker">{{ kicker }}</p>
        <h2 v-if="title">{{ title }}</h2>
        <p v-if="hint" class="mobile-focus-section__hint">{{ hint }}</p>
      </div>
      <slot v-if="hasActions" name="actions" />
    </div>

    <slot />
  </section>
</template>
