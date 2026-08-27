import { ref, computed, watch, nextTick } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as api from '../api';
import type { TTSStreamEvent } from '../api';
import { useNovelStore } from '../stores/novel';
import type { Chapter } from '../types';
import type TTSPlayer from '../components/TTSPlayer.vue';
import { CLIENT_TTS_STOPPED, useClientTTS } from './useClientTTS';
import type { UserRole } from '../utils/feature-flags';

// --- Types ---

export type TTSBatchTaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'stopped';

export interface TTSBatchTask {
  chapterNumber: number;
  chapterTitle: string;
  status: TTSBatchTaskStatus;
  progress: string;
  message: string;
}

type TTSPreparedQueueItem = { segment: api.TTSSegmentData; audio: string; duration: number };
type TTSPreparedEntry = {
  updatedAt: string;
  narratorVoice: string;
  items: TTSPreparedQueueItem[];
  complete: boolean;
  usedAt: number;
};

export type TTSBatchPanelExpose = {
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
};

export const TTS_BATCH_STATUS_LABELS: Record<TTSBatchTaskStatus, string> = {
  pending: '排队中',
  running: '合成中',
  done: '已完成',
  failed: '失败',
  stopped: '已停止',
};

const MAX_TTS_PREPARED_CHAPTERS = 5;

export function useTTSManager(deps: {
  novelId: Ref<string>;
  currentChapter: Ref<Chapter | null>;
  currentChapterNum: Ref<number | null>;
  editContent: Ref<string>;
  hasUnsavedChanges: Ref<boolean>;
  saveChapter: (options?: { silent?: boolean }) => Promise<boolean>;
  selectChapter: (num: number) => Promise<void>;
  userRole: Ref<UserRole>;
}) {
  const {
    novelId,
    currentChapter,
    currentChapterNum,
    editContent,
    hasUnsavedChanges,
    saveChapter,
    selectChapter,
    userRole,
  } = deps;
  const novelStore = useNovelStore();

  // --- Client TTS (for non-admin users) ---
  const clientTTS = useClientTTS();
  const usingClientTTS = ref(false);

  // --- TTS Playback ---

  const ttsVisible = ref(false);
  const ttsSynthesizing = ref(false);
  const ttsProgressText = ref('');
  const ttsPlayerRef = ref<InstanceType<typeof TTSPlayer> | null>(null);
  const highlightParagraph = ref(-1);
  let ttsAbort: (() => void) | null = null;
  let clientTTSRunToken = 0;
  const ttsPreparedCache = new Map<number, TTSPreparedEntry>();

  // --- TTS Batch ---

  const ttsBatchDialogVisible = ref(false);
  const ttsBatchSelected = ref<number[]>([]);
  const ttsBatchClearCache = ref(false);
  const ttsBatchRunning = ref(false);
  const ttsBatchStopping = ref(false);
  const ttsBatchTasks = ref<TTSBatchTask[]>([]);
  const ttsBatchCurrentTaskIndex = ref(-1);
  const ttsBatchPanelRef = ref<TTSBatchPanelExpose | null>(null);
  let ttsBatchRunToken = 0;
  let finalizeCurrentBatchTask: (() => void) | null = null;

  // --- Computed ---

  const ttsBatchStats = computed(() => {
    let pending = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    let stopped = 0;

    for (const task of ttsBatchTasks.value) {
      if (task.status === 'pending') pending++;
      else if (task.status === 'running') running++;
      else if (task.status === 'done') done++;
      else if (task.status === 'failed') failed++;
      else if (task.status === 'stopped') stopped++;
    }

    return {
      total: ttsBatchTasks.value.length,
      pending,
      running,
      done,
      failed,
      stopped,
      finished: done + failed + stopped,
    };
  });

  const ttsBatchSummaryText = computed(() => {
    const stats = ttsBatchStats.value;
    if (stats.total === 0) return '暂无任务';
    return `${stats.finished}/${stats.total} · 成功 ${stats.done} · 失败 ${stats.failed} · 停止 ${stats.stopped}`;
  });

  // --- Helper functions ---

  function getTTSSaltNarratorVoice(): string {
    return novelStore.currentNovel?.edgeNarratorVoice || '';
  }

  function touchTTSCacheEntry(chapterNumber: number, entry: TTSPreparedEntry) {
    ttsPreparedCache.delete(chapterNumber);
    ttsPreparedCache.set(chapterNumber, { ...entry, usedAt: Date.now() });
    while (ttsPreparedCache.size > MAX_TTS_PREPARED_CHAPTERS) {
      const oldestKey = ttsPreparedCache.keys().next().value as number | undefined;
      if (oldestKey === undefined) break;
      ttsPreparedCache.delete(oldestKey);
    }
  }

  function clearTTSCache() {
    ttsPreparedCache.clear();
  }

  function stopClientTTS(hidePlayer = true) {
    clientTTSRunToken += 1;
    clientTTS.stop();
    usingClientTTS.value = false;
    highlightParagraph.value = -1;
    ttsProgressText.value = '';
    if (hidePlayer) {
      ttsVisible.value = false;
    }
  }

  function pauseClientTTS() {
    clientTTS.pause();
  }

  function resumeClientTTS() {
    clientTTS.resume();
  }

  async function restartClientTTS() {
    if (userRole.value === 'admin') return;
    stopClientTTS(false);
    await handleClientTTS();
  }

  function updateTTSBatchTask(index: number, patch: Partial<TTSBatchTask>) {
    const current = ttsBatchTasks.value[index];
    if (!current) return;
    ttsBatchTasks.value[index] = { ...current, ...patch };
  }

  function getTTSBatchStatusType(status: TTSBatchTaskStatus): '' | 'success' | 'warning' | 'danger' | 'info' {
    const map: Record<TTSBatchTaskStatus, '' | 'success' | 'warning' | 'danger' | 'info'> = {
      pending: 'info',
      running: 'warning',
      done: 'success',
      failed: 'danger',
      stopped: 'info',
    };
    return map[status];
  }

  function markPendingTasksAsStopped() {
    for (let i = 0; i < ttsBatchTasks.value.length; i++) {
      if (ttsBatchTasks.value[i].status === 'pending') {
        updateTTSBatchTask(i, {
          status: 'stopped',
          message: '任务已停止',
        });
      }
    }
  }

  // --- TTS Playback Functions ---

  async function handleTTS() {
    // 非管理员使用客户端 TTS
    if (userRole.value !== 'admin') {
      return handleClientTTS();
    }

    // 管理员使用服务器端 TTS
    if (ttsBatchRunning.value) {
      ElMessage.warning('批量排队进行中，请先停止队列');
      return;
    }

    if (!currentChapter.value || !currentChapterNum.value) return;

    if (hasUnsavedChanges.value) {
      const saved = await saveChapter({ silent: true });
      if (!saved) {
        ElMessage.error('当前内容保存失败，请先保存后再播报');
        return;
      }
    }

    if (!editContent.value.trim()) {
      ElMessage.warning('章节内容为空，无法播报');
      return;
    }

    const chapterNum = currentChapterNum.value;
    const narratorVoiceSalt = getTTSSaltNarratorVoice();
    const chapterUpdatedAt = currentChapter.value.updatedAt;
    const cached = ttsPreparedCache.get(chapterNum);
    const canReusePrepared = !ttsSynthesizing.value
      && Boolean(cached?.complete)
      && (cached?.items?.length ?? 0) > 0
      && cached?.updatedAt === chapterUpdatedAt
      && cached?.narratorVoice === narratorVoiceSalt;

    // 同章且内容/旁白音色未变：直接复用已合成队列
    if (canReusePrepared && cached) {
      ttsVisible.value = true;
      ttsSynthesizing.value = false;
      ttsProgressText.value = `${cached.items.length}/${cached.items.length}`;
      await nextTick();
      ttsPlayerRef.value?.loadQueue(cached.items, true);
      touchTTSCacheEntry(chapterNum, cached);
      return;
    }

    // 新合成
    if (ttsAbort) {
      ttsAbort();
      ttsAbort = null;
    }
    ttsPlayerRef.value?.reset();

    const pendingItems: TTSPreparedQueueItem[] = [];

    ttsVisible.value = true;
    ttsSynthesizing.value = true;
    ttsProgressText.value = '0/?';

    ttsAbort = api.streamTTSSynthesize(
      novelId.value,
      chapterNum,
      (event: TTSStreamEvent) => {
        if (event.type === 'segment') {
          ttsProgressText.value = `${event.index + 1}/${event.total}`;
          ttsPlayerRef.value?.pushSegment(event.segment, event.audio, event.duration);
          pendingItems.push({ segment: event.segment, audio: event.audio, duration: event.duration });
        } else if (event.type === 'done') {
          ttsSynthesizing.value = false;
          touchTTSCacheEntry(chapterNum, {
            updatedAt: chapterUpdatedAt,
            narratorVoice: narratorVoiceSalt,
            items: pendingItems,
            complete: true,
            usedAt: Date.now(),
          });
        } else if (event.type === 'error') {
          ttsSynthesizing.value = false;
          ElMessage.error(`语音合成出错: ${event.message}`);
        }
      },
    );
  }

  /**
   * 客户端 TTS 处理（普通用户）
   */
  async function handleClientTTS() {
    if (!currentChapter.value) {
      ElMessage.warning('请先选择章节');
      return;
    }

    const content = editContent.value.trim();
    if (!content) {
      ElMessage.warning('章节内容为空，无法播报');
      return;
    }

    if (!clientTTS.isSupported()) {
      ElMessage.error('您的浏览器不支持语音合成功能，请升级浏览器或使用 Chrome/Edge');
      return;
    }

    const runToken = clientTTSRunToken + 1;
    clientTTSRunToken = runToken;
    clientTTS.stop();

    try {
      usingClientTTS.value = true;
      ttsVisible.value = true;

      // 将章节内容按段落分割
      const paragraphs = content
        .split(/\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (paragraphs.length === 0) {
        ElMessage.warning('章节内容为空');
        return;
      }

      ttsProgressText.value = `0/${paragraphs.length}`;
      ElMessage.success(`开始播报（客户端模式），共 ${paragraphs.length} 段`);

      // 播放所有段落
      await clientTTS.speakQueue(
        paragraphs.map((text, index) => ({ text, paragraphIndex: index })),
        {
          onSegmentStart: (segment, index, total) => {
            if (runToken !== clientTTSRunToken) return;
            ttsProgressText.value = `${index + 1}/${total}`;
            highlightParagraph.value = segment.paragraphIndex ?? index;
          },
        },
      );

      if (runToken !== clientTTSRunToken) return;
      ElMessage.success('播报完成');
    } catch (err) {
      if (runToken !== clientTTSRunToken) return;
      const message = err instanceof Error ? err.message : '播报失败';
      if (message !== CLIENT_TTS_STOPPED) {
        ElMessage.error(message);
      }
    } finally {
      if (runToken !== clientTTSRunToken) return;
      usingClientTTS.value = false;
      highlightParagraph.value = -1;
      ttsProgressText.value = '';
      ttsVisible.value = false;
    }
  }

  function onTTSHighlight(paragraphIndex: number) {
    highlightParagraph.value = paragraphIndex;
  }

  function onTTSClose() {
    // 停止客户端 TTS
    if (usingClientTTS.value) {
      stopClientTTS();
    }

    // 停止服务器端 TTS
    if (ttsBatchRunning.value || ttsBatchStopping.value) {
      stopTTSBatchQueue(false);
    }
    if (ttsAbort) {
      ttsAbort();
      ttsAbort = null;
    }
    ttsVisible.value = false;
    ttsSynthesizing.value = false;
    highlightParagraph.value = -1;
  }

  async function onTTSRegenerate() {
    // 客户端 TTS 不支持重新生成
    if (userRole.value !== 'admin') {
      ElMessage.warning('客户端模式不支持重新生成，请直接重新播放');
      return;
    }

    if (ttsBatchRunning.value) {
      ElMessage.warning('批量排队进行中，请先停止队列');
      return;
    }

    if (!currentChapter.value || !currentChapterNum.value) return;

    if (hasUnsavedChanges.value) {
      const saved = await saveChapter({ silent: true });
      if (!saved) {
        ElMessage.error('当前内容保存失败，请先保存后再重播');
        return;
      }
    }

    // 先关闭当前播放
    if (ttsAbort) {
      ttsAbort();
      ttsAbort = null;
    }

    ttsPlayerRef.value?.reset();
    ttsPreparedCache.delete(currentChapterNum.value);
    const narratorVoiceSalt = getTTSSaltNarratorVoice();
    const chapterUpdatedAt = currentChapter.value.updatedAt;
    const pendingItems: TTSPreparedQueueItem[] = [];

    // 清除后端缓存
    try {
      await api.clearTTSCache(novelId.value, currentChapterNum.value);
    } catch {
      // 缓存清除失败不影响重新合成
    }

    // 重新开始合成
    ttsVisible.value = true;
    ttsSynthesizing.value = true;
    ttsProgressText.value = '0/?';

    ttsAbort = api.streamTTSSynthesize(
      novelId.value,
      currentChapterNum.value,
      (event: TTSStreamEvent) => {
        if (event.type === 'segment') {
          ttsProgressText.value = `${event.index + 1}/${event.total}`;
          ttsPlayerRef.value?.pushSegment(event.segment, event.audio, event.duration);
          pendingItems.push({ segment: event.segment, audio: event.audio, duration: event.duration });
        } else if (event.type === 'done') {
          ttsSynthesizing.value = false;
          touchTTSCacheEntry(currentChapterNum.value!, {
            updatedAt: chapterUpdatedAt,
            narratorVoice: narratorVoiceSalt,
            items: pendingItems,
            complete: true,
            usedAt: Date.now(),
          });
        } else if (event.type === 'error') {
          ttsSynthesizing.value = false;
        }
      },
    );
  }

  // --- TTS Batch Functions ---

  function openTTSBatchDialog() {
    // 批量 TTS 仅限管理员
    if (userRole.value !== 'admin') {
      ElMessage.warning('批量语音合成功能仅限管理员使用');
      return;
    }

    if (ttsBatchRunning.value) {
      ElMessage.warning('批量排队正在执行，请先停止当前任务');
      return;
    }

    ttsBatchSelected.value = currentChapterNum.value ? [currentChapterNum.value] : [];
    ttsBatchClearCache.value = false;
    ttsBatchDialogVisible.value = true;
  }

  function selectAllTTSBatchChapters() {
    ttsBatchSelected.value = novelStore.chapters.map(ch => ch.chapterNumber);
  }

  function clearTTSBatchSelection() {
    ttsBatchSelected.value = [];
  }

  function clearTTSBatchTasks() {
    if (ttsBatchRunning.value) return;
    ttsBatchTasks.value = [];
    ttsBatchCurrentTaskIndex.value = -1;
  }

  function stopTTSBatchQueue(showMessage = true) {
    if (!ttsBatchRunning.value && !ttsBatchStopping.value) return;

    ttsBatchRunning.value = false;
    ttsBatchStopping.value = true;
    ttsBatchRunToken += 1;

    if (ttsAbort) {
      const abort = ttsAbort;
      ttsAbort = null;
      abort();
    }

    if (finalizeCurrentBatchTask) {
      const finalize = finalizeCurrentBatchTask;
      finalizeCurrentBatchTask = null;
      finalize();
    }

    ttsSynthesizing.value = false;

    if (showMessage) {
      ElMessage.info('批量排队已停止');
    }
  }

  function runTTSBatchChapter(
    chapterNumber: number,
    runToken: number,
    taskIndex: number,
  ): Promise<'done' | 'failed' | 'stopped'> {
    return new Promise((resolve) => {
      let finished = false;

      const finish = (status: 'done' | 'failed' | 'stopped') => {
        if (finished) return;
        finished = true;
        finalizeCurrentBatchTask = null;
        ttsAbort = null;
        if (status !== 'done') {
          ttsSynthesizing.value = false;
        }
        resolve(status);
      };

      finalizeCurrentBatchTask = () => finish('stopped');

      ttsVisible.value = true;
      ttsSynthesizing.value = true;
      ttsProgressText.value = `第${chapterNumber}章 0/?`;
      ttsPlayerRef.value?.reset();

      ttsAbort = api.streamTTSSynthesize(
        novelId.value,
        chapterNumber,
        (event: TTSStreamEvent) => {
          if (runToken !== ttsBatchRunToken || !ttsBatchRunning.value) {
            finish('stopped');
            return;
          }

          if (event.type === 'segment') {
            const progress = `${event.index + 1}/${event.total}`;
            ttsProgressText.value = `第${chapterNumber}章 ${progress}`;
            updateTTSBatchTask(taskIndex, {
              progress,
              message: `合成 ${progress}`,
            });
            ttsPlayerRef.value?.pushSegment(event.segment, event.audio, event.duration);
            return;
          }

          if (event.type === 'done') {
            ttsSynthesizing.value = false;
            finish('done');
            return;
          }

          updateTTSBatchTask(taskIndex, {
            message: `失败: ${event.message}`,
          });
          finish('failed');
        },
        undefined,
        {
          onAbort: () => {
            finish(ttsBatchStopping.value ? 'stopped' : 'failed');
          },
        },
      );
    });
  }

  async function runTTSBatchQueue(runToken: number) {
    for (let i = 0; i < ttsBatchTasks.value.length; i++) {
      if (!ttsBatchRunning.value || runToken !== ttsBatchRunToken) break;

      const task = ttsBatchTasks.value[i];
      ttsBatchCurrentTaskIndex.value = i;
      updateTTSBatchTask(i, {
        status: 'running',
        progress: '0/?',
        message: '准备合成',
      });

      if (ttsBatchClearCache.value) {
        try {
          await api.clearTTSCache(novelId.value, task.chapterNumber);
        } catch {
          // 清缓存失败时继续合成
        }
      }

      if (currentChapterNum.value !== task.chapterNumber) {
        await selectChapter(task.chapterNumber);
      }

      const result = await runTTSBatchChapter(task.chapterNumber, runToken, i);

      if (result === 'done') {
        updateTTSBatchTask(i, {
          status: 'done',
          progress: '完成',
          message: '已合成完成',
        });
      } else if (result === 'failed') {
        updateTTSBatchTask(i, {
          status: 'failed',
          progress: '--',
          message: '合成失败',
        });
      } else {
        updateTTSBatchTask(i, {
          status: 'stopped',
          progress: '--',
          message: '已停止',
        });
        break;
      }
    }

    if (runToken !== ttsBatchRunToken) return;

    if (ttsBatchStopping.value) {
      markPendingTasksAsStopped();
    }

    ttsBatchRunning.value = false;
    ttsBatchStopping.value = false;
    ttsBatchCurrentTaskIndex.value = -1;
    finalizeCurrentBatchTask = null;
    ttsAbort = null;
    ttsSynthesizing.value = false;

    const stats = ttsBatchStats.value;
    if (stats.done > 0 && stats.failed === 0 && stats.stopped === 0) {
      ElMessage.success(`批量排队完成：共 ${stats.done} 章`);
    } else if (stats.done > 0) {
      ElMessage.warning(`批量排队结束：成功 ${stats.done}，失败 ${stats.failed}，停止 ${stats.stopped}`);
    } else if (stats.stopped > 0) {
      ElMessage.info('批量排队已停止');
    } else {
      ElMessage.error('批量排队失败');
    }
  }

  async function startTTSBatchQueue() {
    if (ttsBatchRunning.value) return;

    const selectedSet = new Set(ttsBatchSelected.value);
    const selected = novelStore.chapters
      .map(ch => ch.chapterNumber)
      .filter(num => selectedSet.has(num))
      .sort((a, b) => a - b);

    if (selected.length === 0) {
      ElMessage.warning('请至少勾选一个章节');
      return;
    }

    const skipped: number[] = [];
    const queueNumbers: number[] = [];

    for (const chapterNumber of selected) {
      const chapter = novelStore.chapters.find(ch => ch.chapterNumber === chapterNumber);
      if (!chapter || chapter.wordCount <= 0) {
        skipped.push(chapterNumber);
        continue;
      }
      queueNumbers.push(chapterNumber);
    }

    if (queueNumbers.length === 0) {
      ElMessage.warning('所选章节都没有可合成内容');
      return;
    }

    if (skipped.length > 0) {
      ElMessage.warning(`已跳过 ${skipped.length} 个空章节`);
    }

    ttsBatchTasks.value = queueNumbers.map((chapterNumber) => {
      const chapter = novelStore.chapters.find(ch => ch.chapterNumber === chapterNumber);
      return {
        chapterNumber,
        chapterTitle: chapter?.title?.trim() || '',
        status: 'pending' as const,
        progress: '--',
        message: '等待执行',
      };
    });

    ttsBatchDialogVisible.value = false;
    ttsBatchRunning.value = true;
    ttsBatchStopping.value = false;
    ttsBatchCurrentTaskIndex.value = -1;
    ttsBatchRunToken += 1;

    const runToken = ttsBatchRunToken;
    ElMessage.success(`已创建 ${queueNumbers.length} 个排队任务`);
    await runTTSBatchQueue(runToken);
  }

  function handleTTSQueueStatusChipClick(setMobileTab: (tab: string) => void) {
    if (ttsBatchTasks.value.length === 0) {
      openTTSBatchDialog();
      return;
    }
    setMobileTab('editor');
    nextTick(() => {
      ttsBatchPanelRef.value?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  // --- Watchers ---

  // 切换章节时关闭 TTS（避免上一章音频继续播放且高亮错乱）
  watch(currentChapterNum, (nextNum, prevNum) => {
    if (nextNum === prevNum) return;
    if (ttsBatchRunning.value || ttsBatchStopping.value) return;
    if (!ttsVisible.value && !ttsAbort) return;
    onTTSClose();
  });

  // Sync batch selection with available chapters
  watch(
    () => novelStore.chapters,
    (chapters) => {
      const validChapterNumbers = new Set(chapters.map(ch => ch.chapterNumber));
      ttsBatchSelected.value = ttsBatchSelected.value.filter(num => validChapterNumbers.has(num));
    },
  );

  /** Cleanup function for onUnmounted */
  function cleanup() {
    // 停止客户端 TTS
    if (usingClientTTS.value) {
      stopClientTTS(false);
    }

    // 停止服务器端 TTS
    if (ttsBatchRunning.value || ttsBatchStopping.value) {
      stopTTSBatchQueue(false);
    }
    if (ttsAbort) {
      ttsAbort();
      ttsAbort = null;
    }
  }

  return {
    // TTS Playback
    ttsVisible,
    ttsSynthesizing,
    ttsProgressText,
    ttsPlayerRef,
    highlightParagraph,
    handleTTS,
    onTTSHighlight,
    onTTSClose,
    onTTSRegenerate,
    clearTTSCache,

    // Client TTS state
    usingClientTTS,
    clientTTSSpeaking: computed(() => clientTTS.speaking.value),
    clientTTSPaused: computed(() => clientTTS.paused.value),
    clientTTSProgress: computed(() => clientTTS.progress.value),
    clientTTSTotal: computed(() => clientTTS.total.value),
    clientTTSCurrentText: computed(() => clientTTS.currentText.value),
    clientTTSCurrentVoiceName: computed(() => clientTTS.currentVoiceName.value),
    pauseClientTTS,
    resumeClientTTS,
    restartClientTTS,

    // TTS Batch
    ttsBatchDialogVisible,
    ttsBatchSelected,
    ttsBatchClearCache,
    ttsBatchRunning,
    ttsBatchStopping,
    ttsBatchTasks,
    ttsBatchCurrentTaskIndex,
    ttsBatchPanelRef,
    ttsBatchStats,
    ttsBatchSummaryText,
    TTS_BATCH_STATUS_LABELS,
    getTTSBatchStatusType,
    openTTSBatchDialog,
    selectAllTTSBatchChapters,
    clearTTSBatchSelection,
    clearTTSBatchTasks,
    stopTTSBatchQueue,
    startTTSBatchQueue,
    handleTTSQueueStatusChipClick,

    // Cleanup
    cleanup,
  };
}
