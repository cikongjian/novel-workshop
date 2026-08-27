<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue';

withDefaults(defineProps<{
  title: string;
  description?: string;
  icon?: unknown;
  accent?: 'default' | 'sky' | 'teal' | 'gold' | 'ink';
  showArrow?: boolean;
}>(), {
  description: '',
  icon: undefined,
  accent: 'default',
  showArrow: true,
});

defineEmits<{
  (e: 'click'): void;
}>();
</script>

<template>
  <button class="mobile-focus-action mobile-action-row" :class="`accent-${accent}`" type="button" @click="$emit('click')">
    <span v-if="icon" class="mobile-focus-action__icon mobile-action-row__icon">
      <el-icon :size="18">
        <component :is="icon" />
      </el-icon>
    </span>
    <div class="mobile-focus-action__copy">
      <strong>{{ title }}</strong>
      <p v-if="description">{{ description }}</p>
    </div>
    <slot name="trailing">
      <el-icon v-if="showArrow" :size="16" class="mobile-action-row__arrow"><ArrowRight /></el-icon>
    </slot>
  </button>
</template>

<style scoped>
.mobile-action-row {
  background: var(--mobile-focus-surface, var(--nw-bg-card));
}

.mobile-action-row__icon {
  background: color-mix(in srgb, var(--mobile-focus-accent, var(--mobile-focus-status-sky)) 12%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-accent, var(--mobile-focus-status-sky)) 86%, var(--nw-text-primary));
}

.mobile-action-row__arrow {
  color: var(--nw-text-muted);
}

.mobile-action-row.accent-sky .mobile-action-row__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-sky) 14%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-sky) 88%, var(--nw-text-primary));
}

.mobile-action-row.accent-teal .mobile-action-row__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-teal) 14%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-teal) 88%, var(--nw-text-primary));
}

.mobile-action-row.accent-gold .mobile-action-row__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 14%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 82%, var(--nw-text-primary));
}

.mobile-action-row.accent-ink .mobile-action-row__icon {
  background: color-mix(in srgb, var(--mobile-focus-status-ink) 12%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-ink) 86%, var(--nw-text-primary));
}
</style>
