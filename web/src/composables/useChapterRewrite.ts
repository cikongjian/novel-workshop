import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as api from '../api';
import { extractApiErrorMessage } from '../utils/api-error';
import { useNovelStore } from '../stores/novel';

type ChapterLite = {
  chapterNumber: number;
  title?: string;
  wordCount?: number;
  content?: string;
};

type StylePresetOption =
  | 'auto'
  | 'serious'
  | 'comedy'
  | 'wacky'
  | 'historical'
  | 'xianxia'
  | 'wuxia'
  | 'suspense'
  | 'horror'
  | 'campus'
  | 'workplace'
  | 'political'
  | 'hard-scifi'
  | 'romance-sweet'
  | 'romance-angst';

type WordLimitOption = 'none' | '2000' | '3000' | '4000' | '5000' | 'custom';

const STYLE_PRESET_OPTIONS: Array<{ label: string; value: StylePresetOption }> = [
  { label: '自动识别（推荐）', value: 'auto' },
  { label: '正剧', value: 'serious' },
  { label: '搞笑', value: 'comedy' },
  { label: '逗比', value: 'wacky' },
  { label: '历史', value: 'historical' },
  { label: '仙侠', value: 'xianxia' },
  { label: '武侠', value: 'wuxia' },
  { label: '悬疑', value: 'suspense' },
  { label: '惊悚', value: 'horror' },
  { label: '校园', value: 'campus' },
  { label: '职场', value: 'workplace' },
  { label: '权谋', value: 'political' },
  { label: '硬科幻', value: 'hard-scifi' },
  { label: '甜宠', value: 'romance-sweet' },
  { label: '虐恋', value: 'romance-angst' },
];

const WORD_LIMIT_OPTIONS: Array<{ label: string; value: WordLimitOption }> = [
  { label: '不限', value: 'none' },
  { label: '2000 字', value: '2000' },
  { label: '3000 字（推荐）', value: '3000' },
  { label: '4000 字', value: '4000' },
  { label: '5000 字', value: '5000' },
  { label: '自定义', value: 'custom' },
];

function isStylePresetOption(value: string): value is StylePresetOption {
  return STYLE_PRESET_OPTIONS.some(item => item.value === value);
}

function isWordLimitOption(value: string): value is WordLimitOption {
  return WORD_LIMIT_OPTIONS.some(item => item.value === value);
}

function resolveMaxWordCount(option: WordLimitOption, custom: number): number | undefined {
  if (option === 'none') return undefined;
  if (option === 'custom') {
    const normalized = Number.isFinite(custom) ? Math.round(custom) : 3000;
    return Math.min(20000, Math.max(800, normalized));
  }
  return Number(option);
}

export function useChapterRewrite(deps: {
  novelId: Ref<string>;
  chapters: Ref<ChapterLite[]>;
  currentChapter: Ref<ChapterLite | null>;
  currentChapterNum: Ref<number | null>;
  hasUnsavedChanges: Ref<boolean>;
  saveChapter: (options?: { silent?: boolean }) => Promise<boolean>;
  selectChapter: (num: number) => Promise<void>;
  refreshQualityTrend?: () => Promise<void>;
}) {
  const {
    novelId,
    chapters,
    currentChapter,
    currentChapterNum,
    hasUnsavedChanges,
    saveChapter,
    selectChapter,
    refreshQualityTrend,
  } = deps;
  const novelStore = useNovelStore();

  const rewritingChapter = ref(false);
  const rewriteDialogVisible = ref(false);
  const rewriteUserDirection = ref('');
  const rewriteStylePreset = ref<StylePresetOption>('auto');
  const rewriteStyleNotes = ref('');
  const rewriteWordLimitOption = ref<WordLimitOption>('3000');
  const rewriteCustomWordLimit = ref(3000);

  // 预览相关状态
  const rewritePreviewDialogVisible = ref(false);
  const rewritePreviewContent = ref('');
  const rewritePreviewSimilarity = ref(0);
  const rewritePreviewSimilarityReason = ref('');
  const rewritePreviewChapterNumber = ref(0);
  const confirmingRewrite = ref(false);

  const batchRewriteDialogVisible = ref(false);
  const batchRewriteSelectedChapterNumbers = ref<number[]>([]);
  const batchRewriteUserDirection = ref('');
  const batchRewriteStylePreset = ref<StylePresetOption>('auto');
  const batchRewriteStyleNotes = ref('');
  const batchRewriteWordLimitOption = ref<WordLimitOption>('3000');
  const batchRewriteCustomWordLimit = ref(3000);
  const batchRewriting = ref(false);

  const rewriteDialogChapterOptions = computed(() => {
    return [...chapters.value]
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map(item => ({
        chapterNumber: item.chapterNumber,
        title: item.title ?? '',
        wordCount: item.wordCount ?? 0,
      }));
  });

  async function ensureCurrentChapterSaved(): Promise<boolean> {
    if (!hasUnsavedChanges.value) return true;
    const saved = await saveChapter({ silent: true });
    if (!saved) {
      ElMessage.error('保存失败，已取消重写');
      return false;
    }
    return true;
  }

  async function rewriteCurrentChapter(payload?: {
    userDirection?: string;
    stylePreset?: StylePresetOption;
    styleNotes?: string;
    maxWordCount?: number;
  }): Promise<void> {
    if (!currentChapterNum.value || !currentChapter.value) {
      ElMessage.warning('请先选择章节');
      return;
    }
    if (!currentChapter.value.content?.trim()) {
      ElMessage.warning('当前章节内容为空，无法重写');
      return;
    }
    if (rewritingChapter.value) return;

    const canProceed = await ensureCurrentChapterSaved();
    if (!canProceed) return;

    rewritingChapter.value = true;
    const chapterNumber = currentChapterNum.value;
    ElMessage.info(`正在重写第 ${chapterNumber} 章...`);

    try {
      const result = await api.rewriteChapter({
        novelId: novelId.value,
        chapterNumber,
        userDirection: payload?.userDirection?.trim() || undefined,
        stylePreset: payload?.stylePreset,
        styleNotes: payload?.styleNotes?.trim() || undefined,
        maxWordCount: payload?.maxWordCount,
      });
      await novelStore.refreshChapters({ force: true });
      await selectChapter(chapterNumber);
      await refreshQualityTrend?.();
      const rewriteDelta = typeof result.similarity === 'number'
        ? Math.round((1 - result.similarity) * 100)
        : null;
      ElMessage.success(
        result.usedDefaultDirection
          ? `第 ${chapterNumber} 章重写完成（默认策略${rewriteDelta != null ? `，差异约 ${rewriteDelta}%` : ''}）`
          : `第 ${chapterNumber} 章重写完成（已应用提示${rewriteDelta != null ? `，差异约 ${rewriteDelta}%` : ''}）`,
      );
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '重写章节失败'));
    } finally {
      rewritingChapter.value = false;
    }
  }

  function openRewriteCurrentChapterDialog(): void {
    if (!currentChapterNum.value || !currentChapter.value) {
      ElMessage.warning('请先选择章节');
      return;
    }
    if (!currentChapter.value.content?.trim()) {
      ElMessage.warning('当前章节内容为空，无法重写');
      return;
    }
    rewriteUserDirection.value = '';
    rewriteStylePreset.value = 'auto';
    rewriteStyleNotes.value = '';
    rewriteWordLimitOption.value = '3000';
    rewriteCustomWordLimit.value = 3000;
    rewriteDialogVisible.value = true;
  }

  async function handleRewriteCurrentChapter(): Promise<void> {
    if (!currentChapterNum.value || !currentChapter.value) {
      ElMessage.warning('请先选择章节');
      return;
    }
    if (!currentChapter.value.content?.trim()) {
      ElMessage.warning('当前章节内容为空，无法重写');
      return;
    }
    if (rewritingChapter.value) return;

    const canProceed = await ensureCurrentChapterSaved();
    if (!canProceed) return;

    const maxWordCount = resolveMaxWordCount(rewriteWordLimitOption.value, rewriteCustomWordLimit.value);
    rewriteDialogVisible.value = false;

    rewritingChapter.value = true;
    const chapterNumber = currentChapterNum.value;
    ElMessage.info(`正在生成重写预览...`);

    try {
      const preview = await api.rewriteChapterPreview({
        novelId: novelId.value,
        chapterNumber,
        userDirection: rewriteUserDirection.value,
        stylePreset: rewriteStylePreset.value,
        styleNotes: rewriteStyleNotes.value,
        maxWordCount,
      });

      // 显示预览对话框
      rewritePreviewContent.value = preview.chapterContent;
      rewritePreviewSimilarity.value = preview.similarity;
      rewritePreviewSimilarityReason.value = preview.similarityReason;
      rewritePreviewChapterNumber.value = chapterNumber;
      rewritePreviewDialogVisible.value = true;
    } catch (err: unknown) {
      console.error('[重写] API 调用失败:', err);
      ElMessage.error(extractApiErrorMessage(err, '生成重写预览失败'));
    } finally {
      rewritingChapter.value = false;
    }
  }

  async function confirmRewritePreview(): Promise<void> {
    if (!rewritePreviewChapterNumber.value) return;

    confirmingRewrite.value = true;
    const chapterNumber = rewritePreviewChapterNumber.value;

    try {
      await api.rewriteChapterConfirm({
        novelId: novelId.value,
        chapterNumber,
      });

      rewritePreviewDialogVisible.value = false;
      await novelStore.refreshChapters({ force: true });
      await selectChapter(chapterNumber);
      await refreshQualityTrend?.();

      const rewriteDelta = Math.round((1 - rewritePreviewSimilarity.value) * 100);
      ElMessage.success(`第 ${chapterNumber} 章重写完成并已入库（差异约 ${rewriteDelta}%）`);
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '确认入库失败'));
    } finally {
      confirmingRewrite.value = false;
    }
  }

  function cancelRewritePreview(): void {
    rewritePreviewDialogVisible.value = false;
    ElMessage.info('已取消重写，生成结果未保存');
  }

  async function retryRewritePreview(): Promise<void> {
    if (!rewritePreviewChapterNumber.value) return;

    // 关闭预览对话框，重新打开重写对话框
    rewritePreviewDialogVisible.value = false;

    // 保留之前的设置，让用户可以调整
    rewriteDialogVisible.value = true;

    ElMessage.info('请调整重写方向后重新生成');
  }

  function openBatchRewriteDialog(): void {
    if (batchRewriting.value) return;
    if (rewriteDialogChapterOptions.value.length === 0) {
      ElMessage.warning('当前没有可重写的章节');
      return;
    }

    const currentNumber = currentChapterNum.value;
    batchRewriteSelectedChapterNumbers.value = currentNumber
      ? [currentNumber]
      : [rewriteDialogChapterOptions.value[0].chapterNumber];
    batchRewriteUserDirection.value = '';
    batchRewriteStylePreset.value = 'auto';
    batchRewriteStyleNotes.value = '';
    batchRewriteWordLimitOption.value = '3000';
    batchRewriteCustomWordLimit.value = 3000;
    batchRewriteDialogVisible.value = true;
  }

  function selectAllBatchRewriteChapters(): void {
    batchRewriteSelectedChapterNumbers.value = rewriteDialogChapterOptions.value.map(item => item.chapterNumber);
  }

  function clearBatchRewriteSelection(): void {
    batchRewriteSelectedChapterNumbers.value = [];
  }

  async function handleBatchRewrite(): Promise<void> {
    if (batchRewriteSelectedChapterNumbers.value.length === 0) {
      ElMessage.warning('请至少选择一章');
      return;
    }
    if (batchRewriting.value) return;

    const canProceed = await ensureCurrentChapterSaved();
    if (!canProceed) return;

    batchRewriting.value = true;
    const chapterNumbers = [...new Set(batchRewriteSelectedChapterNumbers.value)].sort((a, b) => a - b);

    try {
      const result = await api.rewriteBatch({
        novelId: novelId.value,
        chapterNumbers,
        userDirection: batchRewriteUserDirection.value.trim() || undefined,
        stylePreset: batchRewriteStylePreset.value,
        styleNotes: batchRewriteStyleNotes.value.trim() || undefined,
        maxWordCount: resolveMaxWordCount(batchRewriteWordLimitOption.value, batchRewriteCustomWordLimit.value),
      });
      batchRewriteDialogVisible.value = false;

      if (result.failed === 0) {
        const succeededWithSimilarity = result.results.filter(item => item.ok && typeof item.similarity === 'number');
        const avgDelta = succeededWithSimilarity.length > 0
          ? Math.round(succeededWithSimilarity.reduce((sum, item) => sum + (1 - (item.similarity ?? 1)), 0) / succeededWithSimilarity.length * 100)
          : null;
        ElMessage.success(`批量重写完成：${result.succeeded}/${result.total} 章${avgDelta != null ? `（平均差异约 ${avgDelta}%）` : ''}`);
      } else {
        const failedNumbers = result.results.filter(item => !item.ok).map(item => item.chapterNumber);
        ElMessage.warning(`批量重写完成：成功 ${result.succeeded} 章，失败 ${result.failed} 章（${failedNumbers.join('、')}）`);
      }

      await novelStore.refreshChapters({ force: true });
      if (currentChapterNum.value) {
        await selectChapter(currentChapterNum.value);
      }
      await refreshQualityTrend?.();
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '批量重写失败'));
    } finally {
      batchRewriting.value = false;
    }
  }

  return {
    STYLE_PRESET_OPTIONS,
    WORD_LIMIT_OPTIONS,
    rewritingChapter,
    rewriteDialogVisible,
    rewriteUserDirection,
    rewriteStylePreset,
    rewriteStyleNotes,
    rewriteWordLimitOption,
    rewriteCustomWordLimit,
    rewritePreviewDialogVisible,
    rewritePreviewContent,
    rewritePreviewSimilarity,
    rewritePreviewSimilarityReason,
    confirmingRewrite,
    batchRewriteDialogVisible,
    batchRewriteSelectedChapterNumbers,
    batchRewriteUserDirection,
    batchRewriteStylePreset,
    batchRewriteStyleNotes,
    batchRewriteWordLimitOption,
    batchRewriteCustomWordLimit,
    batchRewriting,
    rewriteDialogChapterOptions,
    openRewriteCurrentChapterDialog,
    handleRewriteCurrentChapter,
    confirmRewritePreview,
    cancelRewritePreview,
    retryRewritePreview,
    openBatchRewriteDialog,
    selectAllBatchRewriteChapters,
    clearBatchRewriteSelection,
    handleBatchRewrite,
    handleRewriteStylePresetUpdate: (value: string) => {
      rewriteStylePreset.value = isStylePresetOption(value) ? value : 'auto';
    },
    handleRewriteWordLimitOptionUpdate: (value: string) => {
      rewriteWordLimitOption.value = isWordLimitOption(value) ? value : '3000';
    },
    handleBatchRewriteStylePresetUpdate: (value: string) => {
      batchRewriteStylePreset.value = isStylePresetOption(value) ? value : 'auto';
    },
    handleBatchRewriteWordLimitOptionUpdate: (value: string) => {
      batchRewriteWordLimitOption.value = isWordLimitOption(value) ? value : '3000';
    },
  };
}
