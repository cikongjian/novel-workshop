import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { CoverCandidate } from '../components/dashboard/ai-cover-candidate-types';
import {
  clearPersistedCoverCandidateState,
  loadPersistedCoverCandidateState,
  savePersistedCoverCandidateState,
  type PersistedCoverCandidate,
} from '../utils/cover-candidate-history-storage';

export const MAX_COVER_HISTORY = 30;

function revokeCandidate(candidate: CoverCandidate): void {
  if (candidate.previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(candidate.previewUrl);
  }
}

function toPersistedCandidate(candidate: CoverCandidate): PersistedCoverCandidate {
  const { previewUrl: _previewUrl, ...persisted } = candidate;
  return persisted;
}

function toRuntimeCandidate(candidate: PersistedCoverCandidate): CoverCandidate {
  return {
    ...candidate,
    pinnedAt: candidate.pinnedAt ?? null,
    previewUrl: URL.createObjectURL(candidate.file),
  };
}

function sortPinnedFirst(candidates: CoverCandidate[]): CoverCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftPinned = left.pinnedAt ?? 0;
    const rightPinned = right.pinnedAt ?? 0;
    if (leftPinned && rightPinned) {
      return rightPinned - leftPinned;
    }
    if (leftPinned) return -1;
    if (rightPinned) return 1;
    return 0;
  });
}

export function useCoverCandidateHistory(novelId: Ref<string>) {
  const currentCandidates = ref<CoverCandidate[]>([]);
  const historyCandidates = ref<CoverCandidate[]>([]);
  const restoringHistory = ref(false);
  let restoreToken = 0;

  const totalCandidates = computed(() => currentCandidates.value.length + historyCandidates.value.length);

  function disposeCurrentBatch(): void {
    for (const candidate of currentCandidates.value) {
      revokeCandidate(candidate);
    }
    currentCandidates.value = [];
  }

  function disposeHistoryBatch(): void {
    for (const candidate of historyCandidates.value) {
      revokeCandidate(candidate);
    }
    historyCandidates.value = [];
  }

  function disposeLoadedState(): void {
    disposeCurrentBatch();
    disposeHistoryBatch();
  }

  function normalizeHistory(): void {
    historyCandidates.value = sortPinnedFirst(historyCandidates.value);
  }

  function trimHistory(): void {
    let overflow = totalCandidates.value - MAX_COVER_HISTORY;
    if (overflow <= 0) return;

    const nextHistory = [...historyCandidates.value];
    const removed: CoverCandidate[] = [];

    for (let index = nextHistory.length - 1; index >= 0 && overflow > 0; index -= 1) {
      if (nextHistory[index]?.pinnedAt) continue;
      const [candidate] = nextHistory.splice(index, 1);
      if (candidate) {
        removed.push(candidate);
        overflow -= 1;
      }
    }

    for (let index = nextHistory.length - 1; index >= 0 && overflow > 0; index -= 1) {
      const [candidate] = nextHistory.splice(index, 1);
      if (candidate) {
        removed.push(candidate);
        overflow -= 1;
      }
    }

    for (const candidate of removed) {
      revokeCandidate(candidate);
    }
    historyCandidates.value = nextHistory;
  }

  async function persistState(): Promise<void> {
    const targetNovelId = novelId.value;
    if (!targetNovelId) return;

    await savePersistedCoverCandidateState(
      targetNovelId,
      currentCandidates.value.map(toPersistedCandidate),
      historyCandidates.value.map(toPersistedCandidate),
    );
  }

  async function restoreState(targetNovelId: string): Promise<void> {
    const currentRestoreToken = ++restoreToken;
    restoringHistory.value = true;
    disposeLoadedState();

    if (!targetNovelId) {
      restoringHistory.value = false;
      return;
    }

    const persisted = await loadPersistedCoverCandidateState(targetNovelId);
    if (currentRestoreToken !== restoreToken) {
      return;
    }

    currentCandidates.value = persisted?.currentCandidates.map(toRuntimeCandidate) ?? [];
    historyCandidates.value = persisted?.historyCandidates.map(toRuntimeCandidate) ?? [];
    normalizeHistory();
    trimHistory();
    restoringHistory.value = false;
  }

  function replaceCurrentBatch(nextCandidates: CoverCandidate[]): void {
    historyCandidates.value = [...currentCandidates.value, ...historyCandidates.value];
    normalizeHistory();
    currentCandidates.value = nextCandidates;
    trimHistory();
    void persistState();
  }

  function clearCurrentBatch(): void {
    disposeCurrentBatch();
    void persistState();
  }

  function clearHistory(): void {
    disposeHistoryBatch();
    void persistState();
  }

  function removeCandidate(candidateId: string): void {
    const currentIndex = currentCandidates.value.findIndex(candidate => candidate.id === candidateId);
    if (currentIndex >= 0) {
      const [removed] = currentCandidates.value.splice(currentIndex, 1);
      if (removed) {
        revokeCandidate(removed);
        void persistState();
      }
      return;
    }

    const historyIndex = historyCandidates.value.findIndex(candidate => candidate.id === candidateId);
    if (historyIndex >= 0) {
      const [removed] = historyCandidates.value.splice(historyIndex, 1);
      if (removed) {
        revokeCandidate(removed);
        void persistState();
      }
    }
  }

  function togglePinned(candidateId: string): void {
    const target = currentCandidates.value.find(candidate => candidate.id === candidateId)
      ?? historyCandidates.value.find(candidate => candidate.id === candidateId);
    if (!target) return;

    target.pinnedAt = target.pinnedAt ? null : Date.now();
    normalizeHistory();
    void persistState();
  }

  async function resetAll(): Promise<void> {
    clearCurrentBatch();
    clearHistory();
    if (novelId.value) {
      await clearPersistedCoverCandidateState(novelId.value);
    }
  }

  watch(
    novelId,
    (value) => {
      void restoreState(value);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    restoreToken += 1;
    disposeLoadedState();
  });

  return {
    currentCandidates,
    historyCandidates,
    restoringHistory,
    totalCandidates,
    replaceCurrentBatch,
    clearCurrentBatch,
    clearHistory,
    removeCandidate,
    togglePinned,
    resetAll,
  };
}
