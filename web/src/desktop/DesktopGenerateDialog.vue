<script setup lang="ts">
/**
 * 桌面端·生成章节选项弹窗
 * 复用 config/chapter-generation-options（风格/字数选项）+ resolveMaxWordCount。
 * 确认后 emit generate 选项，由工作台调用 api.generateChapter。
 */
import { ref, watch } from 'vue';
import Modal from '../components/shared/Modal.vue';
import Icon from '../components/shared/Icon.vue';
import {
  STYLE_PRESET_OPTIONS,
  WORD_LIMIT_OPTIONS,
  resolveMaxWordCount,
  type StylePresetOption,
  type WordLimitOption,
} from '../config/chapter-generation-options';

const props = defineProps<{ modelValue: boolean; chapterNumber: number }>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  generate: [opts: { userDirection?: string; stylePreset: StylePresetOption; maxWordCount: number }];
}>();

const userDirection = ref('');
const stylePreset = ref<StylePresetOption>('auto');
const styleNotes = ref('');
const wordLimit = ref<WordLimitOption>('3000');
const customWordLimit = ref(3000);
const startupPlatformProfile = ref<'auto' | 'fanqie' | 'qidian'>('auto');

watch(() => props.modelValue, (v) => {
  if (v) { userDirection.value = ''; styleNotes.value = ''; }
});

function submit(): void {
  emit('generate', {
    userDirection: userDirection.value.trim() || undefined,
    stylePreset: stylePreset.value,
    styleNotes: styleNotes.value.trim() || undefined,
    startupPlatformProfile: startupPlatformProfile.value,
    maxWordCount: resolveMaxWordCount(wordLimit.value, customWordLimit.value),
  });
  emit('update:modelValue', false);
}
</script>

<template>
  <Modal :model-value="modelValue" :title="`生成第 ${chapterNumber} 章`" width="520px" @update:model-value="(v) => emit('update:modelValue', v)">
    <div class="nw-field">
      <label class="nw-field-label">创作指引（可选）</label>
      <textarea v-model="userDirection" class="nw-textarea" placeholder="本章想强调什么、避免什么、希望怎么发展…" maxlength="500" />
    </div>
    <div class="cover-form-grid">
      <div class="nw-field">
        <label class="nw-field-label">文风</label>
        <select v-model="stylePreset" class="nw-input">
          <option v-for="o in STYLE_PRESET_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">平台调性</label>
        <select v-model="startupPlatformProfile" class="nw-input">
          <option value="auto">自动</option>
          <option value="fanqie">番茄风格（快节奏爽文）</option>
          <option value="qidian">起点风格（传统网文）</option>
        </select>
      </div>
    </div>
    <div class="nw-field">
      <label class="nw-field-label">风格备注（可选）</label>
      <input v-model="styleNotes" class="nw-input" placeholder="如：多写对话、少用心理描写" maxlength="200" />
    </div>
    <div class="nw-field">
      <label class="nw-field-label">目标字数</label>
      <select v-model="wordLimit" class="nw-input">
        <option v-for="o in WORD_LIMIT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input v-if="wordLimit === 'custom'" v-model.number="customWordLimit" type="number" min="500" step="500" class="nw-input" style="margin-top:8px" />
    </div>

    <template #footer>
      <button class="desktop-btn" @click="emit('update:modelValue', false)">取消</button>
      <button class="desktop-btn desktop-btn--primary" @click="submit">
        <Icon name="sparkles" :size="16" /> 开始生成
      </button>
    </template>
  </Modal>
</template>
