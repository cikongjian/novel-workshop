import { computed, onMounted, onUnmounted, ref, unref, watch } from 'vue';
import type { Ref } from 'vue';
import { fetchNovelGenerationStatus } from '../api/chapters';
import { useAgentsStore } from '../stores/agents';
import type { AgentRole } from '../types';
import { reconcileIdleGenerationStatus } from '../utils/generation-status-reconciler';

/** 单个 Agent 在本次管线中的运行状态（对齐后端 agentStatuses 值） */
export type PolledAgentStatus = 'active' | 'done' | 'error';

/**
 * 通过 HTTP 轮询获取小说生成进度，替代移动端无法正常使用的 WebSocket。
 * 每 5 秒轮询一次（生成中）或 15 秒一次（空闲）。
 *
 * 用法：在移动端视图中替代 useNovelRealtimeStatus / useWebSocket
 *
 * @param novelId - 当前小说 ID 的响应式引用
 */
export function useNovelGenerationStatusPolling(
  novelId: Ref<string>,
  options?: { enabled?: Ref<boolean> | boolean },
) {
  const agentsStore = useAgentsStore();
  const enabled = computed(() => options?.enabled == null ? true : unref(options.enabled));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let lastActiveCount = 0;
  let lastCompletionKey = '';
  let lastFailureKey = '';

  /** 最近一次轮询返回的原始状态（含真实 agentStatuses），供消费方按需取用 */
  const latestStatus = ref<Awaited<ReturnType<typeof fetchNovelGenerationStatus>> | null>(null);

  async function poll(): Promise<void> {
    if (destroyed || !enabled.value || !novelId.value) return;

    try {
      const status = await fetchNovelGenerationStatus(novelId.value);
      latestStatus.value = status;

      if (status.isGenerating) {
        // 通过合成事件模拟 WebSocket 推送，驱动 agentsStore 状态机
        const activeRoles = status.activeAgents.length > 0
          ? status.activeAgents
          : ['writing-assistant'];

        agentsStore.resetActiveGenerationState({ novelId: novelId.value });

        for (const role of activeRoles) {
          agentsStore.handleEvent({
            type: 'agent:start',
            agentRole: role as AgentRole,
            novelId: novelId.value,
            chapterNumber: status.chapterNumber ?? undefined,
            data: '',
            timestamp: new Date().toISOString(),
          });
        }

        if (status.writingAssistantOutput) {
          agentsStore.handleEvent({
            type: 'agent:chunk',
            agentRole: 'writing-assistant' as AgentRole,
            novelId: novelId.value,
            chapterNumber: status.chapterNumber ?? undefined,
            data: status.writingAssistantOutput,
            timestamp: new Date().toISOString(),
          });
        }

        lastActiveCount = activeRoles.length;
      } else {
        const reconciled = reconcileIdleGenerationStatus({
          novelId: novelId.value,
          status,
          sink: agentsStore,
          lastCompletionKey,
          lastFailureKey,
        });
        lastCompletionKey = reconciled.lastCompletionKey;
        lastFailureKey = reconciled.lastFailureKey;

        if (lastActiveCount > 0) {
          lastActiveCount = 0;
        }
      }
    } catch {
      // 网络错误静默忽略，下一轮自动重试
    }

    if (enabled.value) {
      const interval = agentsStore.isGeneratingNovel(novelId.value) ? 5000 : 15000;
      scheduleNext(interval);
    }
  }

  function scheduleNext(ms: number): void {
    if (destroyed || !enabled.value) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    timer = setTimeout(poll, ms);
  }

  function start(): void {
    if (!enabled.value) return;
    destroyed = false;
    poll();
  }

  function stop(resetState = true): void {
    destroyed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (resetState && novelId.value) {
      agentsStore.resetActiveGenerationState({ novelId: novelId.value });
    }
  }

  watch(novelId, (newId, oldId) => {
    if (oldId) {
      agentsStore.resetActiveGenerationState({ novelId: oldId });
      lastActiveCount = 0;
      lastCompletionKey = '';
      lastFailureKey = '';
    }
    if (newId) {
      // 切换小说后立即轮询一次
      stop();
      start();
    }
  });

  watch(enabled, (value) => {
    if (value) {
      stop(false);
      start();
    } else {
      stop(false);
    }
  });

  onMounted(start);
  onUnmounted(stop);

  return {
    /** 手动触发一次轮询（用于生成请求后立即刷新） */
    poll,
    /** 最近一次轮询返回的原始状态（含真实 agentStatuses），供消费方按需取用 */
    latestStatus,
  };
}
