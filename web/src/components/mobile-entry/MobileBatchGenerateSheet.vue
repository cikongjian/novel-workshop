<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowUp, Close, EditPen } from '@element-plus/icons-vue';
import { startBatchGenerate, cancelBatch } from '../../api/generate';
import { retryFailedBatch } from '../../api/batch-control';
import { useAgentsStore } from '../../stores/agents';
import { extractApiErrorMessage } from '../../utils/api-error';
import {
  WORD_LIMIT_OPTIONS,
  resolveMaxWordCount,
  type WordLimitOption,
} from '../../config/chapter-generation-options';
import MobileBatchProgressCard from './MobileBatchProgressCard.vue';
import MobileVoteResultHint from './MobileVoteResultHint.vue';

type BatchState = {
  running: boolean;
  finalizing: boolean;
  progress: number;
  currentChapterNumber: number | null;
  currentIndex: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
  activeAgentLabel: string;
  progressDescription: string;
  estimatedRemaining?: string | null;
  finalizeSucceeded?: number;
  finalizeFailed?: number;
  hasFailedItems?: boolean;
};

const props = defineProps<{
  visible: boolean;
  novelId: string;
  nextChapterNumber: number;
  batchState: BatchState;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  started: [];
}>();

const agentsStore = useAgentsStore();

const advancedVisible = ref(false);
const submitting = ref(false);
const cancelling = ref(false);
const retrying = ref(false);
const fromChapter = ref(1);
const toChapter = ref(3);
const userDirection = ref('');
const wordLimitOption = ref<WordLimitOption>('3000');
const customWordLimit = ref(3000);

const showProgressState = computed(() => (
  props.batchState.running || props.batchState.finalizing || props.batchState.totalCount > 0
));

/** 上一章章节号——投票点挂在上一章，影响本次生成方向 */
const previousChapterNumber = computed(() => (
  props.nextChapterNumber > 1 ? props.nextChapterNumber - 1 : null
));

const sheetTitle = computed(() => (
  showProgressState.value ? '批量章节进度' : '批量生成章节'
));

const sheetEyebrow = computed(() => (
  showProgressState.value ? 'Batch Running' : 'Batch Create'
));

const summaryText = computed(() => (
  showProgressState.value
    ? '任务已经在后台运行，可以直接关闭这个窗口，稍后回来看进度。'
    : '一次连续生成多章，适合先把新章节骨架和正文草稿铺出来。'
));

function resetForm() {
  advancedVisible.value = false;
  fromChapter.value = props.nextChapterNumber;
  toChapter.value = props.nextChapterNumber + 2;
  userDirection.value = '';
  wordLimitOption.value = '3000';
  customWordLimit.value = 3000;
}

function closeSheet() {
  emit('update:visible', false);
}

async function handleSubmit() {
  if (!props.novelId || showProgressState.value) return;
  if (fromChapter.value > toChapter.value) {
    ElMessage.warning('起始章节不能大于结束章节');
    return;
  }

  submitting.value = true;
  try {
    const result = await startBatchGenerate({
      novelId: props.novelId,
      fromChapter: fromChapter.value,
      toChapter: toChapter.value,
      userDirection: userDirection.value.trim() || undefined,
      maxWordCount: resolveMaxWordCount(wordLimitOption.value, customWordLimit.value),
    });
    agentsStore.initBatchItems(result.items);
    ElMessage.success(`已启动批量生成，共 ${result.items.length} 章`);
    emit('started');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '启动批量生成失败'));
  } finally {
    submitting.value = false;
  }
}

async function handleCancel() {
  if (!props.novelId || cancelling.value) return;
  cancelling.value = true;
  try {
    await cancelBatch(props.novelId);
    ElMessage.info('正在取消批量任务...');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '取消批量任务失败'));
  } finally {
    cancelling.value = false;
  }
}

async function handleRetry() {
  if (!props.novelId || retrying.value) return;
  retrying.value = true;
  try {
    await retryFailedBatch(props.novelId);
    ElMessage.success('已开始重试失败章节');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '重试失败章节失败'));
  } finally {
    retrying.value = false;
  }
}

function handleClear() {
  agentsStore.clearBatch();
}

watch(
  () => props.visible,
  (value) => {
    if (value && !showProgressState.value) {
      resetForm();
    }
  },
);

watch(
  () => props.nextChapterNumber,
  () => {
    if (!props.visible || showProgressState.value) return;
    fromChapter.value = props.nextChapterNumber;
    toChapter.value = props.nextChapterNumber + 2;
  },
);
</script>

<template>
  <transition name="mobile-create-sheet-fade">
    <div v-if="visible" class="mobile-batch-sheet mobile-focus-light-vars">
      <button class="mobile-batch-sheet__backdrop" type="button" aria-label="关闭批量生成面板" @click="closeSheet" />

      <transition name="mobile-create-sheet-rise">
        <section class="mobile-batch-sheet__panel" role="dialog" aria-modal="true" :aria-label="sheetTitle">
          <header class="mobile-batch-sheet__header">
            <div class="mobile-batch-sheet__title">
              <span class="mobile-batch-sheet__eyebrow">{{ sheetEyebrow }}</span>
              <strong>{{ sheetTitle }}</strong>
              <p>{{ summaryText }}</p>
            </div>

            <button class="mobile-batch-sheet__close" type="button" aria-label="关闭" @click="closeSheet">
              <el-icon :size="16"><Close /></el-icon>
            </button>
          </header>

          <div class="mobile-batch-sheet__body">
            <MobileVoteResultHint
              :visible="visible"
              :novel-id="novelId"
              :previous-chapter-number="previousChapterNumber"
              @adopt="(text) => { userDirection = userDirection ? userDirection + '\n' + text : text; }"
            />

            <MobileBatchProgressCard
              v-if="showProgressState"
              :progress="props.batchState.progress"
              :running="props.batchState.running"
              :finalizing="props.batchState.finalizing"
              :current-chapter-number="props.batchState.currentChapterNumber"
              :current-index="props.batchState.currentIndex"
              :completed-count="props.batchState.completedCount"
              :failed-count="props.batchState.failedCount"
              :total-count="props.batchState.totalCount"
              :active-agent-label="props.batchState.activeAgentLabel"
              :progress-description="props.batchState.progressDescription"
              :estimated-remaining="props.batchState.estimatedRemaining"
              :finalize-succeeded="props.batchState.finalizeSucceeded"
              :finalize-failed="props.batchState.finalizeFailed"
              :can-cancel="props.batchState.running && !props.batchState.finalizing"
              :can-retry="!props.batchState.running && !props.batchState.finalizing && !!props.batchState.hasFailedItems"
              :can-clear="!props.batchState.running && !props.batchState.finalizing"
              @cancel="handleCancel"
              @retry="handleRetry"
              @clear="handleClear"
            />

            <template v-else>
              <div class="mobile-batch-sheet__range">
                <label class="mobile-batch-sheet__field">
                  <span>起始章节</span>
                  <el-input-number
                    v-model="fromChapter"
                    :min="1"
                    :max="999"
                    style="width: 100%"
                  />
                </label>

                <label class="mobile-batch-sheet__field">
                  <span>结束章节</span>
                  <el-input-number
                    v-model="toChapter"
                    :min="fromChapter"
                    :max="999"
                    style="width: 100%"
                  />
                </label>
              </div>

              <label class="mobile-batch-sheet__field">
                <span>统一创作方向</span>
                <el-input
                  v-model="userDirection"
                  type="textarea"
                  :rows="5"
                  resize="none"
                  placeholder="可选：给这一批章节一个统一方向，比如节奏、冲突或剧情目标。"
                />
              </label>

              <button class="mobile-batch-sheet__toggle" type="button" @click="advancedVisible = !advancedVisible">
                <span>高级设置</span>
                <el-icon :size="14">
                  <ArrowUp v-if="advancedVisible" />
                  <ArrowDown v-else />
                </el-icon>
              </button>

              <div v-if="advancedVisible" class="mobile-batch-sheet__advanced">
                <label class="mobile-batch-sheet__field">
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

                <label v-if="wordLimitOption === 'custom'" class="mobile-batch-sheet__field">
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
          </div>

          <footer class="mobile-batch-sheet__footer">
            <button class="mobile-focus-button--secondary" type="button" @click="closeSheet">
              {{ showProgressState ? '稍后回来' : '取消' }}
            </button>
            <button
              class="mobile-focus-button--primary mobile-batch-sheet__submit"
              type="button"
              :disabled="showProgressState"
              :aria-busy="submitting"
              @click="handleSubmit"
            >
              <el-icon :size="14"><EditPen /></el-icon>
              {{ submitting ? '启动中...' : '开始批量生成' }}
            </button>
          </footer>
        </section>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.mobile-batch-sheet {
  position: fixed;
  inset: 0;
  z-index: 46;
  display: grid;
  align-items: end;
}

.mobile-batch-sheet__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: color-mix(in srgb, var(--nw-text-primary) 42%, transparent);
  backdrop-filter: blur(14px);
}

.mobile-batch-sheet__panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  max-height: min(88vh, 760px);
  box-sizing: border-box;
  padding: 16px 16px calc(14px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 14%, var(--nw-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent), transparent 28%),
    radial-gradient(circle at top left, color-mix(in srgb, var(--mobile-focus-accent-strong) 8%, transparent), transparent 22%),
    linear-gradient(180deg, color-mix(in srgb, var(--nw-bg-secondary) 98%, transparent), color-mix(in srgb, var(--mobile-focus-surface-muted) 76%, var(--nw-bg-secondary)));
  box-shadow: 0 -16px 40px color-mix(in srgb, var(--nw-text-primary) 16%, transparent);
  overflow: hidden;
}

.mobile-batch-sheet__header,
.mobile-batch-sheet__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mobile-batch-sheet__title {
  display: grid;
  gap: 3px;
}

.mobile-batch-sheet__eyebrow {
  display: inline-flex;
  width: fit-content;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--mobile-focus-accent) 86%, var(--nw-text-primary));
}

.mobile-batch-sheet__title strong {
  font-size: 22px;
  line-height: 1.08;
  letter-spacing: 0;
  color: var(--nw-text-primary);
}

.mobile-batch-sheet__title p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--nw-text-muted);
}

.mobile-batch-sheet__close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 54%, transparent);
  background: color-mix(in srgb, var(--nw-bg-secondary) 90%, transparent);
  color: var(--nw-text-secondary);
}

.mobile-batch-sheet__body {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
  padding-bottom: 4px;
}

.mobile-batch-sheet__range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.mobile-batch-sheet__field {
  display: grid;
  gap: 7px;
}

.mobile-batch-sheet__field > span,
.mobile-batch-sheet__switch strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--nw-text-secondary);
}

.mobile-batch-sheet__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 54%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--mobile-focus-surface) 86%, transparent);
  font-size: 12px;
  font-weight: 700;
  color: var(--nw-text-primary);
  letter-spacing: 0;
  text-transform: uppercase;
}

.mobile-batch-sheet__advanced {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--mobile-focus-surface) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--nw-border) 48%, transparent);
}

.mobile-batch-sheet__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-batch-sheet__switch p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nw-text-muted);
}

.mobile-batch-sheet :deep(.el-textarea__inner),
.mobile-batch-sheet :deep(.el-input__wrapper),
.mobile-batch-sheet :deep(.el-select__wrapper),
.mobile-batch-sheet :deep(.el-input-number .el-input__wrapper) {
  border: 1px solid color-mix(in srgb, var(--nw-border) 54%, transparent);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--nw-border) 24%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--nw-bg-secondary) 96%, transparent), color-mix(in srgb, var(--mobile-focus-surface-muted) 72%, var(--nw-bg-secondary)));
  color: var(--nw-text-primary);
}

.mobile-batch-sheet :deep(.el-textarea__inner) {
  min-height: 116px;
  padding: 13px 14px;
  border-radius: 14px;
  line-height: 1.7;
}

.mobile-batch-sheet :deep(.el-input__wrapper),
.mobile-batch-sheet :deep(.el-select__wrapper),
.mobile-batch-sheet :deep(.el-input-number .el-input__wrapper) {
  min-height: 46px;
  border-radius: 14px;
  padding-inline: 13px;
}

.mobile-batch-sheet :deep(.el-input-number) {
  width: 100%;
}

.mobile-batch-sheet__submit {
  min-width: 144px;
}

@media (max-width: 420px) {
  .mobile-batch-sheet__panel {
    padding-left: 14px;
    padding-right: 14px;
  }

  .mobile-batch-sheet__range,
  .mobile-batch-sheet__footer {
    grid-template-columns: 1fr;
  }

  .mobile-batch-sheet__footer {
    display: grid;
  }

  .mobile-batch-sheet__submit {
    min-width: 0;
  }
}
</style>
