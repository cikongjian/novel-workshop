<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { fetchCoverStyleOptions, type CoverStyleOptions } from '../../api/novels';

const props = defineProps<{
  novelId: string;
}>();

const emit = defineEmits<{
  (e: 'update:styleOverrides', value: Record<string, string> | undefined): void;
}>();

const options = ref<CoverStyleOptions | null>(null);
const loading = ref(false);

const selectedEra = ref('');
const selectedVisualStyle = ref('');
const selectedFormat = ref('');
const selectedMood = ref('');

const eraOptions = computed(() => options.value?.eraOptions ?? []);
const visualStyleOptions = computed(() => options.value?.visualStyleOptions ?? []);
const formatOptions = computed(() => options.value?.formatOptions ?? []);
const moodOptions = computed(() => options.value?.moodOptions ?? []);

function buildOverrides(): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (selectedEra.value) result.eraKey = selectedEra.value;
  if (selectedVisualStyle.value) result.visualStyleKey = selectedVisualStyle.value;
  if (selectedFormat.value) result.formatKey = selectedFormat.value;
  if (selectedMood.value) result.moodKey = selectedMood.value;
  return Object.keys(result).length > 0 ? result : undefined;
}

function emitOverrides() {
  emit('update:styleOverrides', buildOverrides());
}

function selectEra(key: string) {
  selectedEra.value = key;
  emitOverrides();
}

function selectVisualStyle(key: string) {
  selectedVisualStyle.value = key;
  emitOverrides();
}

function selectFormat(key: string) {
  selectedFormat.value = key;
  emitOverrides();
}

function selectMood(key: string) {
  selectedMood.value = key;
  emitOverrides();
}

onMounted(async () => {
  if (!props.novelId) return;
  loading.value = true;
  try {
    options.value = await fetchCoverStyleOptions(props.novelId);
  } catch {
    // 静默失败
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-if="!loading && options" class="cover-style-panel">
    <!-- 年代 -->
    <div class="cover-style-panel__section">
      <span class="cover-style-panel__label">年代氛围</span>
      <div class="cover-style-panel__chip-row">
        <button
          class="cover-style-panel__chip"
          :class="{ 'is-active': !selectedEra }"
          @click="selectEra('')"
        >自动</button>
        <button
          v-for="item in eraOptions"
          :key="item.key"
          class="cover-style-panel__chip"
          :class="{ 'is-active': selectedEra === item.key }"
          @click="selectEra(item.key)"
        >{{ item.label }}</button>
      </div>
    </div>

    <!-- 视觉画风 -->
    <div class="cover-style-panel__section">
      <span class="cover-style-panel__label">视觉画风</span>
      <div class="cover-style-panel__chip-row">
        <button
          class="cover-style-panel__chip"
          :class="{ 'is-active': !selectedVisualStyle }"
          @click="selectVisualStyle('')"
        >跟随题材</button>
        <button
          v-for="item in visualStyleOptions"
          :key="item.key"
          class="cover-style-panel__chip"
          :class="{ 'is-active': selectedVisualStyle === item.key }"
          :title="item.summary"
          @click="selectVisualStyle(item.key)"
        >{{ item.label }}</button>
      </div>
    </div>

    <!-- 呈现形式 -->
    <div class="cover-style-panel__section">
      <span class="cover-style-panel__label">呈现形式</span>
      <div class="cover-style-panel__chip-row">
        <button
          class="cover-style-panel__chip"
          :class="{ 'is-active': !selectedFormat }"
          @click="selectFormat('')"
        >跟随题材</button>
        <button
          v-for="item in formatOptions"
          :key="item.key"
          class="cover-style-panel__chip"
          :class="{ 'is-active': selectedFormat === item.key }"
          :title="item.summary"
          @click="selectFormat(item.key)"
        >{{ item.label }}</button>
      </div>
    </div>

    <!-- 色调情绪 -->
    <div class="cover-style-panel__section">
      <span class="cover-style-panel__label">色调情绪</span>
      <div class="cover-style-panel__chip-row">
        <button
          class="cover-style-panel__chip"
          :class="{ 'is-active': !selectedMood }"
          @click="selectMood('')"
        >跟随题材</button>
        <button
          v-for="item in moodOptions"
          :key="item.key"
          class="cover-style-panel__chip"
          :class="{ 'is-active': selectedMood === item.key }"
          @click="selectMood(item.key)"
        >{{ item.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cover-style-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;
}

.cover-style-panel__section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.cover-style-panel__label {
  font-size: 11px;
  color: var(--nw-text-secondary);
  font-weight: 500;
}

.cover-style-panel__chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.cover-style-panel__chip {
  padding: 3px 9px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: var(--mobile-focus-surface);
  color: var(--nw-text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.cover-style-panel__chip.is-active {
  background: rgba(99, 102, 241, 0.1);
  border-color: var(--mobile-focus-accent);
  color: var(--mobile-focus-accent);
  font-weight: 600;
}

.cover-style-panel__chip:active {
  transform: scale(0.96);
}
</style>
