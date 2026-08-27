/**
 * 批量定稿后置阶段
 *
 * 在批量生成全部完成后，独立遍历已成功生成的章节逐章执行定稿。
 * 每章定稿互相独立——单章失败不影响其他章节。
 */

// ==================== 常量 ====================

/** 单章定稿超时，默认 10 分钟 */
const DEFAULT_FINALIZE_TIMEOUT_MS = 10 * 60 * 1000;

// ==================== 类型 ====================

export type BatchFinalizeEventType =
  | 'batch-finalize:start'
  | 'batch-finalize:progress'
  | 'batch-finalize:item-complete'
  | 'batch-finalize:item-failed'
  | 'batch-finalize:complete';

export interface BatchFinalizeEvent {
  type: BatchFinalizeEventType;
  batchId: string;
  novelId: string;
  chapterNumber?: number;
  currentIndex: number;
  totalItems: number;
  timestamp: string;
  error?: string;
  succeeded?: number;
  failed?: number;
}

export interface BatchFinalizeResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ chapterNumber: number; error: string }>;
}

export interface BatchFinalizePassOptions {
  batchId: string;
  novelId: string;
  /** 需要定稿的章节号列表（仅成功生成的章节） */
  chapters: number[];
  /** 单章定稿函数 */
  finalizeFn: (chapterNumber: number) => Promise<void>;
  /** 事件回调 */
  onEvent: (event: BatchFinalizeEvent) => void;
  /** 单章超时（毫秒），默认 10 分钟 */
  timeoutMs?: number;
}

// ==================== 工具函数 ====================

function withFinalizeTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`定稿超时（${Math.round(ms / 60000)}分钟）`)),
        ms,
      );
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// ==================== 核心函数 ====================

export async function runBatchFinalizePass(
  options: BatchFinalizePassOptions,
): Promise<BatchFinalizeResult> {
  const {
    batchId,
    novelId,
    chapters,
    finalizeFn,
    onEvent,
    timeoutMs = DEFAULT_FINALIZE_TIMEOUT_MS,
  } = options;

  const result: BatchFinalizeResult = {
    total: chapters.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  const emit = (
    type: BatchFinalizeEventType,
    index: number,
    extra?: Partial<BatchFinalizeEvent>,
  ) => {
    onEvent({
      type,
      batchId,
      novelId,
      currentIndex: index,
      totalItems: chapters.length,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  };

  emit('batch-finalize:start', 0);

  for (let i = 0; i < chapters.length; i++) {
    const chapterNumber = chapters[i];

    emit('batch-finalize:progress', i, { chapterNumber });

    try {
      await withFinalizeTimeout(finalizeFn(chapterNumber), timeoutMs);
      result.succeeded++;
      emit('batch-finalize:item-complete', i, {
        chapterNumber,
        succeeded: result.succeeded,
        failed: result.failed,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push({ chapterNumber, error: errMsg });
      console.warn(`[批量定稿] 第 ${chapterNumber} 章定稿失败:`, errMsg);
      emit('batch-finalize:item-failed', i, {
        chapterNumber,
        error: errMsg,
        succeeded: result.succeeded,
        failed: result.failed,
      });
      // 继续下一章，不中断
    }
  }

  emit('batch-finalize:complete', chapters.length, {
    succeeded: result.succeeded,
    failed: result.failed,
  });

  return result;
}
