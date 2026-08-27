<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as api from '../api';
import { getPlotBranchImpactText } from '../utils/plot-branches';

const props = defineProps<{
  novelId: string;
  chapterNumber: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'select', branch: Record<string, unknown>): void;
}>();

interface PlotBranch {
  title: string;
  description: string;
  impact?: string;
  impactPrediction?: string;
  characterImpacts?: Array<string | { name: string; impact: string }>;
  riskLevel: 'low' | 'medium' | 'high';
}

const loading = ref(false);
const branches = ref<PlotBranch[]>([]);

function getRiskType(level: string): 'success' | 'warning' | 'danger' {
  const map: Record<string, 'success' | 'warning' | 'danger'> = {
    low: 'success',
    medium: 'warning',
    high: 'danger',
  };
  return map[level] ?? 'warning';
}

function getRiskLabel(level: string): string {
  const map: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' };
  return map[level] ?? level;
}

async function loadBranches() {
  loading.value = true;
  branches.value = [];
  try {
    const data = await api.explorePlot(props.novelId, props.chapterNumber);
    branches.value = data.branches ?? [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '探索失败';
    ElMessage.error(msg);
  } finally {
    loading.value = false;
  }
}

function selectBranch(branch: PlotBranch) {
  emit('select', branch as unknown as Record<string, unknown>);
  emit('update:visible', false);
}

function handleClose() {
  emit('update:visible', false);
}

// 打开时自动加载
import { watch } from 'vue';
watch(() => props.visible, (val) => {
  if (val) loadBranches();
});
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="handleClose"
    title="剧情分支探索"
    width="700px"
    destroy-on-close
  >
    <div v-loading="loading" class="plot-explorer-body">
      <div v-if="branches.length === 0 && !loading" class="plot-empty">
        <el-empty description="暂无可探索的剧情分支" />
      </div>

      <div class="branch-grid">
        <el-card
          v-for="(branch, idx) in branches"
          :key="idx"
          shadow="hover"
          class="branch-card"
        >
          <template #header>
            <div class="branch-header">
              <span class="branch-title">{{ branch.title }}</span>
              <el-tag :type="getRiskType(branch.riskLevel)" size="small">
                {{ getRiskLabel(branch.riskLevel) }}
              </el-tag>
            </div>
          </template>
          <p class="branch-desc">{{ branch.description }}</p>
          <p v-if="getPlotBranchImpactText(branch)" class="branch-impact">
            <strong>影响预测：</strong>{{ getPlotBranchImpactText(branch) }}
          </p>
          <div class="branch-characters" v-if="branch.characterImpacts?.length">
            <el-tag
              v-for="(c, ci) in branch.characterImpacts"
              :key="ci"
              size="small"
              type="info"
              class="char-tag"
            >
              {{ typeof c === 'string' ? c : `${c.name}：${c.impact}` }}
            </el-tag>
          </div>
          <div class="branch-action">
            <el-button type="primary" size="small" @click="selectBranch(branch)">
              写入分支树并应用
            </el-button>
          </div>
        </el-card>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.plot-explorer-body {
  min-height: 200px;
}

.branch-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.branch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.branch-title {
  font-weight: 600;
  font-size: 15px;
}

.branch-desc {
  margin: 0 0 8px;
  color: var(--nw-text-secondary, #6b7280);
  font-size: 14px;
  line-height: 1.6;
}

.branch-impact {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--nw-text-secondary, #6b7280);
}

.branch-characters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.char-tag {
  margin: 0;
}

.branch-action {
  text-align: right;
}
</style>
