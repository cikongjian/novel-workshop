<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowUp, Close, EditPen } from '@element-plus/icons-vue';
import { generateChapter, isGenerateChapterAccepted } from '../../api/generate';
import MobileAgentLiveStream from './MobileAgentLiveStream.vue';
import MobileVoteResultHint from './MobileVoteResultHint.vue';
import { useNovelGenerationStatusPolling } from '../../composables/useNovelGenerationStatusPolling';
import {
  STYLE_PRESET_OPTIONS,
  WORD_LIMIT_OPTIONS,
  resolveMaxWordCount,
  type StylePresetOption,
  type WordLimitOption,
} from '../../config/chapter-generation-options';
import {
  STARTUP_PLATFORM_PROFILE_OPTIONS,
  type StartupPlatformProfileOption,
} from '../../config/startup-platform-profile';
import {
  extractApiErrorMessage,
  isRecoverableLongRunningRequestError,
} from '../../utils/api-error';
import { useAgentsStore } from '../../stores/agents';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  novelTitle?: string;
  nextChapterNumber: number;
  defaultStartupPlatformProfile?: StartupPlatformProfileOption;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  generated: [payload: { chapterNumber: number; autoOpen: boolean }];
  'open-batch': [];
}>();

const agentsStore = useAgentsStore();
const advancedVisible = ref(false);
const generating = ref(false);
const keepAutoOpenOnComplete = ref(true);
const userDirection = ref('');
const stylePreset = ref<StylePresetOption>('auto');
const styleNotes = ref('');
const startupPlatformProfile = ref<StartupPlatformProfileOption>('auto');
const wordLimitOption = ref<WordLimitOption>('3000');
const customWordLimit = ref(3000);
const novelIdRef = computed(() => props.novelId);

// 移动端使用 HTTP 轮询替代 WebSocket
const { latestStatus } = useNovelGenerationStatusPolling(novelIdRef);

const isGeneratingHere = computed(() => agentsStore.isGeneratingNovel(props.novelId));
const generatingChapterNumber = computed(() =>
  isGeneratingHere.value ? agentsStore.getGeneratingChapterNumberForNovel(props.novelId) : null,
);
/** 后端真实 Agent 状态（来自轮询），透传给直播流组件 */
const liveAgentStatuses = computed(() => latestStatus.value?.agentStatuses ?? null);
const liveWritingAssistantOutput = computed(() => latestStatus.value?.writingAssistantOutput ?? null);

const showStartupPlatformProfile = computed(() => props.nextChapterNumber <= 3);
const showGeneratingState = computed(() => generating.value || isGeneratingHere.value);
const targetChapterNumber = computed(() => generatingChapterNumber.value ?? props.nextChapterNumber);
const previousChapterNumber = computed(() => (
  props.nextChapterNumber > 1 ? props.nextChapterNumber - 1 : null
));
const sheetTitle = computed(() => (
  showGeneratingState.value
    ? `第 ${targetChapterNumber.value} 章生成中`
    : `生成第 ${props.nextChapterNumber} 章`
));
const sheetEyebrow = computed(() => (showGeneratingState.value ? '后台生成中' : '开始写作'));
const summaryText = computed(() => (
  showGeneratingState.value
    ? `当前已经进入生成管线，可直接关闭窗口，稍后回来继续看进度。`
    : props.novelTitle
    ? `给《${props.novelTitle}》定个本章走向，直接开写也行。`
    : '定个本章走向，直接开写也行。'
));
const submitLabel = computed(() => (showGeneratingState.value ? '后台生成中' : '开始生成'));
const secondaryActionLabel = computed(() => (showGeneratingState.value ? '关闭窗口' : '取消'));

function resetForm() {
  advancedVisible.value = false;
  generating.value = false;
  keepAutoOpenOnComplete.value = true;
  userDirection.value = '';
  styleNotes.value = '';
  stylePreset.value = 'auto';
  startupPlatformProfile.value = props.defaultStartupPlatformProfile ?? 'auto';
  wordLimitOption.value = '3000';
  customWordLimit.value = 3000;
}

function closeSheet() {
  if (showGeneratingState.value) {
    keepAutoOpenOnComplete.value = false;
    ElMessage.success(`第 ${targetChapterNumber.value} 章会继续在后台生成，可稍后回来查看。`);
  }
  emit('update:visible', false);
}

async function submit() {
  if (!props.novelId || showGeneratingState.value) return;
  generating.value = true;
  keepAutoOpenOnComplete.value = true;
  agentsStore.markNovelGenerationPending({
    novelId: props.novelId,
    chapterNumber: props.nextChapterNumber,
    message: `第 ${props.nextChapterNumber} 章已提交，正在准备生成流程…`,
  });
  try {
    const result = await generateChapter({
      novelId: props.novelId,
      chapterNumber: props.nextChapterNumber,
      userDirection: userDirection.value.trim() || undefined,
      maxWordCount: resolveMaxWordCount(wordLimitOption.value, customWordLimit.value),
      startupPlatformProfile: startupPlatformProfile.value,
      stylePreset: stylePreset.value,
      styleNotes: styleNotes.value.trim() || undefined,
    });
    if (isGenerateChapterAccepted(result)) {
      ElMessage.success(`第 ${props.nextChapterNumber} 章已进入后台生成，完成后会自动刷新。`);
      return;
    }

    ElMessage.success(`第 ${props.nextChapterNumber} 章已生成`);
    emit('generated', {
      chapterNumber: result.chapterNumber ?? props.nextChapterNumber,
      autoOpen: keepAutoOpenOnComplete.value,
    });
    emit('update:visible', false);
  } catch (err) {
    if (isRecoverableLongRunningRequestError(err)) {
      ElMessage.warning(`第 ${props.nextChapterNumber} 章请求已超时，后台可能仍在继续生成。你可以关闭弹窗，稍后回来查看完成结果。`);
      return;
    }

    agentsStore.resetActiveGenerationState({
      novelId: props.novelId,
      chapterNumber: props.nextChapterNumber,
    });
    ElMessage.error(extractApiErrorMessage(err, '章节生成失败'));
  } finally {
    generating.value = false;
  }
}

async function startAutoGenerate() {
  if (!props.novelId || showGeneratingState.value) return false;
  resetForm();
  await submit();
  return true;
}

watch(
  () => props.visible,
  (value) => {
    if (value && !showGeneratingState.value) {
      resetForm();
    }
  },
);

watch(isGeneratingHere, (value) => {
  if (value) {
    generating.value = false;
  }
});

watch(
  () => props.defaultStartupPlatformProfile,
  (value) => {
    if (!props.visible) return;
    startupPlatformProfile.value = value ?? 'auto';
  },
);

defineExpose({
  startAutoGenerate,
});
</script>

<template>
  <transition name="mobile-create-sheet-fade">
    <div v-if="visible" class="mobile-create-sheet">
      <button class="mobile-create-sheet__backdrop" type="button" aria-label="关闭生成弹层" @click="closeSheet" />

      <transition name="mobile-create-sheet-rise">
        <section class="mobile-create-sheet__panel" role="dialog" aria-modal="true" :aria-label="sheetTitle">
          <header class="mobile-create-sheet__header">
            <div class="mobile-create-sheet__title">
              <span class="mobile-create-sheet__eyebrow">{{ sheetEyebrow }}</span>
              <strong>{{ sheetTitle }}</strong>
              <p>{{ summaryText }}</p>
            </div>

            <button
              class="mobile-create-sheet__close"
              type="button"
              aria-label="关闭"
              @click="closeSheet"
            >
              <el-icon :size="16"><Close /></el-icon>
            </button>
          </header>

          <div class="mobile-create-sheet__body">
            <div class="mobile-create-sheet__chapter-row">
              <span class="mobile-create-sheet__chapter-label">章节编号</span>
              <strong>第 {{ targetChapterNumber }} 章</strong>
            </div>

            <MobileVoteResultHint
              :visible="visible"
              :novel-id="novelId"
              :previous-chapter-number="previousChapterNumber"
              @adopt="(text) => { userDirection = userDirection ? userDirection + '\n' + text : text; }"
            />

            <template v-if="!showGeneratingState">
              <label class="mobile-create-sheet__field">
                <span>创作方向</span>
                <el-input
                  v-model="userDirection"
                  type="textarea"
                  :rows="5"
                  resize="none"
                  placeholder="写这章要发生什么，不写也能直接生成。"
                />
              </label>

              <button
                class="mobile-create-sheet__toggle"
                type="button"
                @click="advancedVisible = !advancedVisible"
              >
                <span>高级设置</span>
                <el-icon :size="14">
                  <ArrowUp v-if="advancedVisible" />
                  <ArrowDown v-else />
                </el-icon>
              </button>

              <div v-if="advancedVisible" class="mobile-create-sheet__advanced">
                <label class="mobile-create-sheet__field">
                  <span>风格包</span>
                  <el-select v-model="stylePreset" style="width: 100%">
                    <el-option
                      v-for="item in STYLE_PRESET_OPTIONS"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                </label>

                <label v-if="showStartupPlatformProfile" class="mobile-create-sheet__field">
                  <span>首三章平台范式</span>
                  <el-select v-model="startupPlatformProfile" style="width: 100%">
                    <el-option
                      v-for="item in STARTUP_PLATFORM_PROFILE_OPTIONS"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                </label>

                <label class="mobile-create-sheet__field">
                  <span>风格补充</span>
                  <el-input
                    v-model="styleNotes"
                    type="textarea"
                    :rows="3"
                    resize="none"
                    maxlength="500"
                    show-word-limit
                    placeholder="想要更狠、更快、更细，就写在这。"
                  />
                </label>

                <label class="mobile-create-sheet__field">
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

                <label v-if="wordLimitOption === 'custom'" class="mobile-create-sheet__field">
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
            </template>

            <MobileAgentLiveStream
              v-else
              :novel-id="props.novelId"
              :chapter-number="targetChapterNumber"
              :pending-start="generating && !isGeneratingHere"
              :agent-statuses="liveAgentStatuses"
              :writing-assistant-output="liveWritingAssistantOutput"
            />
          </div>

          <footer class="mobile-create-sheet__footer">
            <button class="mobile-focus-button--ghost mobile-create-sheet__batch-link" type="button" @click="emit('open-batch')">
              批量生成多章
            </button>
            <button
              class="mobile-focus-button--secondary"
              type="button"
              @click="closeSheet"
            >
              {{ secondaryActionLabel }}
            </button>
            <button
              class="mobile-focus-button--primary mobile-create-sheet__submit"
              type="button"
              :disabled="showGeneratingState"
              @click="submit"
            >
              <el-icon :size="14"><EditPen /></el-icon>
              {{ submitLabel }}
            </button>
          </footer>
        </section>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.mobile-create-sheet {
  --mobile-create-accent: var(--star-brand-sky);
  --mobile-create-accent-strong: var(--star-brand-teal);
  --mobile-create-field-bg: linear-gradient(180deg, color-mix(in srgb, var(--nw-bg-primary) 96%, transparent), color-mix(in srgb, var(--nw-bg-secondary) 98%, transparent));
  --mobile-create-field-border: color-mix(in srgb, var(--nw-text-primary) 12%, var(--nw-border));
  --mobile-create-field-border-strong: color-mix(in srgb, var(--mobile-create-accent) 52%, var(--nw-border));
  --mobile-create-field-shadow: 0 8px 18px color-mix(in srgb, var(--nw-text-primary) 6%, transparent);
  --mobile-create-field-text: var(--nw-text-primary);
  --mobile-create-field-placeholder: var(--nw-text-muted);
  --mobile-create-backdrop: rgba(7, 17, 27, 0.42);
  position: fixed;
  inset: 0;
  z-index: 45;
  display: grid;
  align-items: end;
  overflow: hidden;
}

html.dark .mobile-create-sheet {
  --mobile-create-accent: var(--star-brand-teal);
  --mobile-create-accent-strong: var(--star-brand-teal-strong);
  --mobile-create-field-border: rgba(148, 163, 184, 0.25);
  --mobile-create-field-shadow: 0 8px 18px color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  --mobile-create-backdrop: rgba(15, 23, 42, 0.68);
}

html.dark.warm-night .mobile-create-sheet {
  --mobile-create-accent: #f59e0b;
  --mobile-create-accent-strong: #d97706;
  --mobile-create-field-border: rgba(139, 92, 46, 0.35);
  --mobile-create-backdrop: rgba(26, 21, 18, 0.7);
}

.mobile-create-sheet__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: var(--mobile-create-backdrop);
  backdrop-filter: blur(14px);
}

.mobile-create-sheet__panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  max-height: min(88vh, 760px);
  box-sizing: border-box;
  padding: 16px 16px calc(14px + env(safe-area-inset-bottom));
  border-radius: 24px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-create-accent) 12%, transparent), transparent 26%),
    radial-gradient(circle at top left, color-mix(in srgb, var(--mobile-create-accent-strong) 7%, transparent), transparent 22%),
    linear-gradient(180deg, var(--nw-bg-primary), var(--nw-bg-secondary));
  box-shadow: 0 -16px 40px color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
  overflow: hidden;
  color: var(--nw-text-primary);
}

.mobile-create-sheet__header,
.mobile-create-sheet__chapter-row,
.mobile-create-sheet__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mobile-create-sheet__title {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.mobile-create-sheet__eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  width: fit-content;
  padding: 0 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-create-accent) 10%, var(--nw-bg-secondary));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--mobile-create-accent) 80%, var(--nw-text-primary));
}

.mobile-create-sheet__title strong {
  font-size: 22px;
  line-height: 1.08;
  letter-spacing: -0.03em;
  color: var(--nw-text-primary);
}

.mobile-create-sheet__title p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 16%, var(--nw-border));
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__body {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
  padding-bottom: 4px;
}

.mobile-create-sheet__chapter-row {
  align-items: center;
  padding: 9px 11px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--mobile-create-accent) 5%, var(--nw-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 12%, var(--nw-border));
}

.mobile-create-sheet__chapter-label {
  font-size: 12px;
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__chapter-row strong {
  font-size: 14px;
  color: var(--nw-text-primary);
}

.mobile-create-sheet__field {
  display: grid;
  gap: 7px;
}

.mobile-create-sheet__field > span {
  font-size: 13px;
  font-weight: 700;
  color: color-mix(in srgb, var(--mobile-create-accent) 40%, var(--nw-text-primary));
}

.mobile-create-sheet__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--mobile-create-accent) 5%, var(--nw-bg-secondary));
  font-size: 12px;
  font-weight: 700;
  color: var(--nw-text-primary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mobile-create-sheet__advanced {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--mobile-create-accent) 4%, var(--nw-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 12%, var(--nw-border));
}

.mobile-create-sheet :deep(.el-textarea__inner),
.mobile-create-sheet :deep(.el-input__wrapper),
.mobile-create-sheet :deep(.el-select__wrapper),
.mobile-create-sheet :deep(.el-input-number .el-input__wrapper) {
  border: 1px solid var(--mobile-create-field-border);
  box-shadow: var(--mobile-create-field-shadow);
  background: var(--mobile-create-field-bg);
  color: var(--mobile-create-field-text);
}

.mobile-create-sheet :deep(.el-textarea__inner) {
  min-height: 116px;
  padding: 13px 14px;
  border-radius: 14px;
  line-height: 1.7;
}

.mobile-create-sheet :deep(.el-input__wrapper),
.mobile-create-sheet :deep(.el-select__wrapper),
.mobile-create-sheet :deep(.el-input-number .el-input__wrapper) {
  min-height: 46px;
  border-radius: 14px;
  padding-inline: 13px;
}

.mobile-create-sheet :deep(.el-input__inner),
.mobile-create-sheet :deep(.el-select__selected-item),
.mobile-create-sheet :deep(.el-textarea__inner),
.mobile-create-sheet :deep(.el-input-number__decrease),
.mobile-create-sheet :deep(.el-input-number__increase) {
  color: var(--mobile-create-field-text);
}

.mobile-create-sheet :deep(.el-input__inner::placeholder),
.mobile-create-sheet :deep(.el-textarea__inner::placeholder),
.mobile-create-sheet :deep(.el-select__placeholder) {
  color: var(--mobile-create-field-placeholder);
}

.mobile-create-sheet :deep(.el-input__wrapper:hover),
.mobile-create-sheet :deep(.el-select__wrapper:hover),
.mobile-create-sheet :deep(.el-input-number:hover .el-input__wrapper),
.mobile-create-sheet :deep(.el-textarea__inner:hover) {
  border-color: color-mix(in srgb, var(--mobile-create-accent) 40%, var(--nw-border));
  box-shadow: 0 12px 24px color-mix(in srgb, var(--mobile-create-accent) 12%, transparent);
}

.mobile-create-sheet :deep(.el-input__wrapper.is-focus),
.mobile-create-sheet :deep(.el-select__wrapper.is-focused),
.mobile-create-sheet :deep(.el-input-number .el-input__wrapper.is-focus),
.mobile-create-sheet :deep(.el-textarea__inner:focus) {
  border-color: var(--mobile-create-field-border-strong);
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--mobile-create-accent) 18%, transparent),
    0 14px 28px color-mix(in srgb, var(--mobile-create-accent) 16%, transparent);
}

.mobile-create-sheet :deep(.el-input-number) {
  width: 100%;
}

.mobile-create-sheet :deep(.el-input-number__decrease),
.mobile-create-sheet :deep(.el-input-number__increase) {
  border-color: color-mix(in srgb, var(--nw-text-primary) 10%, var(--nw-border));
  background: var(--nw-bg-secondary);
}

.mobile-create-sheet :deep(.el-input-number__decrease:hover),
.mobile-create-sheet :deep(.el-input-number__increase:hover) {
  background: color-mix(in srgb, var(--mobile-create-accent) 8%, var(--nw-bg-secondary));
}

.mobile-create-sheet :deep(.el-select__caret),
.mobile-create-sheet :deep(.el-input__suffix-inner),
.mobile-create-sheet :deep(.el-input-number__decrease .el-icon),
.mobile-create-sheet :deep(.el-input-number__increase .el-icon) {
  color: var(--nw-text-muted);
}

.mobile-create-sheet :deep(.el-textarea .el-input__count) {
  color: var(--nw-text-muted);
  background: transparent;
}

.mobile-create-sheet__footer {
  align-items: center;
}

.mobile-create-sheet__submit {
  min-width: 124px;
}

.mobile-create-sheet-fade-enter-active,
.mobile-create-sheet-fade-leave-active,
.mobile-create-sheet-rise-enter-active,
.mobile-create-sheet-rise-leave-active {
  transition: all 0.22s ease;
}

.mobile-create-sheet-fade-enter-from,
.mobile-create-sheet-fade-leave-to {
  opacity: 0;
}

.mobile-create-sheet-rise-enter-from,
.mobile-create-sheet-rise-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

@media (max-width: 420px) {
  .mobile-create-sheet__panel {
    padding-left: 14px;
    padding-right: 14px;
  }

  .mobile-create-sheet__footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mobile-create-sheet__submit {
    min-width: 0;
  }
}
</style>
