<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Close, Delete, Upload } from '@element-plus/icons-vue';
import * as api from '../../api';
import { useAuthStore } from '../../stores/auth';
import { buildOverlayCoverAsset } from '../../utils/cover-text-overlay';
import { useCoverCandidateHistory } from '../../composables/use-cover-candidate-history';
import { fetchCoverConfig } from '../../api/settings';
import MobileCoverAiPanel from './MobileCoverAiPanel.vue';
import '../../styles/mobile-cover-editor.css';
import { brand } from '../../config/brand';

interface Props {
  visible: boolean;
  novelId: string;
  novelTitle?: string;
  currentCoverUrl?: string | null;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'updated'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const authStore = useAuthStore();

const sheetVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const allowUpload = ref(true);
const activeTab = ref<'upload' | 'ai'>('upload');
const uploadingFile = ref(false);
const deletingCover = ref(false);
const generatingPrompt = ref(false);
const generatingCover = ref(false);
const positivePrompt = ref('');
const negativePrompt = ref('');
const selectedSize = ref('832x1216');
const coverTitle = ref('');
const coverAuthor = ref('');
const applyingCandidate = ref<string | null>(null);
const overlayText = ref(true);

const coverStyleOverrides = ref<Record<string, string> | undefined>();

const {
  currentCandidates,
  historyCandidates,
  restoringHistory,
  replaceCurrentBatch,
  removeCandidate,
  togglePinned,
} = useCoverCandidateHistory(computed(() => props.novelId));

const SIZE_OPTIONS = [
  { label: '竖版 832×1216', value: '832x1216' },
  { label: '竖版 1024×1536', value: '1024x1536' },
  { label: '方图 1024×1024', value: '1024x1024' },
];

const resolvedAuthorName = computed(() =>
  authStore.user?.penName?.trim()
  || authStore.user?.username?.trim()
  || brand.displayName
);

const hasCurrentCover = computed(() => Boolean(props.currentCoverUrl));
const canGenerate = computed(() => positivePrompt.value.trim().length > 0);
const allCandidates = computed(() => [...currentCandidates.value, ...historyCandidates.value]);

/** AI生成模式：仅显示AI生成面板，不显示上传tab */
const isAiOnlyMode = computed(() => !allowUpload.value);

watch(() => props.visible, async (visible) => {
  if (visible) {
    positivePrompt.value = '';
    negativePrompt.value = '';
    coverTitle.value = props.novelTitle || '';
    coverAuthor.value = resolvedAuthorName.value;
    // 拉取系统设置判断是否允许上传封面
    try {
      const config = await fetchCoverConfig();
      allowUpload.value = !config.disableCoverUpload;
      if (config.disableCoverUpload) {
        activeTab.value = 'ai';
      } else {
        activeTab.value = 'upload';
      }
    } catch {
      // 拉取失败时保守处理：禁止上传
      allowUpload.value = false;
      activeTab.value = 'ai';
    }
  }
});

function closeSheet() {
  sheetVisible.value = false;
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 10MB');
    return;
  }

  uploadingFile.value = true;
  try {
    await api.uploadCover(props.novelId, file);
    ElMessage.success('封面上传成功');
    emit('updated');
    sheetVisible.value = false;
  } catch (err) {
    console.error('上传封面失败:', err);
    ElMessage.error(err instanceof Error ? err.message : '上传封面失败');
  } finally {
    uploadingFile.value = false;
    input.value = '';
  }
}

async function handleDeleteCover() {
  deletingCover.value = true;
  try {
    await api.deleteCover(props.novelId);
    ElMessage.success('封面已删除');
    emit('updated');
    sheetVisible.value = false;
  } catch (err) {
    console.error('删除封面失败:', err);
    ElMessage.error(err instanceof Error ? err.message : '删除封面失败');
  } finally {
    deletingCover.value = false;
  }
}

async function handleGeneratePrompt() {
  generatingPrompt.value = true;
  try {
    const result = await api.generateNovelCoverPrompt(
      props.novelId,
      !overlayText.value,
      coverAuthor.value.trim(),
      coverStyleOverrides.value,
    );
    positivePrompt.value = result.positivePrompt;
    negativePrompt.value = result.negativePrompt;
    selectedSize.value = result.recommendedSize || '832x1216';
    ElMessage.success('提示词生成成功');
  } catch (err) {
    console.error('生成提示词失败:', err);
    ElMessage.error(err instanceof Error ? err.message : '生成提示词失败');
  } finally {
    generatingPrompt.value = false;
  }
}

async function handleGenerateCover(saveResult: boolean) {
  if (!canGenerate.value) {
    ElMessage.warning('请先生成或填写提示词');
    return;
  }

  generatingCover.value = true;
  try {
    const result = await api.generateNovelCover({
      novelId: props.novelId,
      positivePrompt: positivePrompt.value,
      negativePrompt: negativePrompt.value,
      size: selectedSize.value,
      saveResult: false,
      generateText: !overlayText.value,
      authorName: coverAuthor.value.trim(),
      styleOverrides: coverStyleOverrides.value,
    });

    const imageSource = result.imageDataUrl || result.imageUrl;
    if (!imageSource) {
      throw new Error('未返回图像');
    }

    let previewUrl: string;
    let file: File;

    if (!overlayText.value) {
      // AI 生成文字：直接使用原始图像
      const res = await fetch(imageSource);
      const blob = await res.blob();
      file = new File([blob], `cover-${Date.now()}.png`, { type: blob.type || 'image/png' });
      previewUrl = URL.createObjectURL(blob);
    } else {
      // 系统叠加文字：使用 Canvas 合成
      const asset = await buildOverlayCoverAsset({
        imageUrl: imageSource,
        title: coverTitle.value.trim() || props.novelTitle || '',
        author: coverAuthor.value.trim(),
        style: 'webnovel',
        template: 'fanqie-action',
      });
      previewUrl = asset.objectUrl;
      file = asset.file;
    }

    const candidate = {
      id: `${Date.now()}-mobile-${Math.random().toString(36).slice(2, 8)}`,
      preset: { key: 'webnovel', label: '网文冲击', promptSuffix: '', hint: '' },
      template: 'fanqie-action' as const,
      previewUrl,
      file,
      requestedSize: result.requestedSize,
      actualSize: result.size,
      usedFallbackSize: result.usedFallbackSize,
      basePositivePrompt: positivePrompt.value.trim(),
      positivePrompt: result.positivePrompt,
      negativePrompt: result.negativePrompt,
    };

    if (saveResult) {
      await api.uploadCover(props.novelId, file, true);
      replaceCurrentBatch([candidate]);
      ElMessage.success('封面生成并保存成功');
      emit('updated');
      sheetVisible.value = false;
    } else {
      replaceCurrentBatch([candidate]);
      ElMessage.success('封面预览生成成功，已加入候选');
    }
  } catch (err) {
    console.error('生成封面失败:', err);
    ElMessage.error(err instanceof Error ? err.message : '生成封面失败');
  } finally {
    generatingCover.value = false;
  }
}

async function handleApplyCandidate(candidateId: string) {
  const candidate = allCandidates.value.find(c => c.id === candidateId);
  if (!candidate) return;

  applyingCandidate.value = candidateId;
  try {
    await api.uploadCover(props.novelId, candidate.file, true);
    ElMessage.success('封面已应用');
    emit('updated');
    sheetVisible.value = false;
  } catch (err) {
    console.error('应用封面失败:', err);
    ElMessage.error(err instanceof Error ? err.message : '应用封面失败');
  } finally {
    applyingCandidate.value = null;
  }
}

function handlePreview() {
  void handleGenerateCover(false);
}
</script>

<template>
  <div v-if="sheetVisible" class="mobile-cover-editor">
    <button
      class="mobile-cover-editor__backdrop"
      type="button"
      aria-label="关闭封面编辑"
      @click="closeSheet"
    ></button>

    <section
      class="mobile-cover-editor__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-cover-editor-title"
    >
      <header class="mobile-cover-editor__header">
        <div class="mobile-cover-editor__heading">
          <span class="mobile-cover-editor__kicker">Cover Studio</span>
          <h2 id="mobile-cover-editor-title">编辑封面</h2>
          <p>{{ novelTitle || '作品' }}</p>
        </div>
        <button class="mobile-cover-editor__icon-btn" type="button" aria-label="关闭" @click="closeSheet">
          <el-icon><Close /></el-icon>
        </button>
      </header>

      <div class="mobile-cover-editor__body">
        <div v-if="isAiOnlyMode" class="mobile-cover-editor__notice">
          <strong>AI 封面模式</strong>
          <p>封面统一由 AI 生成，出图后可在候选中挑选正式封面。</p>
        </div>

        <div v-else class="mobile-cover-editor__tabs" role="tablist" aria-label="封面编辑方式">
          <button
            class="mobile-cover-editor__tab"
            :class="{ 'is-active': activeTab === 'upload' }"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'upload'"
            @click="activeTab = 'upload'"
          >
            上传封面
          </button>
          <button
            class="mobile-cover-editor__tab"
            :class="{ 'is-active': activeTab === 'ai' }"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'ai'"
            @click="activeTab = 'ai'"
          >
            AI 生成
          </button>
        </div>

        <section v-if="!isAiOnlyMode && activeTab === 'upload'" class="mobile-cover-upload">
          <div v-if="hasCurrentCover" class="mobile-cover-upload__preview">
            <img :src="currentCoverUrl!" alt="当前封面" />
            <span>当前封面</span>
          </div>
          <div v-else class="mobile-cover-upload__empty">
            <span>封</span>
            <strong>给作品补上第一眼记忆点</strong>
            <p>封面会影响书城曝光和读者点击，建议使用竖版高清图片。</p>
          </div>

          <p class="mobile-cover-upload__hint">支持 JPG、PNG、WebP，建议 832×1216 或 1024×1536，不超过 10MB。</p>

          <div class="mobile-cover-editor__footer">
            <button class="mobile-cover-editor__secondary-btn" type="button" @click="closeSheet">取消</button>
            <label class="mobile-cover-editor__primary-btn" :class="{ 'is-disabled': uploadingFile }">
              <input
                class="mobile-cover-upload__input"
                type="file"
                accept="image/*"
                :disabled="uploadingFile"
                @change="handleFileSelect"
              />
              <span v-if="uploadingFile" class="mobile-cover-editor__spinner"></span>
              <el-icon v-else><Upload /></el-icon>
              {{ uploadingFile ? '上传中...' : hasCurrentCover ? '更换封面' : '上传封面' }}
            </label>
          </div>

          <button
            v-if="hasCurrentCover"
            class="mobile-cover-upload__delete"
            type="button"
            :disabled="deletingCover"
            @click="handleDeleteCover"
          >
            <span v-if="deletingCover" class="mobile-cover-editor__spinner"></span>
            <el-icon v-else><Delete /></el-icon>
            {{ deletingCover ? '删除中...' : '删除当前封面' }}
          </button>
        </section>

        <MobileCoverAiPanel
          v-else
          :novel-id="novelId"
          v-model:cover-title="coverTitle"
          v-model:cover-author="coverAuthor"
          v-model:overlay-text="overlayText"
          v-model:positive-prompt="positivePrompt"
          v-model:negative-prompt="negativePrompt"
          v-model:selected-size="selectedSize"
          :size-options="SIZE_OPTIONS"
          :generating-prompt="generatingPrompt"
          :generating-cover="generatingCover"
          :can-generate="canGenerate"
          :candidates="allCandidates"
          :applying-candidate="applyingCandidate"
          :restoring-history="restoringHistory"
          @update:style-overrides="(v) => { coverStyleOverrides = v; }"
          @close="closeSheet"
          @generate-prompt="handleGeneratePrompt"
          @generate-candidate="handlePreview"
          @apply-candidate="handleApplyCandidate"
          @toggle-pinned="togglePinned"
          @remove-candidate="removeCandidate"
        />
      </div>
    </section>
  </div>
</template>
