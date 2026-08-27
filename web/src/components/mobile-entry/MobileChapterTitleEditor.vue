<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { MagicStick, Check, Close } from '@element-plus/icons-vue';
import { updateChapter, generateChapterTitle } from '../../api/chapters';

interface Props {
  visible: boolean;
  novelId: string;
  chapterNumber: number;
  currentTitle: string;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'updated', title: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const sheetVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const editedTitle = ref('');
const generatingTitle = ref(false);
const savingTitle = ref(false);

const canSave = computed(() => {
  const trimmed = editedTitle.value.trim();
  return trimmed.length > 0 && trimmed !== props.currentTitle;
});

watch(() => props.visible, (visible) => {
  if (visible) {
    editedTitle.value = props.currentTitle;
  }
});

async function handleGenerateTitle() {
  generatingTitle.value = true;
  try {
    const result = await generateChapterTitle(props.novelId, props.chapterNumber);
    editedTitle.value = result.title;
    ElMessage.success('标题生成成功');
  } catch (err) {
    console.error('生成标题失败:', err);
    ElMessage.error(err instanceof Error ? err.message : '生成标题失败');
  } finally {
    generatingTitle.value = false;
  }
}

async function handleSave() {
  if (!canSave.value) return;

  savingTitle.value = true;
  try {
    await updateChapter(props.novelId, props.chapterNumber, {
      title: editedTitle.value.trim(),
    });
    ElMessage.success('标题已保存');
    emit('updated', editedTitle.value.trim());
    sheetVisible.value = false;
  } catch (err) {
    console.error('保存标题失败:', err);
    ElMessage.error(err instanceof Error ? err.message : '保存标题失败');
  } finally {
    savingTitle.value = false;
  }
}

function handleCancel() {
  sheetVisible.value = false;
}
</script>

<template>
  <el-drawer
    v-model="sheetVisible"
    :title="`编辑标题 - 第 ${chapterNumber} 章`"
    direction="btt"
    size="auto"
    class="mobile-title-editor-sheet mobile-focus-light-vars"
  >
    <div class="sheet-content">
      <div class="title-input-section">
        <el-input
          v-model="editedTitle"
          type="text"
          placeholder="输入章节标题"
          maxlength="80"
          show-word-limit
          size="large"
          class="title-input"
        />

        <el-button
          type="primary"
          :icon="MagicStick"
          :loading="generatingTitle"
          size="large"
          class="generate-btn"
          @click="handleGenerateTitle"
        >
          AI 生成标题
        </el-button>
      </div>

      <div class="action-buttons">
        <el-button
          :icon="Close"
          size="large"
          class="action-btn"
          @click="handleCancel"
        >
          取消
        </el-button>

        <el-button
          type="primary"
          :icon="Check"
          :loading="savingTitle"
          :disabled="!canSave"
          size="large"
          class="action-btn"
          @click="handleSave"
        >
          保存
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
:global(.mobile-title-editor-sheet) {
  --sheet-bg: var(--nw-bg-primary);
  --card-bg: var(--nw-bg-secondary);
  --field-bg: color-mix(in srgb, var(--nw-text-primary) 5%, var(--nw-bg-secondary));
  --border-color: var(--nw-border);
  --text-primary: var(--nw-text-primary);
  --text-secondary: var(--nw-text-secondary);
  --title-editor-accent: var(--star-brand-sky);
  --title-editor-accent-strong: var(--star-brand-teal);
  --el-color-primary: var(--title-editor-accent);
  --el-text-color-primary: var(--text-primary);
  --el-text-color-regular: var(--text-secondary);
  --el-text-color-secondary: var(--nw-text-muted);
  --el-border-color: var(--border-color);
  --el-border-color-light: color-mix(in srgb, var(--border-color) 72%, transparent);
  --el-fill-color-blank: var(--field-bg);
  --el-input-bg-color: var(--field-bg);
  --el-input-text-color: var(--text-primary);
  --el-input-border-color: color-mix(in srgb, var(--border-color) 84%, transparent);
  --el-input-placeholder-color: color-mix(in srgb, var(--text-secondary) 78%, transparent);
}

:global(.mobile-title-editor-sheet.el-drawer),
:global(.mobile-title-editor-sheet .el-drawer) {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card-bg) 96%, transparent), var(--sheet-bg));
  color: var(--text-primary);
}

:global(.mobile-title-editor-sheet .el-drawer__header) {
  align-items: center;
  margin-bottom: 0;
  padding: 18px 20px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 58%, transparent);
  color: var(--text-primary);
}

:global(.mobile-title-editor-sheet .el-drawer__title) {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 800;
}

:global(.mobile-title-editor-sheet .el-drawer__close-btn) {
  color: var(--text-secondary);
}

:global(.mobile-title-editor-sheet .el-drawer__body) {
  padding: 0;
  background: var(--sheet-bg);
  color: var(--text-secondary);
}

:global(.mobile-title-editor-sheet .el-input__wrapper) {
  background: var(--field-bg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border-color) 82%, transparent) inset;
}

:global(.mobile-title-editor-sheet .el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--title-editor-accent) 68%, var(--border-color)) inset,
    0 0 0 3px color-mix(in srgb, var(--title-editor-accent) 14%, transparent);
}

:global(.mobile-title-editor-sheet .el-input__inner) {
  color: var(--text-primary);
}

:global(.mobile-title-editor-sheet .el-input__count) {
  background: transparent;
  color: var(--text-secondary);
}

:global(.mobile-title-editor-sheet .el-button) {
  border-color: color-mix(in srgb, var(--border-color) 84%, transparent);
}

:global(.mobile-title-editor-sheet .el-button:not(.el-button--primary)) {
  background: var(--field-bg);
  color: var(--text-primary);
}

:global(.mobile-title-editor-sheet .el-button--primary) {
  border-color: color-mix(in srgb, var(--title-editor-accent) 72%, var(--border-color));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--title-editor-accent) 82%, var(--title-editor-accent-strong)), var(--title-editor-accent-strong));
  color: var(--mobile-focus-on-accent);
}

.sheet-content {
  padding: 20px;
  background: var(--sheet-bg);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.title-input-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--card-bg);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--text-primary) 8%, transparent);
}

.title-input {
  width: 100%;
}

.generate-btn {
  width: 100%;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
}
</style>
