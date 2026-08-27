<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import * as api from '../api';
import { ensureFreshAccessToken } from '../api/http';
import { useAgentsStore } from '../stores/agents';

const props = defineProps<{
  novelId: string;
  chapterNumber: number;
}>();

const emit = defineEmits<{
  (e: 'action', suggestion: Record<string, unknown>): void;
}>();

interface Suggestion {
  type: string;
  priority: 'high' | 'medium' | 'low';
  message: string;
  action?: string;
}

const loading = ref(false);
const suggestions = ref<Suggestion[]>([]);
const agentsStore = useAgentsStore();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSuggestionsRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void loadSuggestions();
  }, 600);
}

function getPriorityType(priority: string): 'warning' | 'info' | 'success' {
  const map: Record<string, 'warning' | 'info' | 'success'> = {
    high: 'warning',
    medium: 'info',
    low: 'success',
  };
  return map[priority] ?? 'info';
}

function getTypeIcon(type: string): string {
  const map: Record<string, string> = {
    plot: '📖',
    character: '👤',
    style: '✍️',
    pacing: '⏱️',
    world: '🌍',
  };
  return map[type] ?? '💡';
}

async function loadSuggestions() {
  if (agentsStore.isGenerating) return;
  loading.value = true;
  try {
    await ensureFreshAccessToken();
    const data = await api.getSuggestions(props.novelId, props.chapterNumber);
    suggestions.value = data.suggestions ?? [];
  } catch {
    suggestions.value = [];
  } finally {
    loading.value = false;
  }
}

function handleClick(suggestion: Suggestion) {
  emit('action', suggestion as unknown as Record<string, unknown>);
}

onMounted(loadSuggestions);

watch(() => props.chapterNumber, loadSuggestions);

// 生成完成后自动刷新建议
watch(() => agentsStore.isGenerating, (generating, wasGenerating) => {
  if (wasGenerating && !generating) scheduleSuggestionsRefresh();
});

onUnmounted(() => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
});
</script>

<template>
  <div class="smart-suggestions" v-loading="loading">
    <div class="suggestions-header">
      <span class="suggestions-title">智能建议</span>
      <el-button text size="small" @click="loadSuggestions" :loading="loading">
        刷新
      </el-button>
    </div>

    <div v-if="suggestions.length === 0 && !loading" class="suggestions-empty">
      暂无建议
    </div>

    <div
      v-for="(s, idx) in suggestions"
      :key="idx"
      class="suggestion-card"
      @click="handleClick(s)"
    >
      <div class="suggestion-icon">{{ getTypeIcon(s.type) }}</div>
      <div class="suggestion-body">
        <div class="suggestion-msg">{{ s.message }}</div>
        <el-tag :type="getPriorityType(s.priority)" size="small">
          {{ s.priority === 'high' ? '高优先' : s.priority === 'medium' ? '中优先' : '低优先' }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smart-suggestions {
  padding: 8px;
  min-height: 60px;
}

.suggestions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.suggestions-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary, #1f2937);
}

.suggestions-empty {
  text-align: center;
  color: var(--nw-text-muted, #9ca3af);
  font-size: 13px;
  padding: 16px 0;
}

.suggestion-card {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 4px;
}

.suggestion-card:hover {
  background: var(--nw-bg-secondary, #f3f4f6);
}

.suggestion-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.suggestion-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.suggestion-msg {
  font-size: 13px;
  color: var(--nw-text-secondary, #6b7280);
  line-height: 1.4;
}
</style>
