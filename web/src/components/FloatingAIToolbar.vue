<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import type { InlineOperation, InlineAIEvent } from '../api';
import { streamInlineAI } from '../api';

const props = defineProps<{
  /** 绑定的 textarea 元素 */
  textareaEl: HTMLTextAreaElement | null;
  /** 编辑器文本内容（v-model） */
  content: string;
  /** 小说 ID */
  novelId?: string;
  /** 章节编号 */
  chapterNumber?: number;
}>();

const emit = defineEmits<{
  /** 替换选中文本 */
  replaceSelection: [start: number, end: number, newText: string];
  /** 在指定位置插入文本 */
  insertAt: [position: number, text: string];
  /** 将选中文本发送给全局助手 */
  askAssistant: [payload: { selectedText: string; contextBefore: string; contextAfter: string }];
}>();

const ERROR_PREFIX = '[错误]';
const SELECTION_CONTEXT_RADIUS = 1000;

const visible = ref(false);
const toolbarX = ref(0);
const toolbarY = ref(0);
const selectedText = ref('');
const selectionStart = ref(0);
const selectionEnd = ref(0);

const processing = ref(false);
const previewVisible = ref(false);
const previewContent = ref('');
const currentOperation = ref<InlineOperation | null>(null);
let abortFn: (() => void) | null = null;

const customDialogVisible = ref(false);
const customInstruction = ref('');

const OPERATIONS: { op: InlineOperation; label: string; icon: string }[] = [
  { op: 'rewrite', label: '改写', icon: '改' },
  { op: 'expand', label: '扩写', icon: '扩' },
  { op: 'polish', label: '润色', icon: '润' },
  { op: 'compress', label: '精简', icon: '简' },
  { op: 'dialogue', label: '对话', icon: '话' },
  { op: 'describe', label: '描写', icon: '描' },
  { op: 'custom', label: '自定义', icon: '自' },
];

function onMouseUp() {
  requestAnimationFrame(checkSelection);
}

function checkSelection() {
  const el = props.textareaEl;
  if (!el) return;

  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value.substring(start, end).trim();

  if (text.length > 0 && start !== end) {
    selectedText.value = text;
    selectionStart.value = start;
    selectionEnd.value = end;
    positionToolbar(el);
    visible.value = true;
  } else if (!processing.value && !previewVisible.value) {
    visible.value = false;
  }
}

function positionToolbar(el: HTMLTextAreaElement) {
  const rect = el.getBoundingClientRect();
  // 在 textarea 上方中间位置显示工具条。
  const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 28;
  const linesFromTop = el.value.substring(0, el.selectionStart).split('\n').length;
  const scrollTop = el.scrollTop;
  const estimatedY = rect.top + (linesFromTop * lineHeight) - scrollTop - 10;

  toolbarX.value = rect.left + rect.width / 2;
  toolbarY.value = Math.max(rect.top, Math.min(estimatedY, rect.bottom - 50));
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (
    !target.closest('.floating-ai-toolbar') &&
    !target.closest('.ai-preview-panel') &&
    !target.closest('.custom-instruction-dialog')
  ) {
    if (!processing.value) {
      visible.value = false;
      previewVisible.value = false;
    }
  }
}

function executeOperation(op: InlineOperation) {
  if (op === 'custom') {
    customDialogVisible.value = true;
    return;
  }
  startAIOperation(op);
}

function executeCustom() {
  if (!customInstruction.value.trim()) return;
  customDialogVisible.value = false;
  startAIOperation('custom', customInstruction.value.trim());
}

function getSelectionContext() {
  const contextBefore = props.content.substring(
    Math.max(0, selectionStart.value - SELECTION_CONTEXT_RADIUS),
    selectionStart.value,
  );
  const contextAfter = props.content.substring(
    selectionEnd.value,
    Math.min(props.content.length, selectionEnd.value + SELECTION_CONTEXT_RADIUS),
  );
  return { contextBefore, contextAfter };
}

function buildInlineContext(contextBefore: string, contextAfter: string): string {
  return [
    '【改写前文】',
    contextBefore || '（无）',
    '',
    '【改写片段】',
    selectedText.value,
    '',
    '【改写后文】',
    contextAfter || '（无）',
  ].join('\n');
}

function buildOperationInstruction(op: InlineOperation, instruction?: string): string {
  const extraInstruction = instruction?.trim() ?? '';
  if (op !== 'rewrite') return extraInstruction;

  const rewriteInstruction = [
    '只重写“改写片段”本身，不得补写前后文。',
    '保持剧情事实、角色身份与称谓/自称、时间地点、数字和关系不变。',
    '若出现 (#角色名) 标记必须原样保留，不得改名或删除。',
    '输出仅为改写后的片段正文，不要解释。',
  ].join('\n');

  return extraInstruction ? `${rewriteInstruction}\n${extraInstruction}` : rewriteInstruction;
}

function sendToAssistant() {
  if (!selectedText.value.trim()) return;
  const { contextBefore, contextAfter } = getSelectionContext();
  emit('askAssistant', {
    selectedText: selectedText.value,
    contextBefore,
    contextAfter,
  });
  visible.value = false;
}

function startAIOperation(op: InlineOperation, instruction?: string) {
  if (processing.value) return;

  processing.value = true;
  previewVisible.value = true;
  previewContent.value = '';
  currentOperation.value = op;

  const { contextBefore, contextAfter } = getSelectionContext();

  abortFn = streamInlineAI(
    {
      novelId: props.novelId,
      chapterNumber: props.chapterNumber,
      operation: op,
      text: selectedText.value,
      context: buildInlineContext(contextBefore, contextAfter),
      instruction: buildOperationInstruction(op, instruction),
    },
    (event: InlineAIEvent) => {
      if (event.type === 'chunk') {
        previewContent.value += event.content;
      } else if (event.type === 'done') {
        processing.value = false;
      } else if (event.type === 'error') {
        processing.value = false;
        previewContent.value = `${ERROR_PREFIX}${event.message}`;
      }
    },
  );
}

function acceptResult() {
  if (!previewContent.value || previewContent.value.startsWith(ERROR_PREFIX)) return;
  const currentSegment = props.content.substring(selectionStart.value, selectionEnd.value).trim();
  if (currentSegment !== selectedText.value) {
    ElMessage.warning('选区内容已变化，请重新选中后再应用');
    return;
  }
  emit('replaceSelection', selectionStart.value, selectionEnd.value, previewContent.value);
  closePreview();
}

function discardResult() {
  if (abortFn) {
    abortFn();
    abortFn = null;
  }
  closePreview();
}

function closePreview() {
  processing.value = false;
  previewVisible.value = false;
  previewContent.value = '';
  visible.value = false;
  currentOperation.value = null;
}

const operationLabel = computed(() => {
  const found = OPERATIONS.find(o => o.op === currentOperation.value);
  return found ? found.label : '';
});

onMounted(() => {
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousedown', onClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('mousedown', onClickOutside);
  if (abortFn) abortFn();
});

// 当 textarea 引用切换时，重置浮层状态。
watch(
  () => props.textareaEl,
  () => {
    visible.value = false;
    previewVisible.value = false;
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="toolbar-fade">
      <div
        v-if="visible && !previewVisible"
        class="floating-ai-toolbar"
        :style="{ left: `${toolbarX}px`, top: `${toolbarY}px` }"
      >
        <button
          v-for="item in OPERATIONS"
          :key="item.op"
          class="ai-op-btn"
          :title="item.label"
          @click.stop="executeOperation(item.op)"
        >
          <span class="ai-op-icon">{{ item.icon }}</span>
          <span class="ai-op-label">{{ item.label }}</span>
        </button>
        <button
          class="ai-op-btn assistant"
          title="发送到右侧 AI 助手"
          @click.stop="sendToAssistant"
        >
          <span class="ai-op-icon">问</span>
          <span class="ai-op-label">问助手</span>
        </button>
      </div>
    </Transition>

    <Transition name="panel-slide">
      <div
        v-if="previewVisible"
        class="ai-preview-panel"
      >
        <div class="preview-header">
          <span class="preview-title">
            <span v-if="processing" class="preview-loading" />
            AI {{ operationLabel }}{{ processing ? '中...' : '完成' }}
          </span>
          <div class="preview-actions">
            <button
              class="preview-btn accept"
              :disabled="processing || previewContent.startsWith(ERROR_PREFIX)"
              @click="acceptResult"
            >
              采纳
            </button>
            <button class="preview-btn discard" @click="discardResult">
              放弃
            </button>
          </div>
        </div>
        <div class="preview-body mono-text">
          <div v-if="selectedText && !processing" class="preview-original">
            <div class="preview-section-label">原文</div>
            <div class="preview-section-content original">{{ selectedText }}</div>
          </div>
          <div class="preview-result">
            <div class="preview-section-label">{{ processing ? '生成中' : '结果' }}</div>
            <div class="preview-section-content result">
              {{ previewContent || '...' }}
              <span v-if="processing" class="typing-cursor">|</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="toolbar-fade">
      <div
        v-if="customDialogVisible"
        class="custom-instruction-dialog"
      >
        <div class="custom-dialog-header">自定义 AI 指令</div>
        <textarea
          v-model="customInstruction"
          class="custom-input"
          rows="3"
          placeholder="描述你希望 AI 如何处理选中的文本..."
          @keydown.enter.ctrl.prevent="executeCustom"
        />
        <div class="custom-dialog-footer">
          <button class="preview-btn discard" @click="customDialogVisible = false">取消</button>
          <button class="preview-btn accept" @click="executeCustom">执行 (Ctrl+Enter)</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 浮动工具条 */
.floating-ai-toolbar {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, -100%);
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-glass-border);
  border-radius: var(--nw-radius-lg);
  box-shadow: var(--nw-shadow-lg);
  backdrop-filter: blur(20px);
}

.ai-op-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--nw-text-secondary);
  border-radius: var(--nw-radius-md);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  transition: all var(--nw-duration-fast) ease;
}

.ai-op-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  color: var(--nw-text-primary);
}

.ai-op-btn.assistant {
  background: rgba(16, 185, 129, 0.12);
  color: var(--nw-success);
}

.ai-op-btn.assistant:hover {
  background: rgba(16, 185, 129, 0.2);
  color: #047857;
}

.ai-op-icon {
  font-size: 14px;
  line-height: 1;
}

.ai-op-label {
  font-weight: var(--nw-font-medium);
}

/* 预览面板 */
.ai-preview-panel {
  position: fixed;
  z-index: 9999;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  width: 400px;
  max-height: 80vh;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-glass-border);
  border-radius: var(--nw-radius-lg);
  box-shadow: var(--nw-shadow-lg);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--nw-space-3) var(--nw-space-4);
  border-bottom: 1px solid var(--nw-border);
  flex-shrink: 0;
}

.preview-title {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
  font-size: var(--nw-text-sm);
  font-weight: var(--nw-font-semibold);
  color: var(--nw-text-primary);
}

.preview-loading {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nw-accent-start);
  animation: glow-pulse 1.5s ease-in-out infinite;
}

.preview-actions {
  display: flex;
  gap: var(--nw-space-2);
}

.preview-btn {
  padding: 4px 12px;
  border: 1px solid var(--nw-glass-border);
  border-radius: var(--nw-radius-md);
  font-size: var(--nw-text-xs);
  font-weight: var(--nw-font-medium);
  cursor: pointer;
  transition: all var(--nw-duration-fast) ease;
}

.preview-btn.accept {
  background: rgba(16, 185, 129, 0.15);
  color: var(--nw-success);
  border-color: rgba(16, 185, 129, 0.3);
}

.preview-btn.accept:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.25);
}

.preview-btn.accept:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.preview-btn.discard {
  background: var(--nw-glass);
  color: var(--nw-text-secondary);
}

.preview-btn.discard:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--nw-danger);
  border-color: rgba(239, 68, 68, 0.3);
}

.preview-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--nw-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.preview-section-label {
  font-size: 11px;
  font-weight: var(--nw-font-semibold);
  color: var(--nw-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--nw-space-1);
}

.preview-section-content {
  font-size: var(--nw-text-sm);
  line-height: var(--nw-leading-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-section-content.original {
  color: var(--nw-text-muted);
  padding: var(--nw-space-3);
  background: var(--nw-glass);
  border-radius: var(--nw-radius-md);
  border-left: 3px solid var(--nw-border);
  max-height: 120px;
  overflow-y: auto;
}

.preview-section-content.result {
  color: var(--nw-text-primary);
  padding: var(--nw-space-3);
  background: rgba(99, 102, 241, 0.05);
  border-radius: var(--nw-radius-md);
  border-left: 3px solid var(--nw-accent-start);
  min-height: 60px;
}

.typing-cursor {
  animation: blink 1s step-end infinite;
  color: var(--nw-accent-start);
  font-weight: bold;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 自定义指令弹层 */
.custom-instruction-dialog {
  position: fixed;
  z-index: 10000;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-glass-border);
  border-radius: var(--nw-radius-lg);
  box-shadow: var(--nw-shadow-lg);
  backdrop-filter: blur(20px);
  padding: var(--nw-space-5);
}

.custom-dialog-header {
  font-size: var(--nw-text-base);
  font-weight: var(--nw-font-semibold);
  color: var(--nw-text-primary);
  margin-bottom: var(--nw-space-3);
}

.custom-input {
  width: 100%;
  padding: var(--nw-space-3);
  border: 1px solid var(--nw-glass-border);
  border-radius: var(--nw-radius-md);
  background: var(--nw-glass);
  color: var(--nw-text-primary);
  font-size: var(--nw-text-sm);
  line-height: var(--nw-leading-relaxed);
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}

.custom-input:focus {
  outline: none;
  border-color: var(--nw-accent-start);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.custom-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--nw-space-2);
  margin-top: var(--nw-space-3);
}

/* 过渡动画 */
.toolbar-fade-enter-active,
.toolbar-fade-leave-active {
  transition: all 0.2s ease;
}

.toolbar-fade-enter-from,
.toolbar-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -100%) scale(0.95);
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.3s var(--nw-ease-out);
}

.panel-slide-enter-from {
  opacity: 0;
  transform: translateY(-50%) translateX(20px);
}

.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(20px);
}

/* 移动端适配 */
@media (max-width: 767px) {
  .ai-preview-panel {
    right: 8px;
    left: 8px;
    width: auto;
    top: auto;
    bottom: 60px;
    transform: none;
    max-height: 50vh;
  }

  .panel-slide-enter-from {
    opacity: 0;
    transform: translateY(20px);
  }

  .panel-slide-leave-to {
    opacity: 0;
    transform: translateY(20px);
  }

  .floating-ai-toolbar {
    flex-wrap: wrap;
    max-width: 90vw;
  }

  .custom-instruction-dialog {
    width: 90vw;
  }
}
</style>
