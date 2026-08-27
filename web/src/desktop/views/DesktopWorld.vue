<script setup lang="ts">
/**
 * 桌面端·世界设定
 * 复用 fetchWorldEntries / createWorldEntry / updateWorldEntry / deleteWorldEntry。
 * 按分类分组展示 + 编辑弹窗。
 */
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchWorldEntries, createWorldEntry, updateWorldEntry, deleteWorldEntry } from '../../api/world';
import { extractApiErrorMessage } from '../../api/errors';
import { WORLD_CATEGORY_LABELS, type WorldEntry, type WorldCategory } from '../../types';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';

const props = defineProps<{ novelId: string }>();
const emit = defineEmits<{ 'request-refresh': [] }>();

const entries = ref<WorldEntry[]>([]);
const loading = ref(false);
const loadError = ref('');
const activeCategory = ref<WorldCategory | 'all'>('all');

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    entries.value = await fetchWorldEntries(props.novelId);
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载世界设定失败');
  } finally {
    loading.value = false;
  }
}
load();

const CATEGORY_ORDER: WorldCategory[] = ['geography', 'history', 'faction', 'power', 'culture', 'rule', 'other'];
const CATEGORY_ICONS: Record<WorldCategory, string> = {
  geography: 'globe', history: 'bookOpen', faction: 'layers', power: 'sparkles', culture: 'book', rule: 'settings', other: 'store',
};

const categories = computed(() => {
  const map = new Map<WorldCategory, number>();
  for (const e of entries.value) map.set(e.category, (map.get(e.category) ?? 0) + 1);
  return CATEGORY_ORDER.filter(c => map.has(c)).map(c => ({ key: c, label: WORLD_CATEGORY_LABELS[c] ?? c, count: map.get(c) ?? 0 }));
});

const filtered = computed(() => activeCategory.value === 'all' ? entries.value : entries.value.filter(e => e.category === activeCategory.value));

/** 编辑弹窗 */
const editVisible = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const form = ref<{ name: string; category: WorldCategory; description: string }>({ name: '', category: 'other', description: '' });

function openCreate(): void {
  editingId.value = null;
  form.value = { name: '', category: activeCategory.value === 'all' ? 'other' : activeCategory.value, description: '' };
  editVisible.value = true;
}

function openEdit(e: WorldEntry): void {
  editingId.value = e.id;
  form.value = { name: e.name, category: e.category, description: e.description };
  editVisible.value = true;
}

async function save(): Promise<void> {
  if (!form.value.name.trim()) { ElMessage.warning('请输入名称'); return; }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateWorldEntry(props.novelId, editingId.value, form.value);
      ElMessage.success('已更新');
    } else {
      await createWorldEntry(props.novelId, form.value);
      ElMessage.success('已创建');
    }
    editVisible.value = false;
    await load();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function remove(e: WorldEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除「${e.name}」？`, '删除', { type: 'warning', confirmButtonText: '删除' });
  } catch { return; }
  try {
    await deleteWorldEntry(props.novelId, e.id);
    ElMessage.success('已删除');
    await load();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}
</script>

<template>
  <div class="desktop-world">
    <div class="nw-panel__head" style="padding:0 0 var(--nw-space-4)">
      <h2 class="nw-panel__title">世界设定 <span class="desktop-section-count">{{ entries.length }}</span></h2>
      <button class="desktop-btn desktop-btn--primary" @click="openCreate"><Icon name="plus" :size="14" /> 新建条目</button>
    </div>

    <StateView :loading="loading" :error="loadError ? new Error(loadError) : null" :error-message="loadError" :empty="!loading && entries.length === 0" @retry="load">
      <template #empty>
        <p class="nw-state__title">还没有世界设定</p>
        <p class="nw-state__desc">添加地理、历史、势力、力量体系等世界设定，AI 创作时会自动检索参考。</p>
      </template>

      <!-- 分类筛选 -->
      <div v-if="entries.length" class="world-categories">
        <button class="world-cat-btn" :class="{ 'is-active': activeCategory === 'all' }" @click="activeCategory = 'all'">全部 {{ entries.length }}</button>
        <button v-for="c in categories" :key="c.key" class="world-cat-btn" :class="{ 'is-active': activeCategory === c.key }" @click="activeCategory = c.key">
          <Icon :name="CATEGORY_ICONS[c.key]" :size="12" /> {{ c.label }} {{ c.count }}
        </button>
      </div>

      <!-- 条目列表 -->
      <div class="world-grid">
        <div v-for="e in filtered" :key="e.id" class="world-card">
          <div class="world-card-head">
            <div class="world-card-icon"><Icon :name="CATEGORY_ICONS[e.category]" :size="16" /></div>
            <div class="world-card-info">
              <div class="world-card-name">{{ e.name }}</div>
              <span class="nw-tag nw-tag--muted">{{ WORLD_CATEGORY_LABELS[e.category] ?? e.category }}</span>
            </div>
          </div>
          <p v-if="e.description" class="world-card-desc">{{ e.description }}</p>
          <div v-if="e.tags?.length" class="world-card-tags">
            <span v-for="t in e.tags.slice(0,4)" :key="t" class="nw-tag nw-tag--muted">{{ t }}</span>
          </div>
          <div class="world-card-actions">
            <button class="chapter-action" title="编辑" @click="openEdit(e)"><Icon name="pen" :size="14" /></button>
            <button class="chapter-action chapter-action--danger" title="删除" @click="remove(e)"><Icon name="close" :size="14" /></button>
          </div>
        </div>
      </div>
    </StateView>

    <!-- 编辑弹窗 -->
    <Modal v-model="editVisible" :title="editingId ? '编辑条目' : '新建条目'" width="520px">
      <div class="nw-field">
        <label class="nw-field-label">名称 *</label>
        <input v-model="form.name" class="nw-input" placeholder="如：昆仑山脉" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">分类</label>
        <select v-model="form.category" class="nw-input">
          <option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ WORLD_CATEGORY_LABELS[c] ?? c }}</option>
        </select>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">描述</label>
        <textarea v-model="form.description" class="nw-textarea" rows="4" placeholder="详细设定描述" />
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="saving" @click="editVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </Modal>
  </div>
</template>
