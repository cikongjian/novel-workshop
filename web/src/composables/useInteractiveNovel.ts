/**
 * 互动小说状态管理与 API 调用 composable。
 *
 * 职责：封装互动小说的所有 API 调用 + 响应式状态管理，
 * 供作者侧组件（InteractiveSetupSheet、InteractiveStatusCard 等）消费。
 * 组件不直接调 api/interactive，统一走这里。
 */
import { ref, type Ref } from 'vue';
import {
  adoptVoteResult,
  disableInteractive,
  enableInteractive,
  fetchInteractiveConfig,
  pauseInteractive,
  resumeInteractive,
  startInteractive,
  updateInteractiveConfig,
  type InteractiveConfig,
} from '../api/interactive';

export interface UseInteractiveNovelOptions {
  /** 调用失败时的统一错误回调（可选） */
  onError?: (message: string) => void;
}

export function useInteractiveNovel(novelId: Ref<string>, options?: UseInteractiveNovelOptions) {
  const config = ref<InteractiveConfig | null>(null);
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);

  function notifyError(message: string) {
    error.value = message;
    options?.onError?.(message);
  }

  /** 加载互动配置 */
  async function loadConfig(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      config.value = await fetchInteractiveConfig(novelId.value);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '加载互动配置失败');
    } finally {
      loading.value = false;
    }
  }

  /** 开启互动模式 */
  async function enable(params?: {
    chaptersPerRound?: number;
    voteDurationHours?: number;
    minVotesToAdvance?: number;
  }): Promise<boolean> {
    submitting.value = true;
    error.value = null;
    try {
      config.value = await enableInteractive(novelId.value, params);
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '开启互动模式失败');
      return false;
    } finally {
      submitting.value = false;
    }
  }

  /** 关闭互动模式 */
  async function disable(): Promise<boolean> {
    submitting.value = true;
    error.value = null;
    try {
      await disableInteractive(novelId.value);
      config.value = null;
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '关闭互动模式失败');
      return false;
    } finally {
      submitting.value = false;
    }
  }

  /** 更新参数 */
  async function updateParams(params: {
    chaptersPerRound?: number;
    voteDurationHours?: number;
    minVotesToAdvance?: number;
  }): Promise<boolean> {
    submitting.value = true;
    error.value = null;
    try {
      config.value = await updateInteractiveConfig(novelId.value, params);
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '更新配置失败');
      return false;
    } finally {
      submitting.value = false;
    }
  }

  /** 暂停 */
  async function pause(): Promise<boolean> {
    submitting.value = true;
    try {
      config.value = await pauseInteractive(novelId.value);
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '暂停失败');
      return false;
    } finally {
      submitting.value = false;
    }
  }

  /** 恢复 */
  async function resume(): Promise<boolean> {
    submitting.value = true;
    try {
      config.value = await resumeInteractive(novelId.value);
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '恢复失败');
      return false;
    } finally {
      submitting.value = false;
    }
  }

  /** 手动采纳投票 */
  async function adoptVote(votePointId: string): Promise<string | null> {
    submitting.value = true;
    try {
      const result = await adoptVoteResult(novelId.value, votePointId);
      await loadConfig(); // 刷新状态
      return result.winningDirection;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '采纳投票失败');
      return null;
    } finally {
      submitting.value = false;
    }
  }

  /** 启动第一轮互动连载（idle → generating） */
  async function start(): Promise<boolean> {
    submitting.value = true;
    error.value = null;
    try {
      config.value = await startInteractive(novelId.value);
      return true;
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '启动互动连载失败');
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return {
    config,
    loading,
    submitting,
    error,
    loadConfig,
    enable,
    disable,
    updateParams,
    pause,
    resume,
    adoptVote,
    start,
  };
}
