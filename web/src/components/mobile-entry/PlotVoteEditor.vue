<template>
  <div v-if="visible" class="plot-vote-editor mobile-focus-light-vars">
    <div class="plot-vote-editor__backdrop" @click="close" />
    <div class="plot-vote-editor__panel">
      <div class="plot-vote-editor__header">
        <span class="plot-vote-editor__title">剧情分叉投票</span>
        <button class="plot-vote-editor__close" @click="close">关闭</button>
      </div>

      <div class="plot-vote-editor__body">
        <!-- 问题 -->
        <div class="plot-vote-editor__field">
          <label class="plot-vote-editor__label">投票问题</label>
          <input
            v-model="form.question"
            class="plot-vote-editor__input"
            placeholder="下一章的剧情走向？"
            maxlength="100"
          />
        </div>

        <!-- 选项 -->
        <div class="plot-vote-editor__field">
          <div class="plot-vote-editor__options-header">
            <label class="plot-vote-editor__label">选项（2-4 个）</label>
            <button
              class="plot-vote-editor__ai-btn"
              :disabled="aiGenerating"
              @click="generateWithOptions"
            >
              <el-icon :size="13"><MagicStick /></el-icon>
              {{ aiGenerating ? 'AI 生成中...' : 'AI 生成选项' }}
            </button>
          </div>
          <div class="plot-vote-editor__options">
            <div v-for="(opt, i) in form.options" :key="i" class="plot-vote-editor__option-row">
              <span class="plot-vote-editor__option-index">{{ String.fromCharCode(65 + i) }}</span>
              <input
                v-model="form.options[i]"
                class="plot-vote-editor__input"
                :placeholder="`选项 ${String.fromCharCode(65 + i)}`"
                maxlength="50"
              />
              <button
                v-if="form.options.length > 2"
                class="plot-vote-editor__option-remove"
                aria-label="移除选项"
                @click="removeOption(i)"
              >
                <el-icon :size="14"><Close /></el-icon>
              </button>
            </div>
          </div>
          <button
            v-if="form.options.length < 4"
            class="plot-vote-editor__add-option"
            @click="addOption"
          >
            <el-icon :size="14"><Plus /></el-icon>
            添加选项
          </button>
        </div>

        <!-- 截止时间 -->
        <div class="plot-vote-editor__field">
          <label class="plot-vote-editor__label">投票截止</label>
          <div class="plot-vote-editor__deadline-options">
            <button
              v-for="h in [12, 24, 48, 72]"
              :key="h"
              class="plot-vote-editor__deadline-btn"
              :class="{ 'plot-vote-editor__deadline-btn--active': form.deadlineHours === h }"
              @click="form.deadlineHours = h"
            >{{ h }} 小时</button>
          </div>
        </div>
      </div>

      <div v-if="error" class="plot-vote-editor__error">{{ error }}</div>

      <div class="plot-vote-editor__footer">
        <button class="plot-vote-editor__btn plot-vote-editor__btn--ghost" @click="close">取消</button>
        <button
          class="plot-vote-editor__btn plot-vote-editor__btn--primary"
          :disabled="!canSave || saving"
          @click="save"
        >
          {{ saving ? '保存中...' : (existing ? '更新' : '保存') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Close, MagicStick, Plus } from '@element-plus/icons-vue';
import { usePlotVote } from '../../composables/usePlotVote';
import { generateVoteOptions } from '../../api/plot-votes';
import type { VotePointWithStats } from '../../api/plot-votes';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  chapterId: string;
  existing?: VotePointWithStats | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const vote = usePlotVote();

const form = reactive({
  question: '',
  options: ['', ''],
  deadlineHours: 24,
});

const saving = computed(() => vote.saving.value);
const error = computed(() => vote.error.value);
const aiGenerating = ref(false);

const canSave = computed(() => {
  return (
    form.question.trim().length > 0 &&
    form.options.filter((o) => o.trim().length > 0).length >= 2
  );
});

async function generateWithOptions() {
  if (aiGenerating.value || !props.novelId || !props.chapterId) return;
  aiGenerating.value = true;
  try {
    const result = await generateVoteOptions(props.novelId, props.chapterId);
    form.question = result.question;
    form.options = result.options.slice(0, 4);
    while (form.options.length < 2) form.options.push('');
    ElMessage.success('AI 已生成选项，可自行调整');
  } catch (err: any) {
    const msg = err?.response?.data?.error || 'AI 生成失败，请稍后再试';
    ElMessage.error(msg);
  } finally {
    aiGenerating.value = false;
  }
}

watch(
  () => [props.visible, props.existing] as const,
  ([val, existing]) => {
    if (val) {
      if (existing) {
        form.question = existing.question;
        form.options = existing.options.map((o) => o.text);
        const hours = Math.round((existing.deadline - existing.createdAt) / 3600_000);
        form.deadlineHours = [12, 24, 48, 72].includes(hours) ? hours : 24;
      } else {
        form.question = '';
        form.options = ['', ''];
        form.deadlineHours = 24;
      }
    }
  },
);

function addOption() {
  if (form.options.length < 4) form.options.push('');
}

function removeOption(i: number) {
  if (form.options.length > 2) form.options.splice(i, 1);
}

function close() {
  emit('close');
}

async function save() {
  if (!canSave.value) return;
  const cleanOptions = form.options.map((o) => o.trim()).filter(Boolean);
  if (props.existing) {
    const result = await vote.update(props.existing.id, {
      question: form.question.trim(),
      options: cleanOptions,
      deadlineHours: form.deadlineHours,
    });
    if (result) emit('saved');
  } else {
    const result = await vote.create({
      novelId: props.novelId,
      chapterId: props.chapterId,
      question: form.question.trim(),
      options: cleanOptions,
      deadlineHours: form.deadlineHours,
    });
    if (result) emit('saved');
  }
}
</script>

<style scoped>
.plot-vote-editor {
  position: fixed;
  inset: 0;
  z-index: 2100;
  color-scheme: light;
}
.plot-vote-editor__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--nw-text-primary) 50%, transparent);
}
.plot-vote-editor__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  max-height: 85dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.plot-vote-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 62%, transparent);
  flex-shrink: 0;
}
.plot-vote-editor__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--nw-text-primary);
}
.plot-vote-editor__close {
  border: none;
  background: none;
  font-size: 14px;
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  cursor: pointer;
}
.plot-vote-editor__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}
.plot-vote-editor__field {
  margin-bottom: 20px;
}
.plot-vote-editor__label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  margin-bottom: 8px;
}
.plot-vote-editor__input {
  width: 100%;
  height: 44px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 78%, transparent);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 15px;
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
  outline: none;
  font-family: inherit;
}
.plot-vote-editor__input:focus {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 72%, var(--nw-border));
}
.plot-vote-editor__options-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.plot-vote-editor__options-header .plot-vote-editor__label {
  margin-bottom: 0;
}
.plot-vote-editor__ai-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 68%, var(--nw-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 7%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.plot-vote-editor__ai-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-bg-secondary));
}
.plot-vote-editor__ai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.plot-vote-editor__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plot-vote-editor__option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.plot-vote-editor__option-index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mobile-focus-accent) 14%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.plot-vote-editor__option-remove {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 88%, var(--nw-text-primary));
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.plot-vote-editor__add-option {
  margin-top: 8px;
  border: 1px dashed color-mix(in srgb, var(--nw-border) 86%, transparent);
  background: none;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  cursor: pointer;
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.plot-vote-editor__deadline-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.plot-vote-editor__deadline-btn {
  padding: 8px 16px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 78%, transparent);
  border-radius: 10px;
  background: var(--nw-bg-secondary);
  font-size: 14px;
  color: var(--nw-text-secondary);
  cursor: pointer;
}
.plot-vote-editor__deadline-btn--active {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 72%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 9%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-weight: 600;
}
.plot-vote-editor__error {
  padding: 8px 20px;
  font-size: 13px;
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 88%, var(--nw-text-primary));
  flex-shrink: 0;
}
.plot-vote-editor__footer {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 62%, transparent);
  flex-shrink: 0;
}
.plot-vote-editor__btn {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}
.plot-vote-editor__btn--ghost {
  background: color-mix(in srgb, var(--nw-border) 28%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
}
.plot-vote-editor__btn--primary {
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
}
.plot-vote-editor__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
