<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowUp, Close, MagicStick } from '@element-plus/icons-vue';
import { expandIdea, rewriteChapter } from '../../api/generate';
import {
  STYLE_PRESET_OPTIONS,
  WORD_LIMIT_OPTIONS,
  resolveMaxWordCount,
  type StylePresetOption,
  type WordLimitOption,
} from '../../config/chapter-generation-options';
import { extractApiErrorMessage } from '../../utils/api-error';
import type { ChapterSummary } from '../../types';

type RewriteMode = 'rewrite' | 'polish';

const props = withDefaults(defineProps<{
  visible: boolean;
  novelId: string;
  chapterSummary: ChapterSummary | null;
  mode?: RewriteMode;
}>(), {
  mode: 'rewrite',
});

const emit = defineEmits<{
  'update:visible': [value: boolean];
  rewritten: [payload: { chapterNumber: number }];
}>();

const advancedVisible = ref(false);
const submitting = ref(false);
const expandingDirection = ref(false);
const expandingStyle = ref(false);
const userDirection = ref('');
const stylePreset = ref<StylePresetOption>('auto');
const styleNotes = ref('');
const wordLimitOption = ref<WordLimitOption>('3000');
const customWordLimit = ref(3000);

const chapterNumber = computed(() => props.chapterSummary?.chapterNumber ?? null);
const modeCopy = computed(() => (props.mode === 'polish'
  ? {
      eyebrow: 'Polish',
      title: '润色本章',
      description: '保留原有剧情和关键设定，重点优化节奏、语气、画面感和表达顺滑度。',
      fieldLabel: '润色重点',
      placeholder: '可选：说明这次想优化什么，比如减少解释感、增强画面、让对白更自然。',
      assistLabel: 'AI 扩写重点',
      submitting: '润色中...',
      submit: '开始润色本章',
      success: '已润色',
      error: '润色章节失败',
    }
  : {
      eyebrow: 'Rewrite',
      title: '重新生成本章',
      description: '重新跑一次这一章的生成流程，可以补方向，也可以直接按默认策略重写。',
      fieldLabel: '重写方向',
      placeholder: '可选：说明这次想改什么，比如加快推进、强化反转、降低解释感。',
      assistLabel: 'AI 扩写方向',
      submitting: '重写中...',
      submit: '开始重写本章',
      success: '已重写',
      error: '重写章节失败',
    }
));

function resetForm() {
  advancedVisible.value = false;
  userDirection.value = props.mode === 'polish' ? '保留本章剧情与人物行动，只润色语言表达、节奏衔接、对白自然度和画面感，不新增大段剧情。' : '';
  stylePreset.value = 'auto';
  styleNotes.value = '';
  wordLimitOption.value = '3000';
  customWordLimit.value = 3000;
}

function closeSheet() {
  emit('update:visible', false);
}

async function handleExpand(field: 'direction' | 'styleNotes') {
  const text = field === 'direction' ? userDirection.value : styleNotes.value;
  if (!props.novelId || chapterNumber.value == null || !text.trim()) {
    ElMessage.info('先输入一点方向或风格描述再扩写');
    return;
  }

  const target = field === 'direction' ? expandingDirection : expandingStyle;
  target.value = true;
  try {
    const result = await expandIdea({
      novelId: props.novelId,
      text: text.trim(),
      field,
      chapterNumber: chapterNumber.value,
    });
    if (result.expanded) {
      if (field === 'direction') {
        userDirection.value = result.expanded;
      } else {
        styleNotes.value = result.expanded;
      }
    }
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '扩写失败'));
  } finally {
    target.value = false;
  }
}

async function submit() {
  if (!props.novelId || chapterNumber.value == null || submitting.value) return;
  submitting.value = true;
  try {
    const result = await rewriteChapter({
      novelId: props.novelId,
      chapterNumber: chapterNumber.value,
      userDirection: userDirection.value.trim() || undefined,
      stylePreset: stylePreset.value,
      styleNotes: styleNotes.value.trim() || undefined,
      maxWordCount: resolveMaxWordCount(wordLimitOption.value, customWordLimit.value),
    });
    const rewriteDelta = typeof result.similarity === 'number'
      ? Math.round((1 - result.similarity) * 100)
      : null;
    ElMessage.success(
      rewriteDelta != null
        ? `第 ${chapterNumber.value} 章已重写，差异约 ${rewriteDelta}%`
        : `第 ${chapterNumber.value} 章已重写`,
    );
    emit('rewritten', { chapterNumber: chapterNumber.value });
    emit('update:visible', false);
  } catch (err) {
    await showMobileByokErrorGuide(err, modeCopy.value.error, router);
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.visible,
  (value) => {
    if (value) {
      resetForm();
    }
  },
);
</script>

<template>
  <transition name="mobile-create-sheet-fade">
    <div v-if="visible" class="mobile-rewrite-sheet">
      <button class="mobile-rewrite-sheet__backdrop" type="button" :aria-label="`关闭${modeCopy.title}面板`" @click="closeSheet" />

      <transition name="mobile-create-sheet-rise">
        <section class="mobile-rewrite-sheet__panel" role="dialog" aria-modal="true" :aria-label="modeCopy.title">
          <header class="mobile-rewrite-sheet__header">
            <div class="mobile-rewrite-sheet__title">
              <span class="mobile-rewrite-sheet__eyebrow">{{ modeCopy.eyebrow }}</span>
              <strong>{{ modeCopy.title }}</strong>
              <p>{{ modeCopy.description }}</p>
            </div>

            <button class="mobile-rewrite-sheet__close" type="button" aria-label="关闭" @click="closeSheet">
              <el-icon :size="16"><Close /></el-icon>
            </button>
          </header>

          <div class="mobile-rewrite-sheet__body">
            <div class="mobile-rewrite-sheet__chapter-row">
              <span class="mobile-rewrite-sheet__chapter-label">章节</span>
              <strong>第 {{ chapterNumber ?? '--' }} 章</strong>
            </div>

            <label class="mobile-rewrite-sheet__field">
              <span>{{ modeCopy.fieldLabel }}</span>
              <el-input
                v-model="userDirection"
                type="textarea"
                :rows="5"
                resize="none"
                :placeholder="modeCopy.placeholder"
              />
              <button
                class="mobile-rewrite-sheet__assist"
                type="button"
                :disabled="!userDirection.trim() || expandingDirection"
                @click="handleExpand('direction')"
              >
                <el-icon :size="14"><MagicStick /></el-icon>
                {{ expandingDirection ? '扩写中...' : modeCopy.assistLabel }}
              </button>
            </label>

            <button class="mobile-rewrite-sheet__toggle" type="button" @click="advancedVisible = !advancedVisible">
              <span>高级设置</span>
              <el-icon :size="14">
                <ArrowUp v-if="advancedVisible" />
                <ArrowDown v-else />
              </el-icon>
            </button>

            <div v-if="advancedVisible" class="mobile-rewrite-sheet__advanced">
              <label class="mobile-rewrite-sheet__field">
                <span>风格预设</span>
                <el-select v-model="stylePreset" style="width: 100%">
                  <el-option
                    v-for="item in STYLE_PRESET_OPTIONS"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </label>

              <label class="mobile-rewrite-sheet__field">
                <span>风格补充</span>
                <el-input
                  v-model="styleNotes"
                  type="textarea"
                  :rows="4"
                  resize="none"
                  maxlength="500"
                  show-word-limit
                  placeholder="可选：补充语气、节奏、镜头感或平台口味。"
                />
                <button
                  class="mobile-rewrite-sheet__assist"
                  type="button"
                  :disabled="!styleNotes.trim() || expandingStyle"
                  @click="handleExpand('styleNotes')"
                >
                  <el-icon :size="14"><MagicStick /></el-icon>
                  {{ expandingStyle ? '扩写中...' : 'AI 扩写风格' }}
                </button>
              </label>

              <label class="mobile-rewrite-sheet__field">
                <span>最大字数</span>
                <el-select v-model="wordLimitOption" style="width: 100%">
                  <el-option
                    v-for="item in WORD_LIMIT_OPTIONS"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </label>

              <label v-if="wordLimitOption === 'custom'" class="mobile-rewrite-sheet__field">
                <span>自定义字数</span>
                <el-input-number
                  v-model="customWordLimit"
                  :min="800"
                  :max="20000"
                  :step="100"
                  style="width: 100%"
                />
              </label>
            </div>
          </div>

          <footer class="mobile-rewrite-sheet__footer">
            <button class="mobile-focus-button--secondary" type="button" @click="closeSheet">
              取消
            </button>
            <button
              class="mobile-focus-button--primary mobile-rewrite-sheet__submit"
              type="button"
              :aria-busy="submitting"
              @click="submit"
            >
              {{ submitting ? modeCopy.submitting : modeCopy.submit }}
            </button>
          </footer>
        </section>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.mobile-rewrite-sheet {
  position: fixed;
  inset: 0;
  z-index: 47;
  display: grid;
  align-items: end;
}

.mobile-rewrite-sheet__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(7, 17, 27, 0.42);
  backdrop-filter: blur(14px);
}

.mobile-rewrite-sheet__panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  max-height: min(88vh, 760px);
  padding: 16px 16px calc(14px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  border: 1px solid color-mix(in srgb, var(--star-brand-gold) 16%, var(--nw-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-status-gold, var(--nw-warning)) 12%, transparent), transparent 28%),
    radial-gradient(circle at top left, color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent), transparent 22%),
    linear-gradient(180deg, color-mix(in srgb, var(--nw-bg-card) 96%, var(--nw-bg-secondary)), var(--nw-bg-secondary));
  box-shadow: 0 -16px 40px color-mix(in srgb, var(--nw-text-primary) 16%, transparent);
  overflow: hidden;
}

.mobile-rewrite-sheet__header,
.mobile-rewrite-sheet__chapter-row,
.mobile-rewrite-sheet__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mobile-rewrite-sheet__title {
  display: grid;
  gap: 3px;
}

.mobile-rewrite-sheet__eyebrow {
  display: inline-flex;
  width: fit-content;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-status-gold, var(--nw-warning)) 10%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-gold, var(--nw-warning)) 82%, var(--nw-text-primary));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.mobile-rewrite-sheet__title strong {
  font-size: 22px;
  line-height: 1.08;
  letter-spacing: -0.03em;
  color: var(--nw-text-primary);
}

.mobile-rewrite-sheet__title p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--nw-text-secondary);
}

.mobile-rewrite-sheet__close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--nw-border);
  background: color-mix(in srgb, var(--nw-bg-card) 92%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
}

.mobile-rewrite-sheet__body {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
  padding-bottom: 4px;
}

.mobile-rewrite-sheet__chapter-row {
  align-items: center;
  padding: 9px 11px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--nw-bg-card) 88%, var(--nw-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--mobile-focus-status-gold, var(--nw-warning)) 18%, var(--nw-border));
}

.mobile-rewrite-sheet__chapter-label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.mobile-rewrite-sheet__chapter-row strong {
  font-size: 14px;
  color: var(--nw-text-primary);
}

.mobile-rewrite-sheet__field {
  display: grid;
  gap: 7px;
}

.mobile-rewrite-sheet__field > span {
  font-size: 13px;
  font-weight: 700;
  color: var(--nw-text-secondary);
}

.mobile-rewrite-sheet__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--nw-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--nw-bg-card) 92%, var(--nw-bg-secondary));
  font-size: 12px;
  font-weight: 700;
  color: var(--nw-text-primary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mobile-rewrite-sheet__advanced {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--nw-bg-card) 90%, var(--nw-bg-secondary));
  border: 1px solid var(--nw-border);
}

.mobile-rewrite-sheet__assist {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-status-gold, var(--nw-warning)) 24%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-bg-card) 94%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold, var(--nw-warning)) 82%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 700;
}

.mobile-rewrite-sheet :deep(.el-textarea__inner),
.mobile-rewrite-sheet :deep(.el-input__wrapper),
.mobile-rewrite-sheet :deep(.el-select__wrapper),
.mobile-rewrite-sheet :deep(.el-input-number .el-input__wrapper) {
  border: 1px solid var(--nw-border);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  background: linear-gradient(180deg, var(--nw-bg-secondary), color-mix(in srgb, var(--nw-bg-card) 96%, var(--nw-bg-secondary)));
  color: var(--nw-text-primary);
}

.mobile-rewrite-sheet :deep(.el-textarea__inner) {
  min-height: 116px;
  padding: 13px 14px;
  border-radius: 14px;
  line-height: 1.7;
}

.mobile-rewrite-sheet :deep(.el-input__wrapper),
.mobile-rewrite-sheet :deep(.el-select__wrapper),
.mobile-rewrite-sheet :deep(.el-input-number .el-input__wrapper) {
  min-height: 46px;
  border-radius: 14px;
  padding-inline: 13px;
}

.mobile-rewrite-sheet :deep(.el-input-number) {
  width: 100%;
}

.mobile-rewrite-sheet__submit {
  min-width: 144px;
}

@media (max-width: 420px) {
  .mobile-rewrite-sheet__panel {
    padding-left: 14px;
    padding-right: 14px;
  }

  .mobile-rewrite-sheet__footer {
    display: grid;
    grid-template-columns: 1fr;
  }

  .mobile-rewrite-sheet__submit {
    min-width: 0;
  }
}
</style>
