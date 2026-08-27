import type { Router } from 'express';
import type { AgentEvent } from '../../../agents/types.js';
import { createLogger } from '../../../utils/logger.js';
import { BatchQueue } from '../../../pipeline/batch-queue.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

export const batchLogger = createLogger('batch');

export function createBatchQueue(router: Router): BatchQueue {
  const batchQueue = new BatchQueue();
  (router as any).__batchQueue = batchQueue;
  return batchQueue;
}

export function emitBatchChapterFailure(
  broadcast: (event: AgentEvent) => void,
  params: {
    novelId: string;
    chapterNumber: number;
    error: unknown;
  },
): void {
  const { novelId, chapterNumber, error } = params;
  const baseMessage = safeErrorMessage(error, String(error));
  const message = /abort|aborted|超时|timeout/i.test(baseMessage)
    ? `批量任务已中断：${baseMessage}`
    : baseMessage;
  const timestamp = new Date().toISOString();
  broadcast({
    type: 'agent:error',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: message,
    timestamp,
  });
  broadcast({
    type: 'pipeline:complete',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: JSON.stringify({ error: message, mode: 'batch' }),
    timestamp,
  });
}
