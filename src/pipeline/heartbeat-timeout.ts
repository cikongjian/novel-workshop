/**
 * 基于心跳的智能超时工具
 *
 * 替代旧的"固定总时长超时"（runWithAttemptTimeout）。
 *
 * 核心思路：
 * - 章节生成管线涉及 10+ 个 agent 调用（outline/character/world-builder/writer/editor/多个 strict gate/reader/...）
 * - 每个阶段都会触发心跳（traceStage）
 * - 只要持续有心跳（agent 在干活），就继续等待
 * - 只有真正卡死（长时间无心跳）才触发空闲超时
 * - 兜底：绝对总时长上限，防止异常情况无限等待
 *
 * 三层超时保护：
 * 1. idleTimeoutMs（默认 5 分钟）：距离上次心跳超过此值 → 判定卡死，abort
 * 2. maxTotalTimeoutMs（默认 60 分钟）：绝对总时长兜底
 * 3. parentSignal：外部取消（用户手动取消）立即生效
 */

export interface IdleTimeoutOptions {
  /** 空闲超时（毫秒）：距离上次心跳超过此值则判定卡死。默认 5 分钟 */
  idleTimeoutMs?: number;
  /** 绝对总时长上限（毫秒）：兜底保护。默认 60 分钟 */
  maxTotalTimeoutMs?: number;
  /** 心跳触发时的回调（可选，用于日志/监控） */
  onHeartbeat?: (info: { stage?: string; elapsedMs: number }) => void;
  /** 超时类型标记（用于错误消息） */
  timeoutLabel?: string;
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
const DEFAULT_MAX_TOTAL_TIMEOUT_MS = 60 * 60 * 1000; // 60 分钟

/**
 * 运行带心跳检测的任务。任务执行期间可通过 `heartbeat()` 报告进度，
 * 只要心跳持续，就不会因总时长触发超时；仅在长时间无心跳或超过绝对上限时中止。
 *
 * @param task 接收 (signal, heartbeat) 的任务函数
 * @param parentSignal 外部中断信号（批量取消时传入）
 * @param options 超时配置
 */
export async function runWithIdleTimeout<T>(
  task: (signal: AbortSignal, heartbeat: (stage?: string) => void) => Promise<T>,
  parentSignal: AbortSignal,
  options: IdleTimeoutOptions = {},
): Promise<T> {
  const {
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxTotalTimeoutMs = DEFAULT_MAX_TOTAL_TIMEOUT_MS,
    onHeartbeat,
    timeoutLabel = '章节生成',
  } = options;

  // 如果父信号已中断，直接走快速路径
  if (parentSignal.aborted) {
    return task(parentSignal, () => {});
  }

  const controller = new AbortController();
  const startTime = Date.now();
  let lastHeartbeatAt = startTime;
  let lastHeartbeatStage: string | undefined;
  let timedOut: 'idle' | 'total' | null = null;

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let totalTimer: ReturnType<typeof setTimeout> | undefined;
  let checkTimer: ReturnType<typeof setInterval> | undefined;

  // 心跳函数：任务调用此函数报告"我还活着"
  const heartbeat = (stage?: string): void => {
    if (timedOut) return;
    lastHeartbeatAt = Date.now();
    if (stage) lastHeartbeatStage = stage;
    // 重置空闲定时器
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!timedOut && !controller.signal.aborted) {
        timedOut = 'idle';
        const idleSec = Math.round((Date.now() - lastHeartbeatAt) / 1000);
        const stageInfo = lastHeartbeatStage ? `（最后阶段: ${lastHeartbeatStage}）` : '';
        controller.abort(new Error(
          `${timeoutLabel}空闲超时：已 ${idleSec} 秒无心跳${stageInfo}，判定为卡死`,
        ));
      }
    }, idleTimeoutMs);

    onHeartbeat?.({ stage, elapsedMs: lastHeartbeatAt - startTime });
  };

  // 父信号中断 → 同步中断子信号
  const abortFromParent = (): void => {
    if (!timedOut) {
      controller.abort(parentSignal.reason);
    }
  };
  parentSignal.addEventListener('abort', abortFromParent, { once: true });

  // 兜底总时长定时器
  totalTimer = setTimeout(() => {
    if (!timedOut && !controller.signal.aborted) {
      timedOut = 'total';
      const totalMin = Math.round(maxTotalTimeoutMs / 60000);
      controller.abort(new Error(
        `${timeoutLabel}总时长超时：已运行超过 ${totalMin} 分钟（兜底保护）`,
      ));
    }
  }, maxTotalTimeoutMs);

  // 定期检查（兜底，防止定时器因事件循环延迟失效）
  checkTimer = setInterval(() => {
    if (timedOut || controller.signal.aborted) return;
    const now = Date.now();
    const idleMs = now - lastHeartbeatAt;
    if (idleMs > idleTimeoutMs) {
      timedOut = 'idle';
      const idleSec = Math.round(idleMs / 1000);
      const stageInfo = lastHeartbeatStage ? `（最后阶段: ${lastHeartbeatStage}）` : '';
      controller.abort(new Error(
        `${timeoutLabel}空闲超时：已 ${idleSec} 秒无心跳${stageInfo}，判定为卡死`,
      ));
    }
  }, 30_000); // 每 30 秒检查一次

  try {
    // 启动时触发一次心跳，开始空闲计时
    heartbeat('start');
    return await task(controller.signal, heartbeat);
  } catch (err) {
    if (timedOut) {
      // 超时导致的 abort，抛出超时错误（更友好）
      const reason = controller.signal.reason;
      throw new Error(
        reason instanceof Error ? reason.message : `${timeoutLabel}超时`,
      );
    }
    // 外部取消导致的 abort
    if (parentSignal.aborted) {
      throw err;
    }
    throw err;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    if (totalTimer) clearTimeout(totalTimer);
    if (checkTimer) clearInterval(checkTimer);
    parentSignal.removeEventListener('abort', abortFromParent);
  }
}
