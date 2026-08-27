import { describe, expect, it, vi } from 'vitest';
import type { GenerationStatusResponse } from '../api/chapters';
import { reconcileIdleGenerationStatus } from './generation-status-reconciler';

function idleStatus(overrides: Partial<GenerationStatusResponse> = {}): GenerationStatusResponse {
  return {
    isGenerating: false,
    chapterNumber: null,
    activeAgents: [],
    agentStatuses: {},
    writingAssistantOutput: '',
    lastCompletedChapter: null,
    lastCompletedAt: null,
    lastFailedChapter: null,
    lastFailedAt: null,
    lastFailureMessage: '',
    metadataUpdatedAt: null,
    ...overrides,
  };
}

describe('mobile generation status reconciliation', () => {
  it('clears stale local state when the server is idle without terminal metadata', () => {
    const resetActiveGenerationState = vi.fn();
    const handleEvent = vi.fn();

    const result = reconcileIdleGenerationStatus({
      novelId: 'novel-1',
      status: idleStatus(),
      sink: { resetActiveGenerationState, handleEvent },
      lastCompletionKey: '',
      lastFailureKey: '',
      timestamp: '2026-07-15T00:00:00.000Z',
    });

    expect(resetActiveGenerationState).toHaveBeenCalledWith({ novelId: 'novel-1' });
    expect(handleEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ lastCompletionKey: '', lastFailureKey: '' });
  });

  it('clears active state before publishing a deduplicated completion event', () => {
    const resetActiveGenerationState = vi.fn();
    const handleEvent = vi.fn();
    const status = idleStatus({ lastCompletedChapter: 15, lastCompletedAt: 123 });

    const first = reconcileIdleGenerationStatus({
      novelId: 'novel-1',
      status,
      sink: { resetActiveGenerationState, handleEvent },
      lastCompletionKey: '',
      lastFailureKey: '',
      timestamp: '2026-07-15T00:00:00.000Z',
    });
    reconcileIdleGenerationStatus({
      novelId: 'novel-1',
      status,
      sink: { resetActiveGenerationState, handleEvent },
      ...first,
      timestamp: '2026-07-15T00:00:05.000Z',
    });

    expect(resetActiveGenerationState).toHaveBeenCalledTimes(2);
    expect(handleEvent).toHaveBeenCalledTimes(1);
    expect(handleEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'pipeline:complete',
      novelId: 'novel-1',
      chapterNumber: 15,
    }));
  });
});
