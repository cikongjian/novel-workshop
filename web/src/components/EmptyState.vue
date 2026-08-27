<script setup lang="ts">
defineProps<{
  icon?: 'book' | 'pen' | 'search';
  title?: string;
  description?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <!-- 书本图标 -->
      <svg v-if="icon === 'book'" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-book" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#0284c7" />
            <stop offset="100%" stop-color="#14b8a6" />
          </linearGradient>
        </defs>
        <rect x="12" y="10" width="56" height="60" rx="4" stroke="url(#grad-book)" stroke-width="2" fill="none" opacity="0.3" />
        <rect x="18" y="16" width="44" height="48" rx="2" stroke="url(#grad-book)" stroke-width="2" fill="none" opacity="0.5" />
        <line x1="40" y1="16" x2="40" y2="64" stroke="url(#grad-book)" stroke-width="1.5" opacity="0.4" />
        <line x1="26" y1="28" x2="36" y2="28" stroke="url(#grad-book)" stroke-width="1.5" opacity="0.6" />
        <line x1="26" y1="34" x2="34" y2="34" stroke="url(#grad-book)" stroke-width="1.5" opacity="0.6" />
        <line x1="26" y1="40" x2="36" y2="40" stroke="url(#grad-book)" stroke-width="1.5" opacity="0.6" />
        <line x1="44" y1="28" x2="54" y2="28" stroke="url(#grad-book)" stroke-width="1.5" opacity="0.6" />
        <line x1="44" y1="34" x2="52" y2="34" stroke="url(#grad-book)" stroke-width="1.5" opacity="0.6" />
      </svg>
      <!-- 羽毛笔图标 -->
      <svg v-else-if="icon === 'pen'" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-pen" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#0284c7" />
            <stop offset="100%" stop-color="#14b8a6" />
          </linearGradient>
        </defs>
        <path d="M56 12L24 44L20 60L36 56L68 24L56 12Z" stroke="url(#grad-pen)" stroke-width="2" fill="none" opacity="0.5" />
        <path d="M48 20L60 32" stroke="url(#grad-pen)" stroke-width="1.5" opacity="0.4" />
        <path d="M20 60L24 44" stroke="url(#grad-pen)" stroke-width="2" opacity="0.6" />
        <line x1="12" y1="68" x2="40" y2="68" stroke="url(#grad-pen)" stroke-width="2" opacity="0.3" />
      </svg>
      <!-- 默认搜索图标 -->
      <svg v-else viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-search" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#0284c7" />
            <stop offset="100%" stop-color="#14b8a6" />
          </linearGradient>
        </defs>
        <circle cx="34" cy="34" r="20" stroke="url(#grad-search)" stroke-width="2" fill="none" opacity="0.5" />
        <line x1="48" y1="48" x2="64" y2="64" stroke="url(#grad-search)" stroke-width="3" stroke-linecap="round" opacity="0.5" />
      </svg>
    </div>
    <h3 v-if="title" class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <div class="empty-action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--nw-space-10) var(--nw-space-6);
  height: 100%;
  min-height: 300px;
}

.empty-icon {
  width: 80px;
  height: 80px;
  margin-bottom: var(--nw-space-5);
  opacity: 0.8;
  filter: drop-shadow(0 0 18px color-mix(in srgb, var(--star-brand-sky) 30%, transparent));
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.empty-title {
  margin: 0 0 var(--nw-space-2);
  font-size: var(--nw-text-base);
  font-weight: var(--nw-font-semibold);
  color: color-mix(in srgb, var(--star-brand-sky) 64%, var(--nw-text-primary));
}

.empty-desc {
  margin: 0 0 var(--nw-space-5);
  font-size: var(--nw-text-sm);
  color: var(--nw-text-muted);
  text-align: center;
  max-width: 300px;
  line-height: var(--nw-leading-normal);
}

.empty-action {
  display: flex;
  gap: var(--nw-space-2);
}
</style>
