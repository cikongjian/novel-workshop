import { ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as api from '../api';
import { useNovelStore } from '../stores/novel';
import { useAgentsStore } from '../stores/agents';

type WordLimitOption = 'none' | '2000' | '3000' | '4000' | '5000' | 'custom';

function isWordLimitOption(value: string): value is WordLimitOption {
  const options: WordLimitOption[] = ['none', '2000', '3000', '4000', '5000', 'custom'];
  return options.includes(value as WordLimitOption);
}

function resolveMaxWordCount(option: WordLimitOption, custom: number): number | undefined {
  if (option === 'none') return undefined;
  if (option === 'custom') {
    const normalized = Number.isFinite(custom) ? Math.round(custom) : 3000;
    return Math.min(20000, Math.max(800, normalized));
  }
  return Number(option);
}

export function useBatchOperations(deps: {
  novelId: Ref<string>;
  isBatchRunningHere: Ref<boolean>;
  chapterNumberBounds: Ref<{ min: number; max: number }>;
}) {
  const { novelId, isBatchRunningHere, chapterNumberBounds } = deps;
  const novelStore = useNovelStore();
  const agentsStore = useAgentsStore();

  // Dialog visibility
  const batchDialogVisible = ref(false);

  // Batch options
  const batchFromChapter = ref(1);
  const batchToChapter = ref(1);
  const batchUserDirection = ref('');
  const batchWordLimitOption = ref<WordLimitOption>('3000');
  const batchCustomWordLimit = ref(3000);

  // Open batch dialog
  function openBatchDialog() {
    if (isBatchRunningHere.value) {
      ElMessage.warning('已有批量任务正在执行');
      return;
    }
    const chapterCount = novelStore.chapters.length;
    batchFromChapter.value = chapterCount + 1;
    batchToChapter.value = chapterCount + 3;
    batchUserDirection.value = '';
    batchWordLimitOption.value = '3000';
    batchCustomWordLimit.value = 3000;
    batchDialogVisible.value = true;
  }

  // Handle batch generation
  async function handleBatchGenerate() {
    if (batchFromChapter.value > batchToChapter.value) {
      ElMessage.warning('起始章节不能大于结束章节');
      return;
    }
    batchDialogVisible.value = false;
    try {
      const result = await api.startBatchGenerate({
        novelId: novelId.value,
        fromChapter: batchFromChapter.value,
        toChapter: batchToChapter.value,
        userDirection: batchUserDirection.value.trim() || undefined,
        maxWordCount: resolveMaxWordCount(batchWordLimitOption.value, batchCustomWordLimit.value),
      });
      agentsStore.initBatchItems(result.items);
      ElMessage.success(`批量生成已启动：${result.items.length} 章`);
    } catch (err: unknown) {
      // 处理用户级并发限制（单用户最多 1 个批量任务）
      const errorData = (err as { response?: { data?: { code?: string; error?: string; runningJob?: { novelId: string } } } })?.response?.data;
      if (errorData?.code === 'USER_CONCURRENT_LIMIT' && errorData.runningJob) {
        ElMessage({
          type: 'warning',
          message: errorData.error ?? '已有批量任务正在运行',
          duration: 5000,
        });
        return;
      }
      const msg = errorData?.error ?? (err instanceof Error ? err.message : '启动批量生成失败');
      ElMessage.error(msg);
    }
  }

  // Handle batch cancel
  async function handleBatchCancel() {
    try {
      await api.cancelBatch(novelId.value);
      ElMessage.info('正在取消批量任务...');
    } catch {
      ElMessage.error('取消失败');
    }
  }

  // Handle batch clear
  function handleBatchClear() {
    agentsStore.clearBatch();
  }

  // Word limit option update handler
  function handleBatchWordLimitOptionUpdate(value: string) {
    batchWordLimitOption.value = isWordLimitOption(value) ? value : '3000';
  }

  return {
    // Dialog visibility
    batchDialogVisible,

    // Batch options
    batchFromChapter,
    batchToChapter,
    batchUserDirection,
    batchWordLimitOption,
    batchCustomWordLimit,

    // Methods
    openBatchDialog,
    handleBatchGenerate,
    handleBatchCancel,
    handleBatchClear,
    handleBatchWordLimitOptionUpdate,
  };
}
