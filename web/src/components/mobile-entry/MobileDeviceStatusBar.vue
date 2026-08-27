<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

defineProps<{
  isDark?: boolean;
}>();

const now = ref(new Date());
let timer: number | null = null;

const timeText = computed(() => {
  const h = now.value.getHours().toString().padStart(2, '0');
  const m = now.value.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
});

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 30000);
});

onUnmounted(() => {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<template>
  <div class="mobile-device-status-bar" :class="{ 'mobile-device-status-bar--dark': isDark }">
    <span class="md-status-time">{{ timeText }}</span>
    <div class="md-status-icons">
      <svg class="md-status-icon md-status-signal" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
        <rect x="0" y="8" width="3" height="4" rx="0.5" />
        <rect x="5" y="5" width="3" height="7" rx="0.5" />
        <rect x="10" y="2" width="3" height="10" rx="0.5" />
        <rect x="15" y="0" width="3" height="12" rx="0.5" />
      </svg>
      <svg class="md-status-icon md-status-wifi" viewBox="0 0 16 12" fill="none" aria-hidden="true">
        <path d="M8 10.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" fill="currentColor" />
        <path d="M3.2 6.8a6.8 6.8 0 0 1 9.6 0l-1.2 1.2a5.1 5.1 0 0 0-7.2 0L3.2 6.8Z" fill="currentColor" />
        <path d="M0.8 4.4a10.2 10.2 0 0 1 14.4 0l-1.2 1.2a8.5 8.5 0 0 0-12 0L0.8 4.4Z" fill="currentColor" />
      </svg>
      <div class="md-status-battery">
        <div class="md-status-battery-level"></div>
        <div class="md-status-battery-cap"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-device-status-bar {
  display: none;
}

@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
  .mobile-device-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
    padding: 0 18px;
    font-size: 13px;
    font-weight: 600;
    color: var(--nw-text-primary);
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;
  }

  .md-status-time {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.2px;
  }

  .md-status-icons {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .md-status-icon {
    width: 16px;
    height: 12px;
    color: var(--nw-text-primary);
  }

  .md-status-battery {
    position: relative;
    width: 26px;
    height: 12px;
    border: 1px solid var(--nw-text-primary);
    border-radius: 3px;
    box-sizing: border-box;
    opacity: 0.9;
  }

  .md-status-battery-level {
    width: 80%;
    height: 100%;
    background: var(--nw-text-primary);
    border-radius: 1px;
    opacity: 0.9;
  }

  .md-status-battery-cap {
    position: absolute;
    top: 50%;
    right: -3px;
    width: 2px;
    height: 5px;
    background: var(--nw-text-primary);
    border-radius: 0 1px 1px 0;
    transform: translateY(-50%);
    opacity: 0.9;
  }

  .mobile-device-status-bar--dark {
    color: var(--nw-text-primary);
  }

  .mobile-device-status-bar--dark .md-status-icon {
    color: var(--nw-text-primary);
  }

  .mobile-device-status-bar--dark .md-status-battery {
    border-color: var(--nw-text-primary);
  }

  .mobile-device-status-bar--dark .md-status-battery-level {
    background: var(--nw-text-primary);
  }

  .mobile-device-status-bar--dark .md-status-battery-cap {
    background: var(--nw-text-primary);
  }
}
</style>
