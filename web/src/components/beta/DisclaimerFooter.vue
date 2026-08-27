<script setup lang="ts">
import { ref } from 'vue';
import PlatformDisclaimerDialog from '../legal/PlatformDisclaimerDialog.vue';
import { PLATFORM_DISCLAIMER_SUMMARY, PLATFORM_DISCLAIMER_TAGS } from '../legal/platform-disclaimer';

defineProps<{
  compact?: boolean;
}>();

const dialogVisible = ref(false);
</script>

<template>
  <div class="disclaimer-footer" :class="{ 'disclaimer-footer--compact': compact }">
    <div class="disclaimer-footer__header">
      <strong>版权与免责说明</strong>
      <button type="button" class="disclaimer-footer__more" @click="dialogVisible = true">完整声明</button>
    </div>
    <p class="disclaimer-footer__summary">{{ PLATFORM_DISCLAIMER_SUMMARY }}</p>
    <div class="disclaimer-footer__tags">
      <span v-for="tag in PLATFORM_DISCLAIMER_TAGS" :key="tag">{{ tag }}</span>
    </div>
  </div>
  <PlatformDisclaimerDialog v-model="dialogVisible" />
</template>

<style scoped>
.disclaimer-footer {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--nw-text-muted) 12%, var(--nw-border));
}

.disclaimer-footer--compact {
  padding: 10px 12px;
  gap: 4px;
}

.disclaimer-footer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.disclaimer-footer__header strong {
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.disclaimer-footer__more {
  border: 0;
  background: none;
  color: var(--star-brand-sky);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: opacity 0.15s;
}

.disclaimer-footer__more:active {
  opacity: 0.7;
}

.disclaimer-footer__summary {
  margin: 0;
  color: var(--nw-text-muted);
  font-size: 11px;
  line-height: 1.6;
}

.disclaimer-footer__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.disclaimer-footer__tags span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--nw-text-muted) 8%, transparent);
  color: var(--nw-text-muted);
  font-size: 10px;
  font-weight: 600;
}

:global(html.dark) .disclaimer-footer {
  border-color: color-mix(in srgb, var(--nw-text-muted) 20%, var(--nw-border));
}

@media (max-width: 720px) {
  .disclaimer-footer {
    padding: 10px 12px;
  }
}
</style>
