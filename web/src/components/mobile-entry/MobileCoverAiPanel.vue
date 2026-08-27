<script setup lang="ts">
import { MagicStick, Picture } from '@element-plus/icons-vue';
import type { CoverCandidate } from '../dashboard/ai-cover-candidate-types';
import MobileCoverCandidateGrid from './MobileCoverCandidateGrid.vue';
import MobileCoverStylePanel from './MobileCoverStylePanel.vue';
import '../../styles/mobile-cover-ai.css';

defineProps<{
  novelId: string;
  coverTitle: string;
  coverAuthor: string;
  overlayText: boolean;
  positivePrompt: string;
  negativePrompt: string;
  selectedSize: string;
  sizeOptions: Array<{ label: string; value: string }>;
  generatingPrompt: boolean;
  generatingCover: boolean;
  canGenerate: boolean;
  candidates: CoverCandidate[];
  applyingCandidate: string | null;
  restoringHistory: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:coverTitle', value: string): void;
  (e: 'update:coverAuthor', value: string): void;
  (e: 'update:overlayText', value: boolean): void;
  (e: 'update:positivePrompt', value: string): void;
  (e: 'update:negativePrompt', value: string): void;
  (e: 'update:selectedSize', value: string): void;
  (e: 'update:styleOverrides', value: Record<string, string> | undefined): void;
  (e: 'close'): void;
  (e: 'generate-prompt'): void;
  (e: 'generate-candidate'): void;
  (e: 'apply-candidate', candidateId: string): void;
  (e: 'toggle-pinned', candidateId: string): void;
  (e: 'remove-candidate', candidateId: string): void;
}>();

function getInputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function getCheckedValue(event: Event) {
  return (event.target as HTMLInputElement).checked;
}
</script>

<template>
  <section class="mobile-cover-ai">
    <div class="mobile-cover-ai__fields">
      <label class="mobile-cover-editor__field">
        <span>封面书名</span>
        <input
          :value="coverTitle"
          maxlength="40"
          placeholder="作品封面标题"
          @input="emit('update:coverTitle', getInputValue($event))"
        />
      </label>

      <label class="mobile-cover-editor__field">
        <span>作者笔名</span>
        <input
          :value="coverAuthor"
          maxlength="24"
          placeholder="展示在封面上的作者名"
          @input="emit('update:coverAuthor', getInputValue($event))"
        />
      </label>
    </div>

    <label class="mobile-cover-ai__toggle">
      <span class="mobile-cover-ai__toggle-copy">
        <strong>系统叠加文字</strong>
        <span>{{ overlayText ? '由系统合成书名和作者，画面更干净' : '让 AI 在底图中直接生成文字' }}</span>
      </span>
      <input
        type="checkbox"
        :checked="overlayText"
        @change="emit('update:overlayText', getCheckedValue($event))"
      />
      <span class="mobile-cover-ai__switch" aria-hidden="true"></span>
    </label>

    <MobileCoverStylePanel
      :novel-id="novelId"
      @update:style-overrides="(v) => emit('update:styleOverrides', v)"
    />

    <div class="mobile-cover-editor__section">
      <div class="mobile-cover-editor__section-head">
        <span>生成尺寸</span>
        <small>优先竖版封面</small>
      </div>
      <div class="mobile-cover-editor__chip-row">
        <button
          v-for="option in sizeOptions"
          :key="option.value"
          class="mobile-cover-editor__chip"
          :class="{ 'is-active': selectedSize === option.value }"
          type="button"
          @click="emit('update:selectedSize', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <button
      class="mobile-cover-ai__generate-prompt"
      type="button"
      :disabled="generatingPrompt"
      @click="emit('generate-prompt')"
    >
      <span v-if="generatingPrompt" class="mobile-cover-editor__spinner"></span>
      <el-icon v-else><MagicStick /></el-icon>
      {{ generatingPrompt ? '提示词生成中...' : positivePrompt.trim() ? '重新生成提示词' : 'AI 生成提示词' }}
    </button>

    <div class="mobile-cover-editor__section">
      <label class="mobile-cover-editor__field mobile-cover-editor__field--textarea">
        <span>正向提示词</span>
        <textarea
          :value="positivePrompt"
          rows="5"
          placeholder="描述希望呈现的封面画面"
          @input="emit('update:positivePrompt', getInputValue($event))"
        ></textarea>
      </label>

      <label class="mobile-cover-editor__field mobile-cover-editor__field--textarea">
        <span>负向提示词</span>
        <textarea
          :value="negativePrompt"
          rows="3"
          placeholder="排除不希望出现的元素"
          @input="emit('update:negativePrompt', getInputValue($event))"
        ></textarea>
      </label>
    </div>

    <MobileCoverCandidateGrid
      :candidates="candidates"
      :applying-candidate="applyingCandidate"
      :restoring-history="restoringHistory"
      @apply-candidate="(candidateId) => emit('apply-candidate', candidateId)"
      @toggle-pinned="(candidateId) => emit('toggle-pinned', candidateId)"
      @remove-candidate="(candidateId) => emit('remove-candidate', candidateId)"
    />

    <div class="mobile-cover-editor__footer">
      <button class="mobile-cover-editor__secondary-btn" type="button" @click="emit('close')">取消</button>
      <button
        class="mobile-cover-editor__primary-btn"
        type="button"
        :disabled="generatingCover || !canGenerate"
        @click="emit('generate-candidate')"
      >
        <span v-if="generatingCover" class="mobile-cover-editor__spinner"></span>
        <el-icon v-else><Picture /></el-icon>
        {{ generatingCover ? '生成中...' : '生成候选' }}
      </button>
    </div>
  </section>
</template>
