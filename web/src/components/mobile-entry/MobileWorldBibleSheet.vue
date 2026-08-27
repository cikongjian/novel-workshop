<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, Close, MagicStick, Refresh, Select } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import {
  applyWorldBible,
  fetchWorldEntries,
  previewWorldBible,
  type WorldBibleDomain,
  type WorldBiblePreview,
  type WorldBibleProposalEntry,
} from '../../api/world';

const props = defineProps<{
  visible: boolean;
  novelId: string;
}>();

const emit = defineEmits<{
  close: [];
  applied: [{ createdCount: number; updatedCount: number }];
}>();

const loading = ref(false);
const generating = ref(false);
const applying = ref(false);
const currentCount = ref(0);
const preview = ref<WorldBiblePreview | null>(null);
const selectedIds = ref<Set<string>>(new Set());

const DOMAIN_META: Array<{ id: WorldBibleDomain; label: string }> = [
  { id: 'geography', label: '地理' },
  { id: 'power', label: '力量' },
  { id: 'faction', label: '势力' },
  { id: 'history', label: '历史' },
  { id: 'culture', label: '文化' },
  { id: 'economy', label: '资源' },
  { id: 'rule', label: '规则' },
  { id: 'knowledge', label: '秘密边界' },
];

const CATEGORY_LABELS: Record<WorldBibleProposalEntry['category'], string> = {
  geography: '地理',
  history: '历史',
  faction: '势力',
  power: '力量',
  culture: '文化',
  rule: '规则',
  other: '其他',
};

const selectedEntries = computed(() =>
  preview.value?.entries.filter(entry => entry.tempId && selectedIds.value.has(entry.tempId)) ?? [],
);

const allSelected = computed(() =>
  Boolean(preview.value?.entries.length)
  && selectedEntries.value.length === preview.value?.entries.length,
);

function setSelected(next: Set<string>) {
  selectedIds.value = new Set(next);
}

function toggleEntry(entry: WorldBibleProposalEntry) {
  if (!entry.tempId) return;
  const next = new Set(selectedIds.value);
  if (next.has(entry.tempId)) next.delete(entry.tempId);
  else next.add(entry.tempId);
  setSelected(next);
}

function toggleAll() {
  if (!preview.value) return;
  if (allSelected.value) {
    setSelected(new Set());
    return;
  }
  setSelected(new Set(preview.value.entries.flatMap(entry => entry.tempId ? [entry.tempId] : [])));
}

async function loadCurrentCount() {
  if (!props.novelId) return;
  loading.value = true;
  try {
    currentCount.value = (await fetchWorldEntries(props.novelId)).length;
  } catch {
    currentCount.value = 0;
  } finally {
    loading.value = false;
  }
}

async function generatePreview() {
  generating.value = true;
  try {
    const result = await previewWorldBible(props.novelId);
    preview.value = result;
    setSelected(new Set(result.entries.flatMap(entry => entry.tempId ? [entry.tempId] : [])));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '世界圣经生成失败');
  } finally {
    generating.value = false;
  }
}

async function confirmApply() {
  if (!preview.value || selectedEntries.value.length === 0) return;
  applying.value = true;
  try {
    const result = await applyWorldBible(
      props.novelId,
      selectedEntries.value,
      preview.value.summary,
    );
    currentCount.value += result.createdCount;
    ElMessage.success(`世界正史已更新：新增 ${result.createdCount} 条，完善 ${result.updatedCount} 条`);
    emit('applied', {
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
    });
    emit('close');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '世界正史更新失败');
  } finally {
    applying.value = false;
  }
}

watch(() => props.visible, (visible) => {
  if (!visible) return;
  preview.value = null;
  setSelected(new Set());
  void loadCurrentCount();
});
</script>

<template>
  <div v-if="visible" class="mobile-world-bible">
    <button class="mobile-world-bible__backdrop" type="button" aria-label="关闭世界圣经" @click="emit('close')" />
    <section class="mobile-world-bible__panel" aria-label="世界圣经">
      <header class="mobile-world-bible__header">
        <div>
          <span>世界圣经</span>
          <small>{{ loading ? '正在读取世界正史' : `已沉淀 ${currentCount} 条世界知识` }}</small>
        </div>
        <button class="mobile-world-bible__icon-button" type="button" title="关闭" @click="emit('close')">
          <el-icon :size="20"><Close /></el-icon>
        </button>
      </header>

      <div class="mobile-world-bible__body">
        <template v-if="!preview">
          <div class="mobile-world-bible__intro">
            <el-icon :size="28"><MagicStick /></el-icon>
            <strong>让世界先站稳，再把故事写长</strong>
            <p>从作品方向和现有设定中整理地理、力量、势力、历史、文化与资源规则，确认后才会进入正史。</p>
          </div>
          <button class="mobile-world-bible__primary" type="button" :disabled="generating" @click="generatePreview">
            <el-icon :size="17"><Refresh /></el-icon>
            {{ generating ? '正在构建世界骨架' : currentCount > 0 ? '重新梳理世界圣经' : '构建世界圣经' }}
          </button>
        </template>

        <template v-else>
          <p class="mobile-world-bible__summary">{{ preview.summary }}</p>

          <div class="mobile-world-bible__coverage" aria-label="知识覆盖状态">
            <div
              v-for="domain in DOMAIN_META"
              :key="domain.id"
              class="mobile-world-bible__coverage-item"
              :data-status="preview.coverage[domain.id].status"
            >
              <span>{{ domain.label }}</span>
              <small>{{ preview.coverage[domain.id].status === 'covered' ? '已覆盖' : preview.coverage[domain.id].status === 'partial' ? '待完善' : '待建立' }}</small>
            </div>
          </div>

          <div class="mobile-world-bible__selection-head">
            <strong>待确认设定</strong>
            <button type="button" @click="toggleAll">
              <el-icon :size="15"><Select /></el-icon>
              {{ allSelected ? '取消全选' : '全部选择' }}
            </button>
          </div>

          <div class="mobile-world-bible__entries">
            <button
              v-for="entry in preview.entries"
              :key="entry.tempId || entry.name"
              class="mobile-world-bible__entry"
              :class="{ 'is-selected': entry.tempId && selectedIds.has(entry.tempId) }"
              type="button"
              @click="toggleEntry(entry)"
            >
              <span class="mobile-world-bible__check">
                <el-icon v-if="entry.tempId && selectedIds.has(entry.tempId)" :size="14"><Check /></el-icon>
              </span>
              <span class="mobile-world-bible__entry-copy">
                <span class="mobile-world-bible__entry-title">
                  <strong>{{ entry.name }}</strong>
                  <small>{{ CATEGORY_LABELS[entry.category] }} · {{ entry.canonStatus === 'supported' ? '有依据' : '新提案' }}</small>
                </span>
                <span>{{ entry.description }}</span>
              </span>
            </button>
          </div>
        </template>
      </div>

      <footer v-if="preview" class="mobile-world-bible__footer">
        <button class="mobile-world-bible__secondary" type="button" :disabled="generating || applying" @click="generatePreview">
          重新生成
        </button>
        <button class="mobile-world-bible__primary" type="button" :disabled="applying || selectedEntries.length === 0" @click="confirmApply">
          <el-icon :size="17"><Check /></el-icon>
          {{ applying ? '正在写入正史' : `确认 ${selectedEntries.length} 条入库` }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style src="../../styles/mobile-world-bible.css"></style>
