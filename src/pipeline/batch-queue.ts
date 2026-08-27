import { randomUUID } from 'node:crypto';
import { runWithIdleTimeout } from './heartbeat-timeout.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('batch-queue');

export type BatchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type BatchJobItem = {
  chapterNumber: number;
  status: BatchJobStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  duration?: number;
};

export type BatchJob = {
  id: string;
  novelId: string;
  /** 启动该任务的用户 ID（用于用户级并发限制） */
  userId?: string;
  items: BatchJobItem[];
  autoFinalize: boolean;
  status: BatchJobStatus;
  currentIndex: number;
  createdAt: string;
  completedAt?: string;
};

export type BatchEvent = {
  type: 'batch:start' | 'batch:progress' | 'batch:item-complete' | 'batch:item-failed'
    | 'batch:item-retry' | 'batch:complete' | 'batch:failed' | 'batch:cancelled' | 'batch:paused'
    | 'batch:resumed' | 'batch:retry';
  batchId: string;
  novelId: string;
  chapterNumber?: number;
  currentIndex: number;
  totalItems: number;
  timestamp: string;
  /** 当前自动重试第几次（仅 batch:item-retry） */
  attempt?: number;
  /** 最大自动重试次数（仅 batch:item-retry） */
  maxRetries?: number;
  /** 失败原因（失败/重试事件可选） */
  error?: string;
};

export interface BatchExecuteOptions {
  /**
   * 单章生成总时长上限（毫秒，兜底保护），默认 60 分钟。
   * @deprecated 建议使用 maxTotalTimeoutMs。若未指定 maxTotalTimeoutMs，则用此值。
   */
  chapterTimeoutMs?: number;
  /** 空闲超时（毫秒）：距离上次心跳超过此值则判定卡死。默认 5 分钟 */
  idleTimeoutMs?: number;
  /** 绝对总时长上限（毫秒）：兜底保护，防止异常情况无限等待。默认 60 分钟 */
  maxTotalTimeoutMs?: number;
  /** 自动重试次数（失败/超时后），默认 2 */
  maxAutoRetries?: number;
  /** 重试间隔（毫秒），默认 5 秒 */
  retryDelayMs?: number;
}

const DEFAULT_CHAPTER_TIMEOUT_MS = 60 * 60 * 1000; // 60 分钟（兜底总时长）
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟（空闲心跳超时）
const DEFAULT_MAX_TOTAL_TIMEOUT_MS = 60 * 60 * 1000; // 60 分钟
const DEFAULT_MAX_AUTO_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 5_000; // 5 秒

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 内存批量生成队列（支持多任务并发，最多 5 个）
 *
 * 并发控制策略：
 * - 全局上限：最多 5 个批量任务同时运行（跨所有用户）
 * - 用户上限：单个用户最多同时运行 1 个批量任务（避免 LLM API 竞争导致的性能下降）
 *   章节生成管线内部已有 10+ 个串行 agent 调用，多个批量并行会导致 LLM API 限流/拥塞，
 *   每个调用都变慢，反而比串行更慢。用户级并发=1 强制串行化，保证单任务执行效率。
 */
export class BatchQueue {
  private readonly MAX_CONCURRENT_JOBS = 5;
  /** 单用户最多同时运行的批量任务数（避免 LLM API 竞争） */
  private readonly MAX_CONCURRENT_JOBS_PER_USER = 1;
  private jobs = new Map<string, BatchJob>(); // key: novelId
  private cancelRequested = new Set<string>(); // novelId set
  private pauseRequested = new Set<string>(); // novelId set
  private pauseResolvers = new Map<string, () => void>(); // novelId -> resolve
  private abortControllers = new Map<string, AbortController>(); // novelId -> AbortController
  private executionVersions = new Map<string, number>(); // novelId -> execution version
  private jobCallbacks = new Map<string, {
    onBatchEvent: (event: BatchEvent) => void;
    generateFn: (chapterNumber: number, signal: AbortSignal, heartbeat: (stage?: string) => void) => Promise<unknown>;
    postProcessFn?: (chapterNumber: number, result: unknown) => Promise<void>;
    options: Required<BatchExecuteOptions>;
  }>();

  get activeJobs(): BatchJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === 'running');
  }

  getJob(novelId: string): BatchJob | null {
    return this.jobs.get(novelId) ?? null;
  }

  isRunning(novelId?: string): boolean {
    if (novelId) {
      const job = this.jobs.get(novelId);
      return job?.status === 'running';
    }
    return Array.from(this.jobs.values()).some(job => job.status === 'running');
  }

  canStartNewJob(): boolean {
    const runningCount = Array.from(this.jobs.values()).filter(job => job.status === 'running').length;
    return runningCount < this.MAX_CONCURRENT_JOBS;
  }

  /**
   * 检查指定用户是否可以启动新的批量任务。
   * 用户级并发限制：单用户最多同时运行 MAX_CONCURRENT_JOBS_PER_USER 个任务。
   * 章节生成管线涉及 10+ 个串行 agent 调用，单任务已能饱和 LLM API，
   * 多任务并行会因 API 限流导致每个任务都变慢，反而比串行更慢。
   */
  canUserStartJob(userId?: string): { allowed: boolean; reason?: string; runningJob?: BatchJob } {
    if (!userId) return { allowed: true }; // 未鉴权场景不限制（兼容旧逻辑）
    const userRunningJobs = Array.from(this.jobs.values()).filter(
      job => job.userId === userId && job.status === 'running',
    );
    if (userRunningJobs.length >= this.MAX_CONCURRENT_JOBS_PER_USER) {
      return {
        allowed: false,
        reason: `每个账号同时只能运行 ${this.MAX_CONCURRENT_JOBS_PER_USER} 个批量任务，请等待当前任务完成或取消后再试`,
        runningJob: userRunningJobs[0],
      };
    }
    return { allowed: true };
  }

  /** 获取指定用户正在运行的任务列表 */
  getUserRunningJobs(userId: string): BatchJob[] {
    return Array.from(this.jobs.values()).filter(
      job => job.userId === userId && job.status === 'running',
    );
  }

  getRunningJobsCount(): number {
    return Array.from(this.jobs.values()).filter(job => job.status === 'running').length;
  }

  cancel(novelId: string): void {
    this.cancelRequested.add(novelId);
    // 中断正在进行的模型调用
    const controller = this.abortControllers.get(novelId);
    if (controller) controller.abort();
    // 若当前处于 pause 等待，唤醒等待逻辑以便尽快进入 cancel 分支
    const resolve = this.pauseResolvers.get(novelId);
    if (resolve) {
      this.pauseResolvers.delete(novelId);
      resolve();
    }
  }

  pause(novelId: string): void {
    const job = this.jobs.get(novelId);
    if (!job || job.status !== 'running') return;
    this.pauseRequested.add(novelId);
  }

  resume(novelId: string): void {
    if (!this.pauseRequested.has(novelId) && !this.pauseResolvers.has(novelId)) return;
    this.pauseRequested.delete(novelId);
    const resolve = this.pauseResolvers.get(novelId);
    if (resolve) {
      resolve();
      this.pauseResolvers.delete(novelId);
    }
  }

  isPaused(novelId: string): boolean {
    return this.pauseRequested.has(novelId) || this.pauseResolvers.has(novelId);
  }

  forceReset(novelId: string): BatchJob | null {
    const job = this.jobs.get(novelId);
    if (!job) return null;

    const callbacks = this.jobCallbacks.get(novelId);
    const timestamp = new Date().toISOString();
    const currentVersion = this.executionVersions.get(novelId);

    this.invalidateExecution(novelId);
    this.cancelRequested.add(novelId);
    this.pauseRequested.delete(novelId);

    for (const item of job.items) {
      if (item.status === 'running' || item.status === 'pending') {
        item.status = 'cancelled';
        item.completedAt ??= timestamp;
      }
    }
    job.status = 'cancelled';
    job.completedAt = timestamp;

    const controller = this.abortControllers.get(novelId);
    if (controller) controller.abort(new Error('batch force reset'));

    const resolve = this.pauseResolvers.get(novelId);
    if (resolve) {
      this.pauseResolvers.delete(novelId);
      resolve();
    }

    if (callbacks && currentVersion != null) {
      this.emitBatchEvent(callbacks.onBatchEvent, {
        type: 'batch:cancelled',
        batchId: job.id,
        novelId: job.novelId,
        currentIndex: job.currentIndex,
        totalItems: job.items.length,
        timestamp,
        error: '任务已强制重置',
      }, novelId, currentVersion);
    }

    this.cleanupJobState(novelId, undefined, true);
    return job;
  }

  private startExecution(novelId: string): number {
    const nextVersion = (this.executionVersions.get(novelId) ?? 0) + 1;
    this.executionVersions.set(novelId, nextVersion);
    return nextVersion;
  }

  private invalidateExecution(novelId: string): void {
    const nextVersion = (this.executionVersions.get(novelId) ?? 0) + 1;
    this.executionVersions.set(novelId, nextVersion);
  }

  private isExecutionCurrent(novelId: string, executionVersion: number): boolean {
    return this.executionVersions.get(novelId) === executionVersion;
  }

  private emitBatchEvent(
    onBatchEvent: (event: BatchEvent) => void,
    event: BatchEvent,
    novelId?: string,
    executionVersion?: number,
  ): void {
    if (novelId && executionVersion != null && !this.isExecutionCurrent(novelId, executionVersion)) {
      return;
    }
    try {
      onBatchEvent(event);
    } catch (err) {
      console.error('[batch-queue] onBatchEvent failed:', err);
    }
  }

  private cleanupJobState(
    novelId: string,
    executionVersion?: number,
    removeJob = false,
  ): void {
    if (executionVersion != null && !this.isExecutionCurrent(novelId, executionVersion)) {
      return;
    }
    const job = this.jobs.get(novelId);
    const hasFailedItems = job?.items.some(item => item.status === 'failed') ?? false;
    if (removeJob) {
      this.jobs.delete(novelId);
      this.jobCallbacks.delete(novelId);
    } else if (!hasFailedItems) {
      // 终态任务保留到同一本小说创建下一项任务，便于状态查询；只有失败任务保留重试回调。
      this.jobCallbacks.delete(novelId);
    }
    this.cancelRequested.delete(novelId);
    this.pauseRequested.delete(novelId);
    this.abortControllers.delete(novelId);
    this.executionVersions.delete(novelId);
    const resolve = this.pauseResolvers.get(novelId);
    if (resolve) {
      this.pauseResolvers.delete(novelId);
      resolve();
    }
  }

  async retryFailed(novelId: string): Promise<void> {
    const job = this.jobs.get(novelId);
    if (!job || job.status === 'running') return;

    const failedItems = job.items.filter(i => i.status === 'failed');
    if (failedItems.length === 0) return;

    for (const item of failedItems) {
      item.status = 'pending';
      item.error = undefined;
      item.retryCount += 1;
      item.duration = undefined;
      item.startedAt = undefined;
      item.completedAt = undefined;
    }

    job.status = 'running';
    job.completedAt = undefined;
    this.cancelRequested.delete(novelId);
    this.pauseRequested.delete(novelId);
    // 重试时创建新的 AbortController
    this.abortControllers.set(novelId, new AbortController());
    const executionVersion = this.startExecution(novelId);

    const callbacks = this.jobCallbacks.get(novelId);
    if (!callbacks) return;

    const { onBatchEvent, generateFn, postProcessFn } = callbacks;

    this.emitBatchEvent(onBatchEvent, {
      type: 'batch:retry',
      batchId: job.id,
      novelId: job.novelId,
      currentIndex: 0,
      totalItems: job.items.length,
      timestamp: new Date().toISOString(),
    }, novelId, executionVersion);

    // 只重跑 pending（即刚重置的 failed）项
    await this.runPendingItems(novelId, job, generateFn, onBatchEvent, callbacks.options, executionVersion, postProcessFn);
  }

  getProgress(novelId: string): {
    completed: number;
    failed: number;
    pending: number;
    running: number;
    total: number;
    estimatedRemainingMs: number | null;
  } {
    const job = this.jobs.get(novelId);
    if (!job) {
      return { completed: 0, failed: 0, pending: 0, running: 0, total: 0, estimatedRemainingMs: null };
    }

    const completed = job.items.filter(i => i.status === 'completed').length;
    const failed = job.items.filter(i => i.status === 'failed').length;
    const pending = job.items.filter(i => i.status === 'pending').length;
    const running = job.items.filter(i => i.status === 'running').length;
    const total = job.items.length;

    // 预估剩余时间：基于已完成项的平均耗时
    let estimatedRemainingMs: number | null = null;
    const finishedWithDuration = job.items.filter(i => i.duration != null && i.duration > 0);
    if (finishedWithDuration.length > 0) {
      const avgMs = finishedWithDuration.reduce((sum, i) => sum + (i.duration ?? 0), 0) / finishedWithDuration.length;
      const remaining = pending + running;
      estimatedRemainingMs = Math.round(avgMs * remaining);
    }

    return { completed, failed, pending, running, total, estimatedRemainingMs };
  }

  createJob(
    novelId: string,
    fromChapter: number,
    toChapter: number,
    autoFinalize: boolean,
    userId?: string,
  ): BatchJob {
    const items: BatchJobItem[] = [];
    for (let i = fromChapter; i <= toChapter; i++) {
      items.push({ chapterNumber: i, status: 'pending', retryCount: 0 });
    }
    return {
      id: randomUUID(),
      novelId,
      userId,
      items,
      autoFinalize,
      status: 'pending',
      currentIndex: 0,
      createdAt: new Date().toISOString(),
    };
  }

  async execute(params: {
    job: BatchJob;
    generateFn: (chapterNumber: number, signal: AbortSignal, heartbeat: (stage?: string) => void) => Promise<unknown>;
    /** 生成成功后的后处理（保存、广播等）— 在超时和重试之外运行 */
    postProcessFn?: (chapterNumber: number, result: unknown) => Promise<void>;
    onBatchEvent: (event: BatchEvent) => void;
    options?: BatchExecuteOptions;
  }): Promise<BatchJob> {
    const { job, generateFn, onBatchEvent, postProcessFn } = params;
    const { novelId } = job;

    const options: Required<BatchExecuteOptions> = {
      chapterTimeoutMs: params.options?.chapterTimeoutMs ?? DEFAULT_CHAPTER_TIMEOUT_MS,
      idleTimeoutMs: params.options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      maxTotalTimeoutMs: params.options?.maxTotalTimeoutMs
        ?? params.options?.chapterTimeoutMs
        ?? DEFAULT_MAX_TOTAL_TIMEOUT_MS,
      maxAutoRetries: params.options?.maxAutoRetries ?? DEFAULT_MAX_AUTO_RETRIES,
      retryDelayMs: params.options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    };

    const abortController = new AbortController();
    const executionVersion = this.startExecution(novelId);
    this.abortControllers.set(novelId, abortController);
    this.jobs.set(novelId, job);
    this.cancelRequested.delete(novelId);
    this.pauseRequested.delete(novelId);
    this.jobCallbacks.set(novelId, { onBatchEvent, generateFn, postProcessFn, options });
    job.status = 'running';

    this.emitBatchEvent(onBatchEvent, {
      type: 'batch:start',
      batchId: job.id,
      novelId: job.novelId,
      currentIndex: 0,
      totalItems: job.items.length,
      timestamp: new Date().toISOString(),
    }, novelId, executionVersion);

    await this.runPendingItems(novelId, job, generateFn, onBatchEvent, options, executionVersion, postProcessFn);

    return job;
  }

  private async runPendingItems(
    novelId: string,
    job: BatchJob,
    generateFn: (chapterNumber: number, signal: AbortSignal, heartbeat: (stage?: string) => void) => Promise<unknown>,
    onBatchEvent: (event: BatchEvent) => void,
    options: Required<BatchExecuteOptions>,
    executionVersion: number,
    postProcessFn?: (chapterNumber: number, result: unknown) => Promise<void>,
  ): Promise<void> {
    const abortController = this.abortControllers.get(novelId) ?? new AbortController();
    if (!this.abortControllers.has(novelId)) {
      this.abortControllers.set(novelId, abortController);
    }
    const { signal } = abortController;
    const { idleTimeoutMs, maxTotalTimeoutMs, maxAutoRetries, retryDelayMs } = options;

    try {
      for (let i = 0; i < job.items.length; i++) {
        const item = job.items[i];
        if (item.status !== 'pending') continue;

        // 暂停检查：完成当前章节后暂停
        if (this.pauseRequested.has(novelId)) {
          this.emitBatchEvent(onBatchEvent, {
            type: 'batch:paused',
            batchId: job.id,
            novelId: job.novelId,
            currentIndex: i,
            totalItems: job.items.length,
            timestamp: new Date().toISOString(),
          }, novelId, executionVersion);
          // 等待 resume / cancel
          await new Promise<void>(resolve => {
            this.pauseResolvers.set(novelId, resolve);
          });
          if (!this.isExecutionCurrent(novelId, executionVersion)) {
            return;
          }
          this.emitBatchEvent(onBatchEvent, {
            type: 'batch:resumed',
            batchId: job.id,
            novelId: job.novelId,
            currentIndex: i,
            totalItems: job.items.length,
            timestamp: new Date().toISOString(),
          }, novelId, executionVersion);
        }

        if (this.cancelRequested.has(novelId)) {
          for (let j = i; j < job.items.length; j++) {
            if (job.items[j].status === 'pending') {
              job.items[j].status = 'cancelled';
            }
          }
          job.status = 'cancelled';
          job.completedAt = new Date().toISOString();
          this.emitBatchEvent(onBatchEvent, {
            type: 'batch:cancelled',
            batchId: job.id,
            novelId: job.novelId,
            currentIndex: i,
            totalItems: job.items.length,
            timestamp: new Date().toISOString(),
          }, novelId, executionVersion);
          return;
        }

        item.status = 'running';
        item.startedAt = new Date().toISOString();
        job.currentIndex = i;

        this.emitBatchEvent(onBatchEvent, {
          type: 'batch:progress',
          batchId: job.id,
          novelId: job.novelId,
          chapterNumber: item.chapterNumber,
          currentIndex: i,
          totalItems: job.items.length,
          timestamp: new Date().toISOString(),
        }, novelId, executionVersion);

        const itemStartTime = Date.now();
        let succeeded = false;
        let generationResult: unknown;

        for (let attempt = 0; attempt <= maxAutoRetries; attempt++) {
          // 重试前检查取消或中断
          if (attempt > 0 && (this.cancelRequested.has(novelId) || signal.aborted)) break;

          try {
            generationResult = await runWithIdleTimeout(
              (attemptSignal, heartbeat) => generateFn(item.chapterNumber, attemptSignal, heartbeat),
              signal,
              {
                idleTimeoutMs,
                maxTotalTimeoutMs,
                timeoutLabel: `章节 ${item.chapterNumber} 生成`,
              },
            );
            succeeded = true;
            break;
          } catch (err) {
            // 如果是取消中断，不当作失败处理
            if (signal.aborted || this.cancelRequested.has(novelId)) break;

            const errMsg = err instanceof Error ? err.message : String(err);

            if (attempt < maxAutoRetries) {
              // 自动重试：通知前端并等待延迟
              item.retryCount += 1;
              item.error = errMsg;
              this.emitBatchEvent(onBatchEvent, {
                type: 'batch:item-retry',
                batchId: job.id,
                novelId: job.novelId,
                chapterNumber: item.chapterNumber,
                currentIndex: i,
                totalItems: job.items.length,
                timestamp: new Date().toISOString(),
                attempt: attempt + 1,
                maxRetries: maxAutoRetries,
                error: errMsg,
              }, novelId, executionVersion);
              log.warn('batch item retry scheduled', {
                batchId: job.id,
                novelId,
                chapterNumber: item.chapterNumber,
                attempt: attempt + 1,
                maxRetries: maxAutoRetries,
                error: errMsg,
              });
              await sleep(retryDelayMs);
              continue;
            }

            // 所有重试耗尽 → 标记失败
            item.status = 'failed';
            item.error = errMsg;
            item.completedAt = new Date().toISOString();
            item.duration = Date.now() - itemStartTime;
            log.error('batch item failed', {
              batchId: job.id,
              novelId,
              chapterNumber: item.chapterNumber,
              attempts: attempt + 1,
              durationMs: item.duration,
              error: errMsg,
            });
            this.emitBatchEvent(onBatchEvent, {
              type: 'batch:item-failed',
              batchId: job.id,
              novelId: job.novelId,
              chapterNumber: item.chapterNumber,
              currentIndex: i,
              totalItems: job.items.length,
              timestamp: new Date().toISOString(),
              error: errMsg,
            }, novelId, executionVersion);
          }
        }

        // 取消中断：当前章节标记为 cancelled，触发外层 cancel 流程
        if (signal.aborted || this.cancelRequested.has(novelId)) {
          if (item.status === 'running') {
            item.status = 'cancelled';
            item.completedAt = new Date().toISOString();
            item.duration = Date.now() - itemStartTime;
          }
          this.cancelRequested.add(novelId); // 确保外层检查到取消
          break;
        }

        // 章节生成失败（所有重试耗尽）→ 必须中止后续章节
        // 小说章节是顺序依赖的：后续章节需要前一章内容作为上下文
        // 如果继续生成，后续章节会因缺失前文而质量极差或内容不连贯
        if (item.status === 'failed') {
          this.cancelRequested.add(novelId);
          break;
        }

        if (succeeded) {
          // 后处理（保存结果、广播等）— 在超时和重试之外运行
          // 保存失败时标记为 failed 并中止批量，避免后续章节缺失前文上下文
          let postProcessSucceeded = true;
          if (postProcessFn) {
            try {
              await postProcessFn(item.chapterNumber, generationResult);
            } catch (postErr) {
              postProcessSucceeded = false;
              const postErrMsg = postErr instanceof Error ? postErr.message : String(postErr);
              console.error(
                `[batch] 章节 ${item.chapterNumber} 后处理（落库）失败，中止批量以防后续章节丢失前文上下文:`,
                postErrMsg,
              );
              log.error('batch item persistence failed', {
                batchId: job.id,
                novelId,
                chapterNumber: item.chapterNumber,
                error: postErrMsg,
              });
              item.status = 'failed';
              item.error = `后处理失败: ${postErrMsg}`;
              item.completedAt = new Date().toISOString();
              item.duration = Date.now() - itemStartTime;
              this.emitBatchEvent(onBatchEvent, {
                type: 'batch:item-failed',
                batchId: job.id,
                novelId: job.novelId,
                chapterNumber: item.chapterNumber,
                currentIndex: i,
                totalItems: job.items.length,
                timestamp: new Date().toISOString(),
                error: item.error,
              }, novelId, executionVersion);
              // 中止后续章节：落库失败意味着后续章节读不到前文
              this.cancelRequested.add(novelId);
              break;
            }
          }

          if (postProcessSucceeded) {
            item.status = 'completed';
            item.completedAt = new Date().toISOString();
            item.duration = Date.now() - itemStartTime;
            this.emitBatchEvent(onBatchEvent, {
              type: 'batch:item-complete',
              batchId: job.id,
              novelId: job.novelId,
              chapterNumber: item.chapterNumber,
              currentIndex: i,
              totalItems: job.items.length,
              timestamp: new Date().toISOString(),
            }, novelId, executionVersion);
          }
        }
      }

      // 如果 for 循环因取消而 break，处理剩余项
      if (this.cancelRequested.has(novelId) && job.status === 'running') {
        for (const remaining of job.items) {
          if (remaining.status === 'pending') remaining.status = 'cancelled';
        }
        const failedItem = job.items.find(item => item.status === 'failed');
        job.status = failedItem ? 'failed' : 'cancelled';
        job.completedAt = new Date().toISOString();
        this.emitBatchEvent(onBatchEvent, {
          type: failedItem ? 'batch:failed' : 'batch:cancelled',
          batchId: job.id,
          novelId: job.novelId,
          currentIndex: job.currentIndex,
          totalItems: job.items.length,
          timestamp: new Date().toISOString(),
          error: failedItem?.error,
        }, novelId, executionVersion);
        return;
      }

      if (job.status === 'running') {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        this.emitBatchEvent(onBatchEvent, {
          type: 'batch:complete',
          batchId: job.id,
          novelId: job.novelId,
          currentIndex: job.items.length,
          totalItems: job.items.length,
          timestamp: new Date().toISOString(),
        }, novelId, executionVersion);
      }
    } finally {
      this.cleanupJobState(novelId, executionVersion);
    }
  }
}
