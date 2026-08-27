import { ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import { useCleanQuoteSelectionModel } from './useCleanQuoteSelectionModel';

export function useCleanQuoteUsage(options: {
  novelId: Ref<string>;
  chapterCount: Ref<number>;
  chapterNumberBounds: Ref<{ min: number; max: number }>;
  hasUnsavedChanges: Ref<boolean>;
  currentChapterNum: Ref<number | null>;
  refreshChapters: () => Promise<void>;
  selectChapter: (chapterNumber: number) => Promise<unknown>;
}) {
  const {
    novelId,
    chapterCount,
    chapterNumberBounds,
    hasUnsavedChanges,
    currentChapterNum,
    refreshChapters,
    selectChapter,
  } = options;

  const cleanQuoteUsageDialogVisible = ref(false);
  const previewingCleanQuoteUsage = ref(false);
  const applyingCleanQuoteUsage = ref(false);
  const cleanQuoteUsagePreview = ref<api.CleanQuoteUsageResponse | null>(null);
  const cleanQuoteFromChapter = ref(1);
  const cleanQuoteToChapter = ref(1);
  const selectedCleanQuoteEditIdsByChapter = ref<Record<number, string[]>>({});
  const cleanQuoteExpandedChapters = ref<Array<string | number>>([]);
  const rememberRejectedQuoteFeedback = ref(true);

  const {
    selectedCleanQuoteItems,
    selectedCleanQuoteReplacements,
    getDisplayExamples,
    getSelectedEditIdsForChapter,
    isChapterFullySelected,
    isChapterPartiallySelected,
    selectAllCleanQuoteItems,
    clearAllCleanQuoteItems,
    toggleCleanQuoteChapter,
    toggleCleanQuoteExample,
    syncCleanQuoteSelectionFromPreview,
  } = useCleanQuoteSelectionModel({
    preview: cleanQuoteUsagePreview,
    selectedEditIdsByChapter: selectedCleanQuoteEditIdsByChapter,
    expandedChapters: cleanQuoteExpandedChapters,
  });

  function openCleanQuoteUsageDialog() {
    if (chapterCount.value === 0) {
      ElMessage.warning('当前没有可处理的章节');
      return;
    }
    cleanQuoteFromChapter.value = chapterNumberBounds.value.min;
    cleanQuoteToChapter.value = chapterNumberBounds.value.max;
    cleanQuoteUsagePreview.value = null;
    selectedCleanQuoteEditIdsByChapter.value = {};
    cleanQuoteExpandedChapters.value = [];
    cleanQuoteUsageDialogVisible.value = true;
  }

  async function handlePreviewCleanQuoteUsage() {
    if (previewingCleanQuoteUsage.value || !novelId.value) return;

    previewingCleanQuoteUsage.value = true;
    try {
      const result = await api.previewCleanQuoteUsage(novelId.value, {
        fromChapter: cleanQuoteFromChapter.value,
        toChapter: cleanQuoteToChapter.value,
        maxPreview: 40,
      });
      cleanQuoteUsagePreview.value = result;
      syncCleanQuoteSelectionFromPreview();
      if (result.affectedChapters > 0) {
        ElMessage.success(`已生成预览：${result.affectedChapters} 章需要清洗`);
      } else {
        ElMessage.info('预览完成：未发现需要清洗的非台词引号');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '清洗预览失败';
      ElMessage.error(message);
    } finally {
      previewingCleanQuoteUsage.value = false;
    }
  }

  async function handleApplyCleanQuoteUsage() {
    if (applyingCleanQuoteUsage.value || !novelId.value) return;
    if (hasUnsavedChanges.value) {
      ElMessage.warning('请先保存当前章节，再应用批量清洗');
      return;
    }

    if (!cleanQuoteUsagePreview.value) {
      await handlePreviewCleanQuoteUsage();
    }

    const currentPreview = cleanQuoteUsagePreview.value;
    if (!currentPreview || currentPreview.affectedChapters === 0) {
      if (currentPreview) ElMessage.info('没有可应用的清洗项');
      return;
    }
    if (selectedCleanQuoteReplacements.value === 0) {
      ElMessage.warning('请至少勾选 1 条同意应用的清洗项');
      return;
    }

    const selectedEdits = (currentPreview.items ?? [])
      .map(item => ({
        chapterNumber: item.chapterNumber,
        editIds: getSelectedEditIdsForChapter(item.chapterNumber),
      }))
      .filter(item => item.editIds.length > 0);
    const selectedChapterNumbers = selectedEdits.map(item => item.chapterNumber);
    const rejectedQuoteTexts = rememberRejectedQuoteFeedback.value
      ? Array.from(new Set(
        (currentPreview.items ?? []).flatMap((item) => {
          const selectedSet = new Set(getSelectedEditIdsForChapter(item.chapterNumber));
          return getDisplayExamples(item)
            .filter(example => !selectedSet.has(example.id))
            .map(example => (example.quoteText ?? '').trim())
            .filter(Boolean);
        }),
      ))
      : [];

    try {
      await ElMessageBox.confirm(
        `将应用到 ${selectedChapterNumbers.length} 个章节的 ${selectedCleanQuoteReplacements.value} 条已同意清洗项。是否继续？`,
        '应用引号清洗',
        { type: 'warning', confirmButtonText: '确认应用', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }

    applyingCleanQuoteUsage.value = true;
    try {
      const result = await api.applyCleanQuoteUsage(novelId.value, {
        chapterNumbers: selectedChapterNumbers,
        selectedEdits,
        rejectedQuoteTexts,
        maxPreview: 40,
      });
      cleanQuoteUsagePreview.value = result;
      syncCleanQuoteSelectionFromPreview();
      await refreshChapters();
      if (currentChapterNum.value) {
        await selectChapter(currentChapterNum.value);
      }
      ElMessage.success(
        `清洗完成：${result.affectedChapters} 章，处理 ${result.totalReplacements} 处非台词引号`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '应用清洗失败';
      ElMessage.error(message);
    } finally {
      applyingCleanQuoteUsage.value = false;
    }
  }

  return {
    cleanQuoteUsageDialogVisible,
    previewingCleanQuoteUsage,
    applyingCleanQuoteUsage,
    cleanQuoteUsagePreview,
    cleanQuoteFromChapter,
    cleanQuoteToChapter,
    cleanQuoteExpandedChapters,
    rememberRejectedQuoteFeedback,
    selectedCleanQuoteItems,
    selectedCleanQuoteReplacements,
    getDisplayExamples,
    getSelectedEditIdsForChapter,
    isChapterFullySelected,
    isChapterPartiallySelected,
    selectAllCleanQuoteItems,
    clearAllCleanQuoteItems,
    toggleCleanQuoteChapter,
    toggleCleanQuoteExample,
    openCleanQuoteUsageDialog,
    handlePreviewCleanQuoteUsage,
    handleApplyCleanQuoteUsage,
  };
}
