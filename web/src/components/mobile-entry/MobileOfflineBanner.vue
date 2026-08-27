<script setup lang="ts">
import { ref, watch } from 'vue';
import { useNetworkStatusStore } from '../../stores/networkStatus';

const network = useNetworkStatusStore();

const showUpdate = ref(false);

watch(
  () => network.swUpdateAvailable,
  (val) => {
    if (val) {
      showUpdate.value = true;
    }
  },
);

async function handleUpdate() {
  await network.acceptSwUpdate();
  showUpdate.value = false;
}

function dismissUpdate() {
  showUpdate.value = false;
}
</script>

<template>
  <Transition name="banner-slide">
    <div v-if="showUpdate" class="offline-banner offline-banner--update">
      <span class="offline-banner__icon">🔄</span>
      <span class="offline-banner__text">新版本已就绪</span>
      <button class="offline-banner__action" @click="handleUpdate">立即更新</button>
      <button class="offline-banner__close" @click="dismissUpdate">✕</button>
    </div>
  </Transition>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: transform 0.3s ease;
}

.offline-banner--update {
  background: rgba(14, 165, 233, 0.92);
  color: #fff;
}

.offline-banner__icon {
  flex-shrink: 0;
  font-size: 15px;
}

.offline-banner__text {
  flex: 1;
}

.offline-banner__action {
  background: rgba(255, 255, 255, 0.22);
  border: none;
  color: inherit;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.offline-banner__close {
  background: none;
  border: none;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  opacity: 0.8;
}

.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: transform 0.3s ease;
}

.banner-slide-enter-from,
.banner-slide-leave-to {
  transform: translateY(-100%);
}
</style>
