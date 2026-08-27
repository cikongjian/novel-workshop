import { ref, computed, watch } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import type { ChapterQualityTrendItem, ChapterQualityTrendResponse } from '../api';
import { useNovelStore } from '../stores/novel';
import { extractApiErrorMessage, buildReviseFailureMessage } from '../utils/api-error';
import type { ChapterPacing } from '../types';

const QUALITY_TREND_LIMIT = 12;

export function useQualityTrend(deps: {
  novelId: Ref<string>;
  currentChapterNum: Ref<number | null>;
  isDesktop: Ref<boolean>;
  selectChapter: (num: number) => Promise<void>;
  openReviseDialog: (prefill?: string) => void;
  setMobileTab: (tab: 'chapters' | 'editor' | 'comments') => void;
}) {
  const { novelId, currentChapterNum, isDesktop, selectChapter, openReviseDialog, setMobileTab } = deps;
  const novelStore = useNovelStore();

  const pacingData = ref<ChapterPacing[]>([]);
  const qualityTrendLoading = ref(false);
  const qualityTrend = ref<ChapterQualityTrendResponse | null>(null);
  const qualityTrendFailedOnly = ref(false);
  const qualityTrendBatchRevising = ref(false);
  const qualityTrendBatchProgress = ref('');
  const qualityTrendBatchStopRequested = ref(false);
  const qualityTrendBatchDeltaItems = ref<Array<{
    chapterNumber: number;
    beforeOverall: number;
    afterOverall: number | null;
    deltaOverall: number | null;
  }>>([]);
  const trendFocusedChapter = ref<number | null>(null);
  let trendFocusClearTimer: ReturnType<typeof setTimeout> | null = null;

  const qualityTrendDisplayItems = computed(() => {
    const items = qualityTrend.value?.items ?? [];
    return [...items].slice(-12).reverse();
  });

  const qualityTrendEmptyText = computed(() => (
    qualityTrendFailedOnly.value ? '暂无未达标章节' : '暂无可分析章节'
  ));

  const qualityTrendFailedItems = computed(() => {
    const items = qualityTrend.value?.items ?? [];
    return items.filter(item => !item.passed).sort((a, b) => a.chapterNumber - b.chapterNumber);
  });

  const qualityTrendBatchDeltaSummary = computed(() => {
    const validItems = qualityTrendBatchDeltaItems.value.filter(item => item.deltaOverall !== null);
    const improved = validItems.filter(item => (item.deltaOverall ?? 0) > 0).length;
    const declined = validItems.filter(item => (item.deltaOverall ?? 0) < 0).length;
    const unchanged = validItems.filter(item => item.deltaOverall === 0).length;
    const avgDelta = validItems.length > 0
      ? Math.round((validItems.reduce((acc, item) => acc + (item.deltaOverall ?? 0), 0) / validItems.length) * 10) / 10
      : 0;
    return {
      total: qualityTrendBatchDeltaItems.value.length,
      comparable: validItems.length,
      improved,
      declined,
      unchanged,
      avgDelta,
    };
  });

  function getQualityScoreTagType(score: number): 'success' | 'warning' | 'danger' {
    if (score >= 75) return 'success';
    if (score >= 60) return 'warning';
    return 'danger';
  }

  async function refreshQualityTrend() {
    if (!novelId.value) return;
    if (novelStore.chapters.length === 0) {
      qualityTrend.value = null;
      return;
    }
    qualityTrendLoading.value = true;
    try {
      qualityTrend.value = await api.fetchChapterQualityTrend(novelId.value, {
        limit: QUALITY_TREND_LIMIT,
        failedOnly: qualityTrendFailedOnly.value,
      });
    } catch (err: unknown) {
      qualityTrend.value = null;
      ElMessage.error(extractApiErrorMessage(err, '质量趋势刷新失败'));
    } finally {
      qualityTrendLoading.value = false;
    }
  }

  function buildQuickReviseFeedback(item: ChapterQualityTrendItem): string {
    const targetDelta = 5;
    const targetOverall = Math.min(100, Math.round((item.overallScore + targetDelta) * 10) / 10);
    const focusHints: string[] = [];
    if (item.structureScore < 65) {
      focusHints.push('结构维度：补齐"冲突升级 -> 关键抉择 -> 结果反馈"的因果链，每个场景至少落一个可见事件。');
    }
    if (item.styleScore < 62) {
      focusHints.push('文风维度：替换重复开场句和套话，控制说明性段落比例，避免句式连续雷同。');
    }
    if (item.emotionScore < 60) {
      focusHints.push('情绪维度：在关键动作前后补充情绪触发、身体反应与后果，形成至少一次波峰。');
    }
    if (focusHints.length === 0) {
      focusHints.push('综合维度：在不改变剧情方向前提下，强化冲突张力、表达多样性与情绪起伏。');
    }
    return [
      `请优先修订第 ${item.chapterNumber} 章，目标是提升质量门禁得分。`,
      `量化目标：总分至少提升 +${targetDelta}（当前 ${item.overallScore}，目标不低于 ${targetOverall}）。`,
      `当前问题摘要：${item.summary}`,
      ...focusHints.map(text => `请重点处理：${text}`),
      '输出要求：不删核心剧情点，不新增设定冲突；若首轮提升不足 +5，请继续小步补强直到达到目标。',
    ].join('\n');
  }

  async function jumpToChapterFromTrend(chapterNumber: number) {
    if (trendFocusClearTimer) clearTimeout(trendFocusClearTimer);
    trendFocusedChapter.value = chapterNumber;
    trendFocusClearTimer = setTimeout(() => {
      trendFocusedChapter.value = null;
      trendFocusClearTimer = null;
    }, 1800);

    if (currentChapterNum.value === chapterNumber) return;
    await selectChapter(chapterNumber);
    if (!isDesktop.value) setMobileTab('editor');
  }

  async function quickReviseFromTrend(item: ChapterQualityTrendItem) {
    await jumpToChapterFromTrend(item.chapterNumber);
    openReviseDialog(buildQuickReviseFeedback(item));
  }

  async function batchReviseFailedFromTrend() {
    if (!novelId.value || qualityTrendBatchRevising.value) return;
    const targets = qualityTrendFailedItems.value;
    if (targets.length === 0) {
      ElMessage.success('当前样本中暂无未达标章节');
      return;
    }

    try {
      await ElMessageBox.confirm(
        `将按顺序修订 ${targets.length} 个未达标章节，过程中会占用生成通道。是否继续？`,
        '批量修订确认',
        { type: 'warning', confirmButtonText: '开始修订', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }

    qualityTrendBatchRevising.value = true;
    qualityTrendBatchStopRequested.value = false;
    qualityTrendBatchDeltaItems.value = [];
    const beforeScoreMap = new Map<number, number>(
      targets.map(item => [item.chapterNumber, item.overallScore]),
    );
    let successCount = 0;
    let failedCount = 0;
    let stopped = false;
    const failedReasons: Array<{ chapterNumber: number; message: string }> = [];
    try {
      for (let i = 0; i < targets.length; i += 1) {
        if (qualityTrendBatchStopRequested.value) {
          stopped = true;
          break;
        }
        const item = targets[i];
        qualityTrendBatchProgress.value = `修订中 ${i + 1}/${targets.length}（第 ${item.chapterNumber} 章）`;
        try {
          await api.reviseChapter({
            novelId: novelId.value,
            chapterNumber: item.chapterNumber,
            feedback: buildQuickReviseFeedback(item),
          });
          successCount += 1;
        } catch (err: unknown) {
          failedCount += 1;
          failedReasons.push({
            chapterNumber: item.chapterNumber,
            message: buildReviseFailureMessage(err),
          });
        }
      }

      let afterTrendAll: ChapterQualityTrendResponse | null = null;
      try {
        afterTrendAll = await api.fetchChapterQualityTrend(novelId.value, {
          limit: QUALITY_TREND_LIMIT,
          failedOnly: false,
        });
      } catch {
        afterTrendAll = null;
      }
      if (afterTrendAll) {
        const afterMap = new Map(
          afterTrendAll.items.map(item => [item.chapterNumber, item.overallScore]),
        );
        qualityTrendBatchDeltaItems.value = targets.map(item => {
          const beforeOverall = beforeScoreMap.get(item.chapterNumber) ?? item.overallScore;
          const afterOverall = afterMap.get(item.chapterNumber) ?? null;
          return {
            chapterNumber: item.chapterNumber,
            beforeOverall,
            afterOverall,
            deltaOverall: afterOverall === null ? null : afterOverall - beforeOverall,
          };
        });
      }

      qualityTrendBatchProgress.value = '';
      await novelStore.refreshChapters({ force: true });
      if (currentChapterNum.value) {
        await selectChapter(currentChapterNum.value);
      }
      await refreshQualityTrend();
      const deltaSummary = qualityTrendBatchDeltaSummary.value;
      const deltaHint = deltaSummary.comparable > 0
        ? `，平均变化 ${deltaSummary.avgDelta >= 0 ? '+' : ''}${deltaSummary.avgDelta}`
        : '';
      const reasonHint = failedReasons.length > 0
        ? `。失败原因：${failedReasons.slice(0, 3).map(item => `第${item.chapterNumber}章 ${item.message}`).join('；')}${failedReasons.length > 3 ? '；…' : ''}`
        : '';
      if (stopped) {
        ElMessage.warning(`批量修订已停止：成功 ${successCount}，失败 ${failedCount}${deltaHint}${reasonHint}`);
      } else if (failedCount > 0) {
        ElMessage.warning(`批量修订完成：成功 ${successCount}，失败 ${failedCount}${deltaHint}${reasonHint}`);
      } else {
        ElMessage.success(`批量修订完成：共 ${successCount} 章${deltaHint}`);
      }
    } finally {
      qualityTrendBatchRevising.value = false;
      qualityTrendBatchStopRequested.value = false;
      qualityTrendBatchProgress.value = '';
    }
  }

  function stopBatchReviseFailedFromTrend() {
    if (!qualityTrendBatchRevising.value || qualityTrendBatchStopRequested.value) return;
    qualityTrendBatchStopRequested.value = true;
    ElMessage.info('已请求停止，将在当前章节修订完成后停止');
  }

  watch(qualityTrendFailedOnly, () => {
    void refreshQualityTrend();
  });

  function clearTrendFocusTimer() {
    if (trendFocusClearTimer) {
      clearTimeout(trendFocusClearTimer);
      trendFocusClearTimer = null;
    }
  }

  return {
    pacingData,
    qualityTrendLoading,
    qualityTrend,
    qualityTrendFailedOnly,
    qualityTrendBatchRevising,
    qualityTrendBatchProgress,
    qualityTrendBatchStopRequested,
    qualityTrendBatchDeltaItems,
    trendFocusedChapter,
    qualityTrendDisplayItems,
    qualityTrendEmptyText,
    qualityTrendFailedItems,
    qualityTrendBatchDeltaSummary,
    getQualityScoreTagType,
    refreshQualityTrend,
    jumpToChapterFromTrend,
    quickReviseFromTrend,
    batchReviseFailedFromTrend,
    stopBatchReviseFailedFromTrend,
    clearTrendFocusTimer,
  };
}
