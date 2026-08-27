<script setup lang="ts">
import { computed, useSlots } from 'vue';
import BrandEmblem from '../brand/BrandEmblem.vue';

const props = withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  brandSize?: number;
}>(), {
  subtitle: '',
  brandSize: 30,
});

const slots = useSlots();
const hasLeading = computed(() => Boolean(slots.leading));
const hasActions = computed(() => Boolean(slots.actions));
</script>

<template>
  <header
    class="mobile-focus-topbar mobile-topbar"
    :class="{
      'mobile-topbar--with-leading': hasLeading,
      'mobile-topbar--with-actions': hasActions,
    }"
  >
    <div v-if="hasLeading" class="mobile-topbar__leading">
      <slot name="leading" />
    </div>

    <div class="mobile-focus-brand mobile-topbar__brand">
      <BrandEmblem :size="brandSize" />
      <div class="mobile-focus-brand__copy">
        <strong>{{ title }}</strong>
        <span v-if="subtitle">{{ subtitle }}</span>
      </div>
    </div>

    <div v-if="hasActions" class="mobile-topbar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.mobile-topbar {
  grid-template-columns: minmax(0, 1fr);
}

.mobile-topbar--with-actions {
  grid-template-columns: minmax(0, 1fr) auto;
}

.mobile-topbar--with-leading {
  grid-template-columns: auto minmax(0, 1fr);
}

.mobile-topbar--with-leading.mobile-topbar--with-actions {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.mobile-topbar__leading,
.mobile-topbar__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.mobile-topbar__brand {
  overflow: hidden;
}

.mobile-topbar--with-leading .mobile-topbar__brand {
  justify-self: end;
}
</style>
