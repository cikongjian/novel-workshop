import { ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import { useCleanDialogueBracketSelectionModel } from './useCleanDialogueBracketSelectionModel';

export type DialogueBracketApplyChapterResult = {
  chapterNumber: number;
  title: string;
  success: boolean;
  replacements: number;
  error?: string;
};

export type DialogueBracketApplyProgress = {
  current: number;
  total: number;
  results: DialogueBracketApplyChapterResult[];
};

export function useCleanDialogueBracketUsage(options: {
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

  const dialogVisible = ref(false);
  const previewing = ref(false);
  const applying = ref(false);
  const applyProgress = ref<DialogueBracketApplyProgress | null>(null);
  const transformMode = ref<api.CleanDialogueBracketTransformMode>('ai-rewrite');
  const preview = ref<api.CleanDialogueBracketUsageResponse | null>(null);
  const fromChapter = ref(1);
  const toChapter = ref(1);
  const selectedEditIdsByChapter = ref<Record<number, string[]>>({});
  const expandedChapters = ref<Array<string | number>>([]);

  const {
    selectedItems,
    selectedReplacements,
    getDisplayExamples,
    getSelectedEditIdsForChapter,
    isChapterFullySelected,
    isChapterPartiallySelected,
    selectAllItems,
    clearAllItems,
    toggleChapter,
    toggleExample,
    syncSelectionFromPreview,
  } = useCleanDialogueBracketSelectionModel({
    preview,
    selectedEditIdsByChapter,
    expandedChapters,
  });

  function openDialog(initialMode: api.CleanDialogueBracketTransformMode = 'ai-rewrite') {
    if (chapterCount.value === 0) {
      ElMessage.warning('当前没有可处理的章节');
      return;
    }
    const safeMin = Math.max(1, Number(chapterNumberBounds.value.min) || 1);
    const safeMax = Math.max(safeMin, Number(chapterNumberBounds.value.max) || safeMin);
    const validModes: api.CleanDialogueBracketTransformMode[] = ['clean', 'rewrite', 'ai-rewrite'];
    transformMode.value = typeof initialMode === 'string' && validModes.includes(initialMode) ? initialMode : 'ai-rewrite';
    fromChapter.value = safeMin;
    toChapter.value = safeMax;
    preview.value = null;
    selectedEditIdsByChapter.value = {};
    expandedChapters.value = [];
    dialogVisible.value = true;
  }

  async function handlePreview() {
    if (previewing.value || !novelId.value) return;
    const safeFrom = Math.max(1, Math.trunc(fromChapter.value || 1));
    const safeTo = Math.max(safeFrom, Math.trunc(toChapter.value || safeFrom));
    fromChapter.value = safeFrom;
    toChapter.value = safeTo;

    previewing.value = true;
    try {
      if (hasUnsavedChanges.value) {
        ElMessage.warning('当前存在未保存修改。预览仅扫描已保存章节内容，请先保存后再预览。');
      }
      const doPreview = (mode: api.CleanDialogueBracketTransformMode) => api.previewCleanDialogueBracketUsage(novelId.value, {
        fromChapter: safeFrom,
        toChapter: safeTo,
        maxPreview: 80,
        transformMode: mode,
      });

      let result: api.CleanDialogueBracketUsageResponse;
      try {
        result = await doPreview(transformMode.value);
      } catch (error) {
        if (transformMode.value === 'ai-rewrite' && shouldFallbackToRuleRewrite(error)) {
          transformMode.value = 'rewrite';
          ElMessage.warning('当前后端暂不支持 AI改写，已自动切换为“改写表达”模式');
          result = await doPreview('rewrite');
        } else {
          throw error;
        }
      }
      preview.value = result;
      syncSelectionFromPreview();
      if (result.affectedChapters > 0) {
        const modeLabel = getModeLabel(transformMode.value);
        ElMessage.success(`已生成预览：${result.affectedChapters} 章存在可${modeLabel}的括号动作标签`);
      } else {
        const modeLabel = getModeLabel(transformMode.value);
        ElMessage.info(`预览完成：未发现需要${modeLabel}的括号动作标签`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '预览失败';
      ElMessage.error(message);
    } finally {
      previewing.value = false;
    }
  }

  async function handleApply() {
    if (applying.value || !novelId.value) return;
    if (hasUnsavedChanges.value) {
      ElMessage.warning('请先保存当前章节，再应用批量处理');
      return;
    }

    if (!preview.value || preview.value.transformMode !== transformMode.value) {
      await handlePreview();
    }
    const currentPreview = preview.value;
    if (!currentPreview || currentPreview.affectedChapters === 0) {
      if (currentPreview) ElMessage.info('没有可应用的处理项');
      return;
    }
    if (selectedReplacements.value === 0) {
      ElMessage.warning('请至少勾选 1 条确认应用的条目');
      return;
    }

    const selectedEdits = (currentPreview.items ?? [])
      .map(item => ({
        chapterNumber: item.chapterNumber,
        title: item.title || `第 ${item.chapterNumber} 章`,
        editIds: getSelectedEditIdsForChapter(item.chapterNumber),
      }))
      .filter(item => item.editIds.length > 0);

    const modeLabel = getModeLabel(transformMode.value);
    try {
      await ElMessageBox.confirm(
        `将逐章应用到 ${selectedEdits.length} 个章节的 ${selectedReplacements.value} 条已确认条目（${modeLabel}模式）。是否继续？`,
        `应用括号动作标签${modeLabel}`,
        { type: 'warning', confirmButtonText: '确认应用', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }

    applying.value = true;
    applyProgress.value = { current: 0, total: selectedEdits.length, results: [] };
    let totalAppliedChapters = 0;
    let totalAppliedReplacements = 0;

    try {
      for (const edit of selectedEdits) {
        applyProgress.value = {
          ...applyProgress.value,
          current: applyProgress.value.current + 1,
        };

        try {
          const doApply = (mode: api.CleanDialogueBracketTransformMode) =>
            api.applyCleanDialogueBracketUsage(novelId.value, {
              chapterNumbers: [edit.chapterNumber],
              selectedEdits: [{ chapterNumber: edit.chapterNumber, editIds: edit.editIds }],
              maxPreview: 80,
              transformMode: mode,
            });

          let result: api.CleanDialogueBracketUsageResponse;
          try {
            result = await doApply(transformMode.value);
          } catch (error) {
            if (transformMode.value === 'ai-rewrite' && shouldFallbackToRuleRewrite(error)) {
              result = await doApply('rewrite');
            } else {
              throw error;
            }
          }

          totalAppliedChapters += result.affectedChapters;
          totalAppliedReplacements += result.totalReplacements;
          applyProgress.value = {
            ...applyProgress.value,
            results: [...applyProgress.value.results, {
              chapterNumber: edit.chapterNumber,
              title: edit.title,
              success: true,
              replacements: result.totalReplacements,
            }],
          };
        } catch (error: unknown) {
          applyProgress.value = {
            ...applyProgress.value,
            results: [...applyProgress.value.results, {
              chapterNumber: edit.chapterNumber,
              title: edit.title,
              success: false,
              replacements: 0,
              error: error instanceof Error ? error.message : '处理失败',
            }],
          };
        }
      }

      await refreshChapters();
      if (currentChapterNum.value) {
        await selectChapter(currentChapterNum.value);
      }
      const failedCount = applyProgress.value.results.filter(r => !r.success).length;
      if (failedCount > 0) {
        ElMessage.warning(
          `${modeLabel}完成：${totalAppliedChapters} 章成功，${failedCount} 章失败，共 ${totalAppliedReplacements} 处`,
        );
      } else {
        ElMessage.success(
          `${modeLabel}完成：${totalAppliedChapters} 章，处理 ${totalAppliedReplacements} 处括号动作标签`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '应用处理失败';
      ElMessage.error(message);
    } finally {
      applying.value = false;
    }
  }

  return {
    cleanDialogueBracketDialogVisible: dialogVisible,
    previewingCleanDialogueBracket: previewing,
    applyingCleanDialogueBracket: applying,
    cleanDialogueBracketApplyProgress: applyProgress,
    cleanDialogueBracketTransformMode: transformMode,
    cleanDialogueBracketPreview: preview,
    cleanDialogueBracketFromChapter: fromChapter,
    cleanDialogueBracketToChapter: toChapter,
    cleanDialogueBracketExpandedChapters: expandedChapters,
    selectedCleanDialogueBracketItems: selectedItems,
    selectedCleanDialogueBracketReplacements: selectedReplacements,
    getDialogueBracketDisplayExamples: getDisplayExamples,
    getDialogueBracketSelectedEditIdsForChapter: getSelectedEditIdsForChapter,
    isDialogueBracketChapterFullySelected: isChapterFullySelected,
    isDialogueBracketChapterPartiallySelected: isChapterPartiallySelected,
    selectAllCleanDialogueBracketItems: selectAllItems,
    clearAllCleanDialogueBracketItems: clearAllItems,
    toggleCleanDialogueBracketChapter: toggleChapter,
    toggleCleanDialogueBracketExample: toggleExample,
    openCleanDialogueBracketDialog: openDialog,
    handlePreviewCleanDialogueBracket: handlePreview,
    handleApplyCleanDialogueBracket: handleApply,
  };
}

function getModeLabel(mode: api.CleanDialogueBracketTransformMode): string {
  if (mode === 'ai-rewrite') return 'AI改写';
  if (mode === 'rewrite') return '改写';
  return '清洗';
}

function shouldFallbackToRuleRewrite(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  const message = (
    (error as { response?: { data?: { error?: string } } })?.response?.data?.error
    ?? (error instanceof Error ? error.message : '')
  );
  if (status !== 400) return false;
  if (!message) return true;
  if (/Request failed with status code 400/i.test(message)) return true;
  return /ai-rewrite|transformMode|enum/i.test(message);
}
