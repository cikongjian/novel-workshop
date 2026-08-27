<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import DesktopAudioDrama from './DesktopAudioDrama.vue';

const route = useRoute();
const novelId = computed(() => String(route.params.id || ''));
</script>

<template>
  <div class="desktop-audio-drama-entry">
    <DesktopAudioDrama v-if="novelId" :novel-id="novelId" />
  </div>
</template>

<style scoped>
.desktop-audio-drama-entry {
  width: 100%;
}
</style>
