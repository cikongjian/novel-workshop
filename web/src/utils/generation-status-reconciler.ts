import type { GenerationStatusResponse } from '../api/chapters';
import type { AgentEvent } from '../types';

type GenerationStatusSink = {
  resetActiveGenerationState(match: { novelId: string }): void;
  handleEvent(event: AgentEvent): void;
};

export function reconcileIdleGenerationStatus(params: {
  novelId: string;
  status: GenerationStatusResponse;
  sink: GenerationStatusSink;
  lastCompletionKey: string;
  lastFailureKey: string;
  timestamp?: string;
}): { lastCompletionKey: string; lastFailureKey: string } {
  const {
    novelId,
    status,
    sink,
    timestamp = new Date().toISOString(),
  } = params;
  let { lastCompletionKey, lastFailureKey } = params;

  // HTTP 状态是移动端的权威来源。服务重启后即使没有终态元数据，
  // 也必须清掉上一轮伪 Agent 与章节号，避免页面永久显示“生成中”。
  sink.resetActiveGenerationState({ novelId });

  if (status.lastCompletedChapter) {
    const completionKey = `${novelId}:${status.lastCompletedChapter}:${status.lastCompletedAt ?? ''}`;
    if (completionKey !== lastCompletionKey) {
      sink.handleEvent({
        type: 'pipeline:complete',
        agentRole: 'writer',
        novelId,
        chapterNumber: status.lastCompletedChapter,
        data: JSON.stringify({ chapterNumber: status.lastCompletedChapter }),
        timestamp,
      });
      lastCompletionKey = completionKey;
    }
  }

  if (status.lastFailedChapter) {
    const failureKey = `${novelId}:${status.lastFailedChapter}:${status.lastFailedAt ?? ''}:${status.lastFailureMessage}`;
    if (failureKey !== lastFailureKey) {
      sink.handleEvent({
        type: 'pipeline:complete',
        agentRole: 'writing-assistant',
        novelId,
        chapterNumber: status.lastFailedChapter,
        data: JSON.stringify({
          error: status.lastFailureMessage || '章节生成失败',
        }),
        timestamp,
      });
      lastFailureKey = failureKey;
    }
  }

  return { lastCompletionKey, lastFailureKey };
}
