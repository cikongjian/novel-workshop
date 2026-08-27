<script setup lang="ts">
import { computed, onBeforeUnmount, watch, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useTheme } from './composables/useTheme';
import ErrorBoundary from './components/ErrorBoundary.vue';
import MobileOfflineBanner from './components/mobile-entry/MobileOfflineBanner.vue';
import MobileDeviceStatusBar from './components/mobile-entry/MobileDeviceStatusBar.vue';

const { isDark } = useTheme();
const route = useRoute();
const shouldUnlockPageScroll = computed(() => Boolean(route.meta.public || route.meta.scrollUnlocked));
const isMobileRoute = computed(() => route.path === '/m' || route.path.startsWith('/m/'));
const isImmersiveDarkPage = computed(() => route.path === '/m' || route.path.startsWith('/m/bookstore'));
const isDarkPage = computed(() => isDark.value || isImmersiveDarkPage.value);

watchEffect(() => {
  const targets = [document.documentElement, document.body, document.getElementById('app')].filter(
    (target): target is HTMLElement => Boolean(target),
  );
  targets.forEach((target) => {
    target.classList.toggle('route-scroll-unlocked', shouldUnlockPageScroll.value);
    target.classList.toggle('route-scroll-locked', !shouldUnlockPageScroll.value);
    target.classList.toggle('route-mobile-preview', isMobileRoute.value);
  });
});

watch(
  () => route.fullPath,
  () => {
    if (!isMobileRoute.value) return;

    requestAnimationFrame(() => {
      const mobilePage = document.querySelector<HTMLElement>(
        '.mobile-focus-page, .mobile-book-reader-page, .mobile-fun-page',
      );
      mobilePage?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  const targets = [document.documentElement, document.body, document.getElementById('app')].filter(
    (target): target is HTMLElement => Boolean(target),
  );
  targets.forEach((target) => {
    target.classList.remove('route-scroll-unlocked', 'route-scroll-locked', 'route-mobile-preview');
  });
});
</script>

<template>
  <MobileOfflineBanner />
  <MobileDeviceStatusBar v-if="isMobileRoute" :is-dark="isDarkPage" />
  <ErrorBoundary>
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </ErrorBoundary>
</template>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}

html.route-scroll-locked,
body.route-scroll-locked,
#app.route-scroll-locked {
  overflow: hidden;
}

html.route-scroll-unlocked,
body.route-scroll-unlocked,
#app.route-scroll-unlocked {
  overflow-x: hidden;
  overflow-y: auto;
}
</style>
