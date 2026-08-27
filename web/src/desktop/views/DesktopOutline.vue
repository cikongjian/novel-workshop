<script setup lang="ts">
/**
 * 桌面端·大纲管理
 * 复用 fetchOutline / updateOutline / generateOutline / syncOutline / analyzeOutline。
 * 三个板块：章节大纲（可编辑）+ 剧情线 + 伏笔。
 */
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchOutline, updateOutline } from '../../api/outline';
import { generateOutline, syncOutline, analyzeOutline } from '../../api/analytics';
import { extractApiErrorMessage } from '../../api/errors';
import type { OutlineData, ChapterOutline, PlotThread, Foreshadowing } from '../../types';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';

const props = defineProps<{ novelId: string }>();

const outline = ref<OutlineData | null>(null);
const loading = ref(false);
const loadError = ref('');
const activeTab = ref<'chapters' | 'threads' | 'foreshadowing'>('chapters');
const generating = ref(false);
const syncing = ref(false);
const analyzing = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    outline.value = await fetchOutline(props.novelId);
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载大纲失败');
  } finally {
    loading.value = false;
  }
}
load();

const chapterOutlines = computed<ChapterOutline[]>(() => outline.value?.chapters ?? []);
const plotThreads = computed<PlotThread[]>(() => outline.value?.plotThreads ?? []);
const foreshadowing = computed<Foreshadowing[]>(() => outline.value?.foreshadowing ?? []);
const unresolved = computed(() => foreshadowing.value.filter(f => !f.isResolved));
const resolved = computed(() => foreshadowing.value.filter(f => f.isResolved));

const PRIORITY_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' };
const THREAD_STATUS_LABELS: Record<string, string> = { planted: '已埋设', developing: '发展中', climaxing: '高潮', resolved: '已收束', abandoned: '废弃' };

/** 编辑章节大纲 */
const editVisible = ref(false);
const editingChapter = ref<ChapterOutline | null>(null);
const editForm = ref<{ title: string; summary: string; notes: string }>({ title: '', summary: '', notes: '' });
const saving = ref(false);

function openEditChapter(ch: ChapterOutline): void {
  editingChapter.value = ch;
  editForm.value = { title: ch.title, summary: ch.summary, notes: ch.notes };
  editVisible.value = true;
}

async function saveChapter(): Promise<void> {
  if (!editingChapter.value) return;
  saving.value = true;
  try {
    const updated = chapterOutlines.value.map(ch =>
      ch.chapterNumber === editingChapter.value!.chapterNumber
        ? { ...ch, ...editForm.value }
        : ch,
    );
    const result = await updateOutline(props.novelId, { chapters: updated });
    outline.value = result;
    editVisible.value = false;
    ElMessage.success('大纲已更新');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

/** AI 操作 */
async function aiGenerate(): Promise<void> {
  try {
    await ElMessageBox.confirm('AI 将根据作品信息生成完整大纲，覆盖现有大纲。确定？', '生成大纲', { type: 'warning', confirmButtonText: '生成' });
  } catch { return; }
  generating.value = true;
  try {
    await generateOutline(props.novelId, {});
    ElMessage.success('大纲生成完成');
    await load();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '生成失败'));
  } finally {
    generating.value = false;
  }
}

async function aiSync(): Promise<void> {
  syncing.value = true;
  try {
    const res = await syncOutline(props.novelId, {});
    ElMessage.success(res.message || '同步完成');
    await load();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '同步失败'));
  } finally {
    syncing.value = false;
  }
}

async function aiAnalyze(): Promise<void> {
  analyzing.value = true;
  try {
    const res = await analyzeOutline(props.novelId, {});
    ElMessage.success(res.message || '分析完成');
    await load();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '分析失败'));
  } finally {
    analyzing.value = false;
  }
}

const tabs = [
  { key: 'chapters', label: '章节大纲', count: computed(() => chapterOutlines.value.length) },
  { key: 'threads', label: '剧情线', count: computed(() => plotThreads.value.length) },
  { key: 'foreshadowing', label: '伏笔', count: computed(() => foreshadowing.value.length) },
] as const;
</script>

<template>
  <div class="desktop-outline">
    <!-- 板块头 -->
    <div class="nw-panel__head" style="padding:0 0 var(--nw-space-4)">
      <div class="outline-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="outline-tab"
          :class="{ 'is-active': activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="outline-tab-count">{{ tab.count.value }}</span>
        </button>
      </div>
      <div class="outline-actions">
        <button class="desktop-btn" :disabled="syncing" @click="aiSync"><Icon name="refresh" :size="14" /> {{ syncing ? '同步中…' : '同步' }}</button>
        <button class="desktop-btn" :disabled="analyzing" @click="aiAnalyze"><Icon name="layers" :size="14" /> {{ analyzing ? '分析中…' : '分析' }}</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="generating" @click="aiGenerate"><Icon name="sparkles" :size="14" /> {{ generating ? '生成中…' : 'AI 生成' }}</button>
      </div>
    </div>

    <StateView :loading="loading" :error="loadError ? new Error(loadError) : null" :error-message="loadError" :empty="!loading && !outline" @retry="load">
      <template #empty>
        <p class="nw-state__title">暂无大纲</p>
        <p class="nw-state__desc">点击「AI 生成」根据作品信息自动生成，或「同步」从已写章节提取。</p>
      </template>

      <!-- 章节大纲 -->
      <div v-if="activeTab === 'chapters'" class="outline-chapter-list">
        <div v-for="ch in chapterOutlines" :key="ch.chapterNumber" class="outline-chapter-card">
          <div class="outline-chapter-head">
            <span class="outline-chapter-num">第 {{ ch.chapterNumber }} 章</span>
            <span class="outline-chapter-title">{{ ch.title || '未命名' }}</span>
            <div class="outline-chapter-actions">
              <button class="chapter-action" title="编辑" @click="openEditChapter(ch)"><Icon name="pen" :size="14" /></button>
            </div>
          </div>
          <p v-if="ch.summary" class="outline-chapter-summary">{{ ch.summary }}</p>
          <div v-if="ch.keyEvents?.length" class="outline-key-events">
            <span v-for="ev in ch.keyEvents.slice(0,3)" :key="ev" class="nw-tag nw-tag--muted">{{ ev }}</span>
          </div>
          <div v-if="ch.tensionTarget" class="outline-tension">
            <span class="outline-tension-label">紧张度</span>
            <div class="outline-tension-bar"><div class="outline-tension-fill" :style="{ width: ch.tensionTarget + '%' }" /></div>
            <span class="outline-tension-value">{{ ch.tensionTarget }}</span>
          </div>
        </div>
      </div>

      <!-- 剧情线 -->
      <div v-else-if="activeTab === 'threads'" class="outline-thread-list">
        <div v-for="pt in plotThreads" :key="pt.id" class="outline-thread-card">
          <div class="outline-thread-head">
            <strong>{{ pt.name }}</strong>
            <span class="nw-tag" :class="{ 'nw-tag--muted': pt.status === 'abandoned' }">{{ THREAD_STATUS_LABELS[pt.status] || pt.status }}</span>
          </div>
          <p v-if="pt.description" class="outline-thread-desc">{{ pt.description }}</p>
          <div v-if="pt.relatedCharacters?.length" class="outline-thread-chars">
            <span v-for="c in pt.relatedCharacters.slice(0,4)" :key="c" class="nw-tag nw-tag--muted">{{ c }}</span>
          </div>
        </div>
        <div v-if="!plotThreads.length" class="outline-empty-tab">暂无剧情线</div>
      </div>

      <!-- 伏笔 -->
      <div v-else class="outline-foreshadowing-list">
        <div v-if="unresolved.length" class="outline-fs-group">
          <div class="outline-fs-group-label">未收束（{{ unresolved.length }}）</div>
          <div v-for="fs in unresolved" :key="fs.id" class="outline-fs-card" :class="'outline-fs-card--' + fs.priority">
            <div class="outline-fs-hint">{{ fs.hint }}</div>
            <div class="outline-fs-meta">
              <span class="nw-tag" :class="'priority-' + fs.priority">{{ PRIORITY_LABELS[fs.priority] || fs.priority }}</span>
              <span v-if="fs.plantedInChapter">第 {{ fs.plantedInChapter }} 章埋设</span>
            </div>
          </div>
        </div>
        <div v-if="resolved.length" class="outline-fs-group">
          <div class="outline-fs-group-label">已收束（{{ resolved.length }}）</div>
          <div v-for="fs in resolved" :key="fs.id" class="outline-fs-card outline-fs-card--resolved">
            <div class="outline-fs-hint">{{ fs.hint }}</div>
            <div class="outline-fs-meta">
              <span class="nw-tag nw-tag--muted">已收束</span>
              <span v-if="fs.resolvedInChapter">第 {{ fs.resolvedInChapter }} 章收束</span>
            </div>
          </div>
        </div>
        <div v-if="!foreshadowing.length" class="outline-empty-tab">暂无伏笔记录</div>
      </div>
    </StateView>

    <!-- 编辑章节大纲弹窗 -->
    <Modal v-model="editVisible" :title="`编辑大纲 · 第 ${editingChapter?.chapterNumber ?? ''} 章`" width="560px">
      <div class="nw-field">
        <label class="nw-field-label">章节标题</label>
        <input v-model="editForm.title" class="nw-input" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">章节摘要</label>
        <textarea v-model="editForm.summary" class="nw-textarea" rows="4" placeholder="本章的核心情节摘要" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">备注</label>
        <textarea v-model="editForm.notes" class="nw-textarea" rows="2" placeholder="创作备注" />
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="saving" @click="editVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="saving" @click="saveChapter">{{ saving ? '保存中…' : '保存' }}</button>
      </template>
    </Modal>
  </div>
</template>
