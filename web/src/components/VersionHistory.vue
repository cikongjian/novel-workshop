<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import type { ChapterVersionMeta, DiffLine } from '../api';

const props = defineProps<{
  novelId: string;
  chapterNumber: number;
}>();

const emit = defineEmits<{
  rollback: [];
}>();

const loading = ref(false);
const versions = ref<ChapterVersionMeta[]>([]);
const diffLoading = ref(false);
const diffResult = ref<{ diff: DiffLine[]; summary: { added: number; removed: number; unchanged: number } } | null>(null);
const selectedV1 = ref<number | null>(null);
const selectedV2 = ref<number | null>(null);

const SOURCE_LABELS: Record<string, string> = {
  generate: 'AI 生成',
  revise: 'AI 修订',
  'manual-save': '手动保存',
  finalize: '定稿',
  rollback: '回滚',
};

const SOURCE_COLORS: Record<string, string> = {
  generate: '#6366f1',
  revise: '#3b82f6',
  'manual-save': '#10b981',
  finalize: '#f59e0b',
  rollback: '#ef4444',
};

const canDiff = computed(() => selectedV1.value != null && selectedV2.value != null && selectedV1.value !== selectedV2.value);

async function loadVersions() {
  loading.value = true;
  diffResult.value = null;
  try {
    const result = await api.fetchChapterVersions(props.novelId, props.chapterNumber);
    versions.value = result.versions.sort((a, b) => b.version - a.version);
    // 默认选中最新两个版本
    if (versions.value.length >= 2) {
      selectedV2.value = versions.value[0].version;
      selectedV1.value = versions.value[1].version;
    }
  } catch {
    ElMessage.error('加载版本历史失败');
  } finally {
    loading.value = false;
  }
}

async function handleDiff() {
  if (!canDiff.value) return;
  diffLoading.value = true;
  try {
    const result = await api.fetchChapterDiff(props.novelId, props.chapterNumber, selectedV1.value!, selectedV2.value!);
    diffResult.value = result;
  } catch {
    ElMessage.error('版本对比失败');
  } finally {
    diffLoading.value = false;
  }
}

async function handleRollback(version: number) {
  try {
    await ElMessageBox.confirm(
      `确定要回滚到版本 ${version} 吗？当前内容将被归档为新版本。`,
      '回滚确认',
      { confirmButtonText: '确定回滚', cancelButtonText: '取消', type: 'warning' },
    );
    await api.rollbackChapter(props.novelId, props.chapterNumber, version);
    ElMessage.success('回滚成功');
    emit('rollback');
    await loadVersions();
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('回滚失败');
    }
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

watch(() => [props.novelId, props.chapterNumber], () => loadVersions(), { immediate: true });
</script>

<template>
  <div class="version-history">
    <div v-if="loading" style="text-align: center; padding: 20px;">
      <el-icon class="is-loading"><i class="el-icon-loading" /></el-icon>
      加载中...
    </div>

    <div v-else-if="versions.length === 0" style="text-align: center; padding: 20px; color: #999;">
      暂无版本历史
    </div>

    <template v-else>
      <!-- 版本列表 -->
      <div class="version-list">
        <div
          v-for="ver in versions"
          :key="ver.version"
          class="version-item"
        >
          <div class="version-header">
            <span class="version-num">v{{ ver.version }}</span>
            <el-tag
              size="small"
              :color="SOURCE_COLORS[ver.source] || '#999'"
              effect="dark"
              style="border: none; margin-left: 6px;"
            >
              {{ SOURCE_LABELS[ver.source] || ver.source }}
            </el-tag>
            <span class="version-time">{{ formatTime(ver.createdAt) }}</span>
            <span class="version-words">{{ ver.wordCount }} 字</span>
          </div>
          <div class="version-actions">
            <el-radio v-model="selectedV1" :value="ver.version" size="small">旧</el-radio>
            <el-radio v-model="selectedV2" :value="ver.version" size="small">新</el-radio>
            <el-button size="small" text type="warning" @click="handleRollback(ver.version)">
              回滚
            </el-button>
          </div>
        </div>
      </div>

      <!-- Diff 操作 -->
      <div class="diff-toolbar">
        <el-button
          type="primary"
          size="small"
          :disabled="!canDiff"
          :loading="diffLoading"
          @click="handleDiff"
        >
          对比 v{{ selectedV1 }} ↔ v{{ selectedV2 }}
        </el-button>
      </div>

      <!-- Diff 结果 -->
      <div v-if="diffResult" class="diff-view">
        <div class="diff-summary">
          <el-tag type="success" size="small">+{{ diffResult.summary.added }}</el-tag>
          <el-tag type="danger" size="small">-{{ diffResult.summary.removed }}</el-tag>
          <el-tag type="info" size="small">={{ diffResult.summary.unchanged }}</el-tag>
        </div>
        <div class="diff-content">
          <div
            v-for="(line, idx) in diffResult.diff"
            :key="idx"
            :class="['diff-line', `diff-${line.type}`]"
          >
            <span class="diff-prefix">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}</span>
            <span class="diff-text">{{ line.content }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.version-history {
  font-size: 13px;
}
.version-list {
  max-height: 300px;
  overflow-y: auto;
}
.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter, #eee);
}
.version-item:hover {
  background: var(--el-fill-color-light, #f5f5f5);
}
.version-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.version-num {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.version-time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.version-words {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.version-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.diff-toolbar {
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter, #eee);
}
.diff-summary {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
}
.diff-view {
  border-top: 1px solid var(--el-border-color-lighter, #eee);
}
.diff-content {
  max-height: 400px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
}
.diff-line {
  padding: 1px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.diff-equal {
  color: var(--el-text-color-regular);
}
.diff-add {
  background: #e6ffec;
  color: #1a7f37;
}
.diff-remove {
  background: #ffebe9;
  color: #cf222e;
}
.diff-prefix {
  display: inline-block;
  width: 16px;
  user-select: none;
  color: inherit;
  opacity: 0.6;
}
</style>
