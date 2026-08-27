<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  src: string;
  alt?: string;
  aspectRatio?: number | string;
  fallbackText?: string;
  loading?: 'lazy' | 'eager';
}>();

const emit = defineEmits<{
  (e: 'load', event: Event): void;
  (e: 'error', event: Event): void;
}>();

const wrapperRef = ref<HTMLDivElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);
const isLoaded = ref(false);
const hasError = ref(false);
const isInView = ref(false);
let observer: IntersectionObserver | null = null;

const computedAspectRatio = computed(() => {
  if (typeof props.aspectRatio === 'number') return props.aspectRatio;
  if (typeof props.aspectRatio === 'string') {
    const parts = props.aspectRatio.split('/');
    if (parts.length === 2) return Number(parts[0]) / Number(parts[1]);
    return Number(props.aspectRatio);
  }
  return undefined;
});

const aspectStyle = computed(() => {
  if (computedAspectRatio.value) {
    return { aspectRatio: computedAspectRatio.value };
  }
  return {};
});

const handleIntersect = () => {
  isInView.value = true;
};

const handleLoad = (event: Event) => {
  isLoaded.value = true;
  emit('load', event);
};

const handleError = (event: Event) => {
  hasError.value = true;
  emit('error', event);
};

onMounted(() => {
  if (props.loading === 'eager') {
    isInView.value = true;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isInView.value = true;
          observer?.disconnect();
        }
      });
    },
    { rootMargin: '100px' }
  );
  if (wrapperRef.value) {
    observer.observe(wrapperRef.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<template>
  <div ref="wrapperRef" class="lazy-image-wrapper" :style="aspectStyle">
    <div v-if="!isLoaded && !hasError" class="lazy-image-skeleton">
      <div class="lazy-image-skeleton__shine" />
    </div>
    
    <img
      v-if="isInView"
      ref="imgRef"
      :src="src"
      :alt="alt"
      :loading="loading ?? 'lazy'"
      class="lazy-image"
      :class="{
        'lazy-image--loaded': isLoaded,
        'lazy-image--error': hasError,
      }"
      decoding="async"
      @load="handleLoad"
      @error="handleError"
    />
    
    <div v-else-if="hasError" class="lazy-image-fallback">
      <span>{{ fallbackText?.charAt(0) || '?' }}</span>
    </div>
  </div>
</template>

<style scoped>
.lazy-image-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--nw-bg-card, rgba(12, 23, 41, 0.94));
}

.lazy-image-skeleton {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--nw-text-primary) 4%, var(--nw-bg-card)) 0%,
    color-mix(in srgb, var(--nw-text-primary) 8%, var(--nw-bg-card)) 50%,
    color-mix(in srgb, var(--nw-text-primary) 4%, var(--nw-bg-card)) 100%
  );
  animation: lazy-skeleton-pulse 2s ease-in-out infinite;
}

.lazy-image-skeleton__shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.06) 50%,
    transparent 100%
  );
  animation: lazy-skeleton-shine 1.6s ease-in-out infinite;
}

@keyframes lazy-skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes lazy-skeleton-shine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.lazy-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease-out;
}

.lazy-image--loaded {
  opacity: 1;
}

.lazy-image--error {
  display: none;
}

.lazy-image-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--star-brand-sky, #172033) 35%, var(--nw-bg-card)) 0%,
    color-mix(in srgb, var(--star-brand-sky, #2c4468) 55%, var(--nw-bg-card)) 100%
  );
}

.lazy-image-fallback span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--nw-text-primary) 12%, transparent);
  color: var(--nw-text-primary, #f8fafc);
  font-size: 22px;
  font-weight: 800;
}
</style>
