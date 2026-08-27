<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import Icon from '../../components/shared/Icon.vue';
import { http } from '../../api/http';
import { QUIZ_QUESTIONS_FULL } from '../../data/quiz-questions';

interface QItem {
  questionId: number;
  hasImage: boolean;
  prompt: string;
  question: string;
  illustrationPrompt: string;
  previewB64?: string;
}

const currentIdx = ref(0);
const items = ref<QItem[]>([]);
const loading = ref(false);
const busy = ref(false);
const total = 35;
const promptText = ref('');

const completedCount = computed(() => items.value.filter((i) => i.hasImage).length);
const progressPercent = computed(() => ((currentIdx.value + 1) / total) * 100);

function syncPromptFromItem() {
  const item = items.value[currentIdx.value];
  promptText.value = item?.prompt ?? '';
}

function syncPromptToItem() {
  const item = items.value[currentIdx.value];
  if (item && item.prompt !== promptText.value) {
    item.prompt = promptText.value;
  }
}

const cur = () => items.value[currentIdx.value]!;

function goPrev() {
  if (currentIdx.value <= 0) return;
  syncPromptToItem();
  currentIdx.value--;
  syncPromptFromItem();
}

function goNext() {
  if (currentIdx.value >= total - 1) return;
  syncPromptToItem();
  currentIdx.value++;
  syncPromptFromItem();
}

function goTo(idx: number) {
  syncPromptToItem();
  currentIdx.value = idx;
  syncPromptFromItem();
}

async function loadAll() {
  loading.value = true;
  try {
    const { data } = await http.get('/admin/dna-illustrations');
    items.value = (data as Array<{ questionId: number; hasImage: boolean; prompt: string }>).map(
      (item) => {
        const q = QUIZ_QUESTIONS_FULL.find((qq) => qq.id === item.questionId);
        return {
          questionId: item.questionId,
          hasImage: item.hasImage,
          prompt: item.prompt || '',
          question: q?.question ?? `第 ${item.questionId} 题`,
          illustrationPrompt: q?.illustrationPrompt ?? '',
        };
      },
    );
    if (items.value.length) promptText.value = items.value[0]!.prompt;
  } catch {
    ElMessage.error('加载失败');
  } finally {
    loading.value = false;
  }
}

async function generatePrompt() {
  const item = cur();
  busy.value = true;
  try {
    ElMessage.info('正在生成提示词...');
    const res = await http.post(`/admin/dna-illustrations/${item.questionId}/generate-prompt`, {
      rawPrompt: item.illustrationPrompt || item.question || '',
    });
    const prompt = (res.data as { prompt?: string }).prompt?.trim();
    if (!prompt) {
      ElMessage.error('模型返回空内容，请检查模型配置或稍后重试');
      return;
    }
    promptText.value = prompt;
    await nextTick();
    ElMessage.success('提示词已生成并保存');
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '生成失败';
    ElMessage.error(msg);
  } finally {
    busy.value = false;
  }
}

async function savePrompt() {
  if (!promptText.value.trim()) {
    ElMessage.warning('请输入提示词');
    return;
  }
  busy.value = true;
  try {
    await http.put(`/admin/dna-illustrations/${cur().questionId}/prompt`, {
      prompt: promptText.value.trim(),
    });
    syncPromptToItem();
    ElMessage.success('已保存');
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '保存失败';
    ElMessage.error(msg);
  } finally {
    busy.value = false;
  }
}

async function generateImage() {
  if (!promptText.value.trim()) {
    ElMessage.warning('请先生成或填写提示词');
    return;
  }
  const item = cur();
  busy.value = true;
  try {
    ElMessage.info('正在生成插画（约 10-30 秒）...');
    const { data } = await http.post(
      `/admin/dna-illustrations/${item.questionId}/generate-image`,
      { prompt: promptText.value.trim() },
    );
    item.prompt = promptText.value.trim();
    item.hasImage = true;
    item.previewB64 = (data as { b64Data?: string }).b64Data ?? undefined;
    ElMessage.success('插画生成成功');
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '生成失败';
    ElMessage.error(msg);
  } finally {
    busy.value = false;
  }
}

async function deleteImage() {
  const item = cur();
  busy.value = true;
  try {
    await http.delete(`/admin/dna-illustrations/${item.questionId}`);
    item.hasImage = false;
    item.previewB64 = undefined;
    ElMessage.success('已删除');
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '删除失败';
    ElMessage.error(msg);
  } finally {
    busy.value = false;
  }
}

function imageSrc(item: QItem): string | undefined {
  if (item.previewB64) return `data:image/png;base64,${item.previewB64}`;
  if (item.hasImage) return `/api/fun/dna/illustration/${item.questionId}`;
  return undefined;
}

onMounted(() => {
  void loadAll();
});
</script>

<template>
  <div class="desktop-admin-dna">
    <div class="desktop-greeting">
      <h1>DNA 插画管理</h1>
      <p>爽点测试题库插画管理，共 {{ total }} 题，已完成 {{ completedCount }} 张。</p>
    </div>

    <!-- 进度条 -->
    <div class="nw-panel">
      <div class="dna-progress-head">
        <span>第 {{ currentIdx + 1 }} / {{ total }} 题</span>
        <span>{{ completedCount }} 张已生成</span>
      </div>
      <div class="dna-progress-bar">
        <div class="dna-progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
    </div>

    <div v-if="loading" class="nw-state nw-state--loading nw-panel">
      <span class="nw-state__spinner" />
      <span>加载中…</span>
    </div>

    <div v-else-if="items.length" class="dna-layout">
      <!-- 左侧：题目列表 -->
      <div class="nw-panel dna-question-list">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">题目列表</h2>
        </div>
        <div class="question-grid">
          <button
            v-for="(item, idx) in items"
            :key="item.questionId"
            class="question-item"
            :class="{
              'is-active': idx === currentIdx,
              'has-image': item.hasImage,
            }"
            @click="goTo(idx)"
          >
            <span class="question-num">{{ item.questionId }}</span>
            <Icon v-if="item.hasImage" name="image" :size="12" class="question-check" />
          </button>
        </div>
      </div>

      <!-- 右侧：编辑区 -->
      <div class="dna-editor">
        <!-- 插画预览 -->
        <div class="nw-panel dna-preview-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">插画预览</h2>
          </div>
          <div class="dna-preview">
            <img
              v-if="cur().hasImage"
              :src="imageSrc(cur())"
              class="dna-preview-image"
              alt=""
            />
            <div v-else class="dna-empty">
              <Icon name="image" :size="48" />
              <p>未生成插画</p>
              <span>先完善提示词，再生成插画</span>
            </div>
          </div>
        </div>

        <!-- 题目信息 -->
        <div class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">第 {{ cur().questionId }} 题</h2>
          </div>
          <div class="dna-question-info" style="padding: 0 var(--nw-space-5) var(--nw-space-5);">
            <p class="dna-question-text">{{ cur().question }}</p>
            <p class="dna-question-hint">
              <strong>原始提示：</strong>{{ cur().illustrationPrompt || '无' }}
            </p>
          </div>
        </div>

        <!-- Prompt 编辑 -->
        <div class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">生图提示词</h2>
            <div class="dna-prompt-actions">
              <button class="desktop-btn" :disabled="busy" @click="generatePrompt">
                <Icon name="sparkles" :size="14" /> AI 生成
              </button>
              <button class="desktop-btn desktop-btn--primary" :disabled="busy" @click="savePrompt">
                <Icon name="save" :size="14" /> 保存
              </button>
            </div>
          </div>
          <div style="padding: 0 var(--nw-space-5) var(--nw-space-5);">
            <textarea
              v-model="promptText"
              class="dna-textarea"
              rows="6"
              placeholder="输入或生成插画 prompt..."
            ></textarea>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">操作</h2>
          </div>
          <div class="dna-actions" style="padding: 0 var(--nw-space-5) var(--nw-space-5);">
            <button
              class="desktop-btn desktop-btn--primary"
              :disabled="busy || !promptText.trim()"
              @click="generateImage"
            >
              <Icon name="image" :size="14" />
              {{ cur().hasImage ? '重新生成插画' : '生成插画' }}
            </button>
            <button
              v-if="cur().hasImage"
              class="desktop-btn desktop-btn--danger"
              :disabled="busy"
              @click="deleteImage"
            >
              <Icon name="trash2" :size="14" /> 删除插画
            </button>
          </div>
        </div>

        <!-- 上/下题导航 -->
        <div class="dna-nav">
          <button
            class="desktop-btn"
            :disabled="currentIdx <= 0"
            @click="goPrev"
          >
            <Icon name="arrowLeft" :size="14" /> 上一题
          </button>
          <button
            class="desktop-btn"
            :disabled="currentIdx >= total - 1"
            @click="goNext"
          >
            下一题 <Icon name="arrowRight" :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-admin-dna {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.dna-progress-head {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--nw-text-secondary);
  margin-bottom: var(--nw-space-3);
}

.dna-progress-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  overflow: hidden;
}

.dna-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--nw-accent-gradient);
  transition: width 0.3s ease;
}

.dna-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: var(--nw-space-5);
  align-items: start;
}

.dna-question-list {
  position: sticky;
  top: var(--nw-space-5);
}

.question-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  padding: var(--nw-space-4);
}

.question-item {
  position: relative;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--nw-border);
  border-radius: var(--nw-radius-sm);
  background: var(--nw-bg-primary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 500;
  color: var(--nw-text-secondary);
}

.question-item:hover {
  border-color: var(--nw-accent-start);
  color: var(--nw-text-primary);
}

.question-item.is-active {
  border-color: var(--nw-accent-strong);
  background: color-mix(in srgb, var(--nw-accent-start) 12%, transparent);
  color: var(--nw-accent-strong);
  font-weight: 600;
}

.question-item.has-image {
  border-color: var(--nw-success);
}

.question-item.has-image.is-active {
  border-color: var(--nw-success);
  background: color-mix(in srgb, var(--nw-success) 12%, transparent);
  color: var(--nw-success);
}

.question-check {
  position: absolute;
  top: 2px;
  right: 2px;
  color: var(--nw-success);
}

.dna-editor {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.dna-preview-panel {
  padding-bottom: var(--nw-space-5);
}

.dna-preview {
  display: grid;
  place-items: center;
  min-height: 300px;
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-md);
  margin: 0 var(--nw-space-5);
  overflow: hidden;
}

.dna-preview-image {
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
}

.dna-empty {
  text-align: center;
  color: var(--nw-text-muted);
}

.dna-empty svg {
  margin-bottom: var(--nw-space-3);
  opacity: 0.5;
}

.dna-empty p {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  margin: 0 0 4px 0;
}

.dna-empty span {
  font-size: 13px;
}

.dna-question-info {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.dna-question-text {
  font-size: 15px;
  line-height: 1.7;
  color: var(--nw-text-primary);
  margin: 0;
}

.dna-question-hint {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin: 0;
}

.dna-question-hint strong {
  color: var(--nw-text-primary);
}

.dna-prompt-actions {
  display: flex;
  gap: var(--nw-space-2);
}

.dna-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-primary);
  color: var(--nw-text-primary);
  font-size: 14px;
  line-height: 1.6;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.dna-textarea:focus {
  border-color: var(--nw-accent-strong);
}

.dna-actions {
  display: flex;
  gap: var(--nw-space-3);
}

.dna-nav {
  display: flex;
  justify-content: space-between;
  gap: var(--nw-space-4);
}
</style>
