<script setup lang="ts">
const props = withDefaults(defineProps<{
  size?: number;
}>(), {
  size: 26,
});
</script>

<template>
  <span class="brand-emblem" :style="{ width: `${props.size}px`, height: `${props.size}px` }" aria-hidden="true">
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="brandEmblemBg" x1="14" y1="12" x2="86" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0E7490" />
          <stop offset="1" stop-color="#0F172A" />
        </linearGradient>
        <linearGradient id="brandEmblemCore" x1="34" y1="30" x2="70" y2="66" gradientUnits="userSpaceOnUse">
          <stop stop-color="#67E8F9" />
          <stop offset="1" stop-color="#2DD4BF" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="84" height="84" rx="24" fill="url(#brandEmblemBg)" />
      <path d="M50 24L56.4 40.6L73 47L56.4 53.4L50 70L43.6 53.4L27 47L43.6 40.6L50 24Z" fill="url(#brandEmblemCore)" />
      <path d="M28 37C34 31 42 28 50 28C55 28 59 29 64 31" stroke="#67E8F9" stroke-opacity="0.45" stroke-width="3.8" stroke-linecap="round" />
    </svg>
  </span>
</template>

<style scoped>
.brand-emblem {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 34%, transparent);
  background: color-mix(in srgb, var(--star-brand-sky) 10%, transparent);
  box-shadow: 0 0 16px var(--star-brand-glow);
  overflow: hidden;
  flex-shrink: 0;
}

.brand-emblem svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
