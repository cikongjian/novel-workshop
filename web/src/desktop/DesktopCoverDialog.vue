<script setup lang="ts">
/**
 * 桌面端·AI 封面生成弹窗（完整流程）
 * 复用移动端同一 API：fetchCoverStyleOptions → generateNovelCoverPrompt → generateNovelCover。
 * 三步：风格选择 → 提示词编辑 → 生成预览。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { resolveCoverSrc } from '../utils/deploy-path';
import Modal from '../components/shared/Modal.vue';
import Icon from '../components/shared/Icon.vue';
import {
  generateNovelCover,
  generateNovelCoverPrompt,
  fetchCoverStyleOptions,
  uploadCover,
  deleteCover,
  type CoverStyleOptions,
  type NovelCoverPromptResult,
  type GenerateNovelCoverResult,
} from '../api/novels';
import { extractApiErrorMessage } from '../api/errors';

const SIZE_OPTIONS = [
  { label: '竖版 832×1216', value: '832x1216' },
  { label: '竖版 1024×1536', value: '1024x1536' },
  { label: '方图 1024×1024', value: '1024x1024' },
];

const props = defineProps<{ modelValue: boolean; novelId: string; novelTitle: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; updated: [] }>();

const authStore = useAuthStore();

const styleOptions = ref<CoverStyleOptions | null>(null);
const styleLoading = ref(false);
const selected = ref<{ visualStyleKey?: string; formatKey?: string; eraKey?: string; moodKey?: string }>({});
const coverTitle = ref('');
const coverAuthor = ref('');
const generateText = ref(true);
const selectedSize = ref('832x1216');
const promptResult = ref<NovelCoverPromptResult | null>(null);
const editablePrompt = ref('');
const generatingPrompt = ref(false);
const generatingCover = ref(false);
const coverResult = ref<GenerateNovelCoverResult | null>(null);
const selectedCover = ref(false);
const applyingCover = ref(false);

const step = computed<'style' | 'prompt' | 'result'>(() => {
  if (coverResult.value) return 'result';
  if (promptResult.value) return 'prompt';
  return 'style';
});

function styleOverrides(): Record<string, string> | undefined {
  const s = selected.value;
  const keys = Object.keys(s).filter((k) => s[k as keyof typeof s]);
  return keys.length ? { ...s } : undefined;
}

async function loadStyleOptions(): Promise<void> {
  styleLoading.value = true;
  try {
    styleOptions.value = await fetchCoverStyleOptions(props.novelId);
  } catch {
    // 风格选项加载失败也能用默认生成
  } finally {
    styleLoading.value = false;
  }
}

async function genPrompt(): Promise<void> {
  generatingPrompt.value = true;
  try {
    const res = await generateNovelCoverPrompt(
      props.novelId,
      generateText.value,
      coverAuthor.value.trim() || undefined,
      styleOverrides(),
    );
    promptResult.value = res;
    editablePrompt.value = res.positivePrompt;
    if (res.recommendedSize) selectedSize.value = res.recommendedSize;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '提示词生成失败'));
  } finally {
    generatingPrompt.value = false;
  }
}

async function genCover(): Promise<void> {
  generatingCover.value = true;
  coverResult.value = null;
  selectedCover.value = false;
  try {
    const res = await generateNovelCover({
      novelId: props.novelId,
      positivePrompt: editablePrompt.value.trim() || promptResult.value?.positivePrompt,
      negativePrompt: promptResult.value?.negativePrompt,
      size: selectedSize.value,
      saveResult: false,
      generateText: generateText.value,
      authorName: coverAuthor.value.trim() || undefined,
    });
    coverResult.value = res;
    ElMessage.success('封面候选已生成，请选中后应用');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '封面生成失败'));
  } finally {
    generatingCover.value = false;
  }
}

function regenerate(): void {
  coverResult.value = null;
  selectedCover.value = false;
  promptResult.value = null;
  editablePrompt.value = '';
}

async function applyGeneratedCover(): Promise<void> {
  const source = resultImage();
  if (!coverResult.value || !selectedCover.value || !source) {
    ElMessage.warning('请先选中要应用的封面候选');
    return;
  }

  applyingCover.value = true;
  try {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to load cover candidate: ${response.status}`);
    }
    const blob = await response.blob();
    const file = new File([blob], `cover-${Date.now()}.png`, { type: blob.type || 'image/png' });
    await uploadCover(props.novelId, file, true);
    ElMessage.success('封面已应用');
    emit('updated');
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '应用封面失败'));
  } finally {
    applyingCover.value = false;
  }
}

async function onUpload(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await uploadCover(props.novelId, file, true);
    ElMessage.success('封面上传成功');
    emit('updated');
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '上传失败'));
  } finally {
    input.value = '';
  }
}

async function removeCover(): Promise<void> {
  try {
    await deleteCover(props.novelId);
    ElMessage.success('封面已删除');
    emit('updated');
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

function resultImage(): string {
  if (!coverResult.value) return '';
  // 优先 base64 data URL（直接可显示），其次 imageUrl（相对路径需补 /api 前缀）
  return coverResult.value.imageDataUrl || (coverResult.value.imageUrl ? resolveCoverSrc(coverResult.value.imageUrl) : '') || '';
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      coverResult.value = null;
      selectedCover.value = false;
      applyingCover.value = false;
      promptResult.value = null;
      editablePrompt.value = '';
      selected.value = {};
      coverTitle.value = props.novelTitle;
      coverAuthor.value = authStore.user?.penName?.trim() ?? '';
      generateText.value = true;
      void loadStyleOptions();
    }
  },
);
</script>

<template>
  <Modal :model-value="modelValue" title="AI 封面生成" width="600px" @update:model-value="(v) => emit('update:modelValue', v)">
    <!-- 步骤1: 风格选择 -->
    <template v-if="step === 'style'">
      <div v-if="styleLoading" class="cover-loading">加载风格选项…</div>
      <template v-else>
        <div class="nw-field">
          <label class="nw-field-label">封面标题（渲染到封面上）</label>
          <input v-model="coverTitle" class="nw-input" placeholder="留空则不显示" />
        </div>
        <div class="cover-form-grid">
          <div class="nw-field">
            <label class="nw-field-label">作者笔名</label>
            <input v-model="coverAuthor" class="nw-input" placeholder="留空则不显示" />
          </div>
          <div class="nw-field">
            <label class="nw-field-label">生成尺寸</label>
            <select v-model="selectedSize" class="nw-input">
              <option v-for="o in SIZE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>
        <div class="nw-field" style="flex-direction:row; align-items:center; gap:8px;">
          <input id="cover-gen-text" v-model="generateText" type="checkbox" />
          <label for="cover-gen-text" class="nw-field-label" style="margin:0;">在封面图上渲染标题和作者名</label>
        </div>
        <div class="cover-form-grid">
          <div class="nw-field">
            <label class="nw-field-label">视觉风格</label>
            <select v-model="selected.visualStyleKey" class="nw-input">
              <option :value="undefined">自动</option>
              <option v-for="o in styleOptions?.visualStyleOptions ?? []" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">画面格式</label>
            <select v-model="selected.formatKey" class="nw-input">
              <option :value="undefined">自动</option>
              <option v-for="o in styleOptions?.formatOptions ?? []" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">时代背景</label>
            <select v-model="selected.eraKey" class="nw-input">
              <option :value="undefined">自动</option>
              <option v-for="o in styleOptions?.eraOptions ?? []" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">氛围</label>
            <select v-model="selected.moodKey" class="nw-input">
              <option :value="undefined">自动</option>
              <option v-for="o in styleOptions?.moodOptions ?? []" :key="o.key" :value="o.key">{{ o.label }}</option>
            </select>
          </div>
        </div>
      </template>
    </template>

    <!-- 步骤2: 提示词编辑 -->
    <template v-else-if="step === 'prompt'">
      <div class="cover-prompt-hint">
        <Icon name="sparkles" :size="16" />
        <span>AI 已根据你的作品信息生成提示词，可编辑后生成封面：</span>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">正面提示词（可编辑）</label>
        <textarea v-model="editablePrompt" class="nw-textarea" rows="4" />
      </div>
      <div v-if="promptResult?.negativePrompt" class="nw-field">
        <label class="nw-field-label">负面提示词</label>
        <textarea :value="promptResult.negativePrompt" class="nw-textarea" rows="2" readonly />
      </div>
    </template>

    <!-- 步骤3: 生成结果 -->
    <template v-else>
      <div class="cover-preview">
        <button
          v-if="resultImage()"
          class="cover-result-candidate"
          :class="{ 'is-selected': selectedCover }"
          type="button"
          :aria-pressed="selectedCover"
          @click="selectedCover = true"
        >
          <img :src="resultImage()" class="cover-result-img" alt="封面" />
          <span class="cover-result-select">{{ selectedCover ? '已选中' : '点击选中' }}</span>
        </button>
      </div>
      <p v-if="coverResult?.prompt" class="cover-result-prompt">提示词：{{ coverResult.prompt.slice(0, 100) }}…</p>
    </template>

    <template #footer>
      <button class="desktop-btn" @click="emit('update:modelValue', false)">关闭</button>
      <label v-if="step === 'style'" class="desktop-btn">
        <input type="file" accept="image/*" style="display:none" @change="onUpload" />
        上传
      </label>
      <button v-if="step === 'style'" class="desktop-btn" @click="removeCover">删除</button>
      <button v-if="step === 'style'" class="desktop-btn desktop-btn--primary" :disabled="generatingPrompt" @click="genPrompt">
        {{ generatingPrompt ? '生成提示词…' : '生成提示词' }}
      </button>
      <button v-if="step === 'prompt'" class="desktop-btn" @click="promptResult = null">返回风格</button>
      <button v-if="step === 'prompt'" class="desktop-btn desktop-btn--primary" :disabled="generatingCover" @click="genCover">
        {{ generatingCover ? '生成封面中…（最长3分钟）' : '生成封面' }}
      </button>
      <button v-if="step === 'result'" class="desktop-btn" @click="regenerate">重新生成</button>
      <button
        v-if="step === 'result'"
        class="desktop-btn desktop-btn--primary"
        :disabled="!selectedCover || applyingCover"
        @click="applyGeneratedCover"
      >
        {{ applyingCover ? '应用中...' : '应用封面' }}
      </button>
    </template>
  </Modal>
</template>
