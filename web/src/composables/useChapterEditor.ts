import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import { useNovelStore } from '../stores/novel';
import type { Chapter } from '../types';
import { extractApiErrorMessage } from '../utils/api-error';

const SPEAKER_MARKER_RE = /[\(\uFF08]\s*[#\uFF03]\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]/g;

export function useChapterEditor(deps: {
  novelId: Ref<string>;
  refreshQualityTrend?: () => Promise<void>;
}) {
  const { novelId, refreshQualityTrend } = deps;
  const novelStore = useNovelStore();

  // Chapter state
  const currentChapterNum = ref<number | null>(null);
  const currentChapter = ref<Chapter | null>(null);
  const editContent = ref('');
  const loadingChapter = ref(false);
  const saving = ref(false);
  const deletingChapter = ref(false);
  const generatingTitle = ref(false);
  let chapterLoadAbort: AbortController | null = null;
  let chapterLoadRequestId = 0;

  // Computed: check for unsaved changes
  const hasUnsavedChanges = computed(() => {
    return !!currentChapter.value && editContent.value !== currentChapter.value.content;
  });

  // Computed: word stats (excluding speaker markers)
  const wordStats = computed(() => {
    const text = editContent.value;
    const cleanText = text.replace(SPEAKER_MARKER_RE, '');
    const charCount = cleanText.length;
    const paragraphs = cleanText.split(/\n+/).filter(p => p.trim()).length;
    const readMinutes = Math.max(1, Math.ceil(charCount / 500));
    return { charCount, paragraphs, readMinutes };
  });

  // Auto-save state
  const autoSaveStatus = ref<'idle' | 'saving' | 'saved'>('idle');
  let autoSaveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSaveForceTimer: ReturnType<typeof setTimeout> | null = null;

  // Backfill speakers state
  const backfillingMarkers = ref(false);
  let backfillAbort: (() => void) | null = null;

  // Select and load a chapter
  async function selectChapter(num: number) {
    if (chapterLoadAbort) {
      chapterLoadAbort.abort();
      chapterLoadAbort = null;
    }

    const controller = new AbortController();
    const requestId = ++chapterLoadRequestId;
    chapterLoadAbort = controller;
    currentChapterNum.value = num;
    loadingChapter.value = true;
    try {
      const chapter = await api.fetchChapter(novelId.value, num, { signal: controller.signal });
      if (requestId !== chapterLoadRequestId) return;
      currentChapter.value = chapter;
      editContent.value = currentChapter.value.content;
    } catch {
      if (controller.signal.aborted || requestId !== chapterLoadRequestId) {
        return;
      }
      if (currentChapterNum.value === num) {
        currentChapterNum.value = null;
      }
      currentChapter.value = null;
      editContent.value = '';
    } finally {
      if (chapterLoadAbort === controller) {
        chapterLoadAbort = null;
      }
      if (requestId === chapterLoadRequestId) {
        loadingChapter.value = false;
      }
    }
  }

  // Save chapter content
  async function saveChapter(options?: { silent?: boolean }): Promise<boolean> {
    if (!currentChapter.value || currentChapterNum.value === null) return false;
    saving.value = true;
    try {
      await api.updateChapter(novelId.value, currentChapterNum.value, {
        content: editContent.value,
      });
      if (currentChapter.value) {
        currentChapter.value.content = editContent.value;
        currentChapter.value.wordCount = editContent.value.length;
        // Content modification auto-sets status to drafted
        currentChapter.value.status = 'drafted';
      }
      if (!options?.silent) {
        ElMessage.success('已保存为草稿');
      }
      await novelStore.refreshChapters({ force: true });
      if (refreshQualityTrend) {
        await refreshQualityTrend();
      }
      return true;
    } catch {
      if (!options?.silent) {
        ElMessage.error('保存失败');
      }
      return false;
    } finally {
      saving.value = false;
    }
  }

  // Auto-save function
  async function performAutoSave() {
    if (autoSaveDebounceTimer) { clearTimeout(autoSaveDebounceTimer); autoSaveDebounceTimer = null; }
    if (autoSaveForceTimer) { clearTimeout(autoSaveForceTimer); autoSaveForceTimer = null; }
    if (!hasUnsavedChanges.value || !currentChapter.value || !currentChapterNum.value) return;
    autoSaveStatus.value = 'saving';
    try {
      await api.updateChapter(novelId.value, currentChapterNum.value, {
        content: editContent.value,
      });
      if (currentChapter.value) {
        currentChapter.value.content = editContent.value;
        currentChapter.value.wordCount = editContent.value.length;
        currentChapter.value.status = 'drafted';
      }
      autoSaveStatus.value = 'saved';
      await novelStore.refreshChapters({ force: true });
    } catch {
      autoSaveStatus.value = 'idle';
    }
  }

  // Watch for content changes to trigger auto-save
  watch(editContent, () => {
    if (!hasUnsavedChanges.value) return;
    // Reset 1s debounce on each input
    if (autoSaveDebounceTimer) clearTimeout(autoSaveDebounceTimer);
    autoSaveDebounceTimer = setTimeout(() => { void performAutoSave(); }, 1000);
    // Start 5s force save timer on first change (don't reset)
    if (!autoSaveForceTimer) {
      autoSaveForceTimer = setTimeout(() => { void performAutoSave(); }, 5000);
    }
  });

  // Backfill speaker markers
  async function handleBackfillSpeakers() {
    if (backfillingMarkers.value) return;
    if (!currentChapterNum.value || !currentChapter.value?.content) {
      ElMessage.warning('请先选择一个有内容的章节');
      return;
    }

    // Check for existing markers
    const existingMarkers = (editContent.value.match(/[\(\uFF08]\s*#\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]/g) ?? []).length;
    if (existingMarkers > 0) {
      try {
        await ElMessageBox.confirm(
          `当前章节已有 ${existingMarkers} 个说话人标记。继续将会重新标注全部对话，现有标记可能被调整。是否继续？`,
          '提示',
          { type: 'warning', confirmButtonText: '继续标注', cancelButtonText: '取消' },
        );
      } catch {
        return;
      }
    }

    backfillingMarkers.value = true;
    ElMessage.info('正在补全说话人标记，请稍候...');
    const originalContent = editContent.value;

    backfillAbort = api.streamBackfillSpeakers(
      {
        novelId: novelId.value,
        chapterNumber: currentChapterNum.value,
      },
      (event) => {
        if (event.type === 'chunk') {
          // Chunk data handled by done event
        } else if (event.type === 'done') {
          // AI returns full annotated text, replace editor content
          editContent.value = event.content;
          backfillingMarkers.value = false;
          backfillAbort = null;
          void (async () => {
            const saved = await saveChapter({ silent: true });
            const changed = event.content !== originalContent;
            if (saved) {
              if (changed) {
                ElMessage.success('说话人标记补全完成，已自动保存');
              } else {
                ElMessage.info('补全完成：未检测到需要新增的说话人标记');
              }
            } else {
              ElMessage.warning('说话人标记补全完成，请先保存再播报');
            }
          })();
        } else if (event.type === 'error') {
          backfillingMarkers.value = false;
          backfillAbort = null;
          ElMessage.error(`标记补全失败: ${event.message}`);
        }
      },
    );
  }

  // Cancel backfill speakers
  function cancelBackfillSpeakers() {
    if (backfillAbort) {
      backfillAbort();
      backfillAbort = null;
    }
    backfillingMarkers.value = false;
  }

  // Delete chapter
  async function handleDeleteChapter(chapterNumber: number) {
    if (deletingChapter.value) return;

    try {
      await ElMessageBox.confirm(
        `确定删除第 ${chapterNumber} 章吗？此操作不可撤销。`,
        '删除章节',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
    } catch {
      return; // User cancelled
    }

    try {
      deletingChapter.value = true;
      await api.deleteChapter(novelId.value, chapterNumber);
      ElMessage.success('章节已删除');

      // Clear selection state
      if (currentChapterNum.value === chapterNumber) {
        currentChapterNum.value = null;
        currentChapter.value = null;
        editContent.value = '';
      }

      await novelStore.refreshChapters({ force: true });
      await novelStore.refreshNovel({ force: true });

      // Auto-select adjacent chapter after deletion
      if (currentChapterNum.value === null && novelStore.chapters.length > 0) {
        const nearestChapter = novelStore.chapters.find(
          (c) => c.chapterNumber >= chapterNumber,
        ) ?? novelStore.chapters[novelStore.chapters.length - 1];
        await selectChapter(nearestChapter.chapterNumber);
      }
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '删除失败'));
    } finally {
      deletingChapter.value = false;
    }
  }

  // Move chapter up/down
  async function handleMoveChapter(chapterNumber: number, direction: 'up' | 'down') {
    const chapters = novelStore.chapters;
    const idx = chapters.findIndex((c) => c.chapterNumber === chapterNumber);
    if (idx < 0) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= chapters.length) return;

    const targetNum = chapters[targetIdx].chapterNumber;

    try {
      await api.swapChapters(novelId.value, chapterNumber, targetNum);
      await novelStore.refreshChapters({ force: true });
      // Follow moved chapter (number already swapped)
      await selectChapter(targetNum);
    } catch {
      ElMessage.error('移动失败');
    }
  }

  // Update chapter title
  async function handleUpdateChapterTitle(title: string) {
    if (!novelId.value || !currentChapterNum.value) return;
    try {
      const updated = await api.updateChapter(novelId.value, currentChapterNum.value, { title });
      if (currentChapter.value) {
        currentChapter.value.title = updated.title;
      }
      await novelStore.refreshChapters();
      ElMessage.success(title ? '标题已更新' : '标题已清除');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '更新标题失败';
      ElMessage.error(msg);
    }
  }

  // Generate chapter title using AI
  async function handleGenerateChapterTitle() {
    if (!novelId.value || !currentChapterNum.value || generatingTitle.value) return;
    generatingTitle.value = true;
    try {
      const result = await api.generateChapterTitle(novelId.value, currentChapterNum.value);
      if (currentChapter.value) {
        currentChapter.value.title = result.title;
      }
      await novelStore.refreshChapters();
      ElMessage.success(`AI 生成标题：${result.title}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI 生成标题失败';
      ElMessage.error(msg);
    } finally {
      generatingTitle.value = false;
    }
  }

  // Navigation helpers
  const previousChapterNumber = computed(() => {
    if (!currentChapter.value) return null;
    const idx = novelStore.chapters.findIndex(c => c.chapterNumber === currentChapter.value!.chapterNumber);
    if (idx <= 0) return null;
    return novelStore.chapters[idx - 1].chapterNumber;
  });

  const nextChapterNumber = computed(() => {
    if (!currentChapter.value) return null;
    const idx = novelStore.chapters.findIndex(c => c.chapterNumber === currentChapter.value!.chapterNumber);
    if (idx < 0 || idx >= novelStore.chapters.length - 1) return null;
    return novelStore.chapters[idx + 1].chapterNumber;
  });

  async function goToPreviousChapter() {
    if (previousChapterNumber.value !== null) {
      await selectChapter(previousChapterNumber.value);
    }
  }

  async function goToNextChapter() {
    if (nextChapterNumber.value !== null) {
      await selectChapter(nextChapterNumber.value);
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (autoSaveDebounceTimer) clearTimeout(autoSaveDebounceTimer);
    if (autoSaveForceTimer) clearTimeout(autoSaveForceTimer);
    if (backfillAbort) backfillAbort();
    if (chapterLoadAbort) {
      chapterLoadAbort.abort();
      chapterLoadAbort = null;
    }
  });

  return {
    // State
    currentChapterNum,
    currentChapter,
    editContent,
    loadingChapter,
    saving,
    generatingTitle,
    backfillingMarkers,
    autoSaveStatus,

    // Computed
    hasUnsavedChanges,
    wordStats,
    previousChapterNumber,
    nextChapterNumber,

    // Methods
    selectChapter,
    saveChapter,
    performAutoSave,
    handleBackfillSpeakers,
    cancelBackfillSpeakers,
    handleDeleteChapter,
    handleMoveChapter,
    handleUpdateChapterTitle,
    handleGenerateChapterTitle,
    goToPreviousChapter,
    goToNextChapter,
  };
}
