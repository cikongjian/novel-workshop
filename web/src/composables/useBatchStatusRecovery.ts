import { computed, onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';
import { useAgentsStore } from '../stores/agents';

const BATCH_STATUS_POLL_INTERVAL_MS = 15_000;

export function useBatchStatusRecovery(params: {
  novelId: Ref<string>;
  isConnected: Ref<boolean>;
}) {
  const { novelId, isConnected } = params;
  const agentsStore = useAgentsStore();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let polling = false;

  const hasRecoverableBatchState = computed(() => {
    if (!novelId.value) return false;

    const batchBelongsHere = agentsStore.batchNovelId === novelId.value;
    const finalizeBelongsHere = agentsStore.batchFinalizeNovelId === novelId.value;

    return (
      (batchBelongsHere && (agentsStore.batchRunning || agentsStore.batchStatus !== null || agentsStore.batchItems.length > 0))
      || (finalizeBelongsHere && agentsStore.batchFinalizeStatus !== 'idle')
    );
  });

  async function syncBatchStatus() {
    if (polling || !novelId.value) return;
    polling = true;
    try {
      await agentsStore.restoreBatch(novelId.value);
    } finally {
      polling = false;
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      void syncBatchStatus();
    }, BATCH_STATUS_POLL_INTERVAL_MS);
  }

  watch(
    () => [isConnected.value, novelId.value, hasRecoverableBatchState.value] as const,
    ([connected, currentNovelId, shouldPoll]) => {
      if (!connected || !currentNovelId || !shouldPoll) {
        stopPolling();
        return;
      }
      startPolling();
      void syncBatchStatus();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stopPolling();
  });

  return {
    syncBatchStatus,
  };
}
