import { describe, expect, it } from 'vitest';
import { BatchQueue } from './batch-queue.js';

describe('BatchQueue terminal diagnostics', () => {
  it('retains a completed job for status queries without counting it as active', async () => {
    const queue = new BatchQueue();
    const job = queue.createJob('novel-complete', 2, 2, false, 'user-1');

    await queue.execute({
      job,
      generateFn: async () => ({ content: 'ok' }),
      onBatchEvent: () => {},
      options: { maxAutoRetries: 0 },
    });

    expect(queue.getJob('novel-complete')?.status).toBe('completed');
    expect(queue.activeJobs).toEqual([]);
    expect(queue.canUserStartJob('user-1').allowed).toBe(true);
  });

  it('retains failed item details and allows retry after terminal cleanup', async () => {
    const queue = new BatchQueue();
    const job = queue.createJob('novel-failed', 3, 3, false, 'user-1');
    let shouldFail = true;

    await queue.execute({
      job,
      generateFn: async () => {
        if (shouldFail) throw new Error('upstream request failed');
        return { content: 'ok' };
      },
      onBatchEvent: () => {},
      options: { maxAutoRetries: 0 },
    });

    expect(queue.getJob('novel-failed')).toEqual(expect.objectContaining({ status: 'failed' }));
    expect(queue.getJob('novel-failed')?.items[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'upstream request failed',
    }));

    shouldFail = false;
    await queue.retryFailed('novel-failed');

    expect(queue.getJob('novel-failed')?.status).toBe('completed');
    expect(queue.getJob('novel-failed')?.items[0]?.status).toBe('completed');
  });
});
