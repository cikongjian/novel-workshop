import type { Router } from 'express';
import type { BatchQueue } from '../../../pipeline/batch-queue.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../ai/usage-context.js';

export function registerBatchControlRoutes(router: Router, batchQueue: BatchQueue): void {
  router.get('/batch/status', (req, res) => {
    const novelId = req.query.novelId as string | undefined;
    if (novelId) {
      const job = batchQueue.getJob(novelId);
      if (!job) {
        res.json({ status: 'idle', job: null, paused: false });
        return;
      }
      res.json({ status: job.status, job, paused: batchQueue.isPaused(novelId) });
    } else {
      const jobs = batchQueue.activeJobs;
      const userId = req.auth?.id;
      const userRunningJobs = userId ? batchQueue.getUserRunningJobs(userId) : [];
      res.json({
        status: jobs.length > 0 ? 'running' : 'idle',
        jobs,
        runningCount: batchQueue.getRunningJobsCount(),
        maxConcurrent: 5,
        // 用户级并发信息
        userRunningCount: userRunningJobs.length,
        userMaxConcurrent: 1,
        userRunningJobs: userRunningJobs.map(j => ({
          novelId: j.novelId,
          status: j.status,
          currentIndex: j.currentIndex,
          totalItems: j.items.length,
          createdAt: j.createdAt,
        })),
      });
    }
  });

  router.post('/batch/cancel', (req, res) => {
    const { novelId } = req.body;
    if (!novelId) {
      res.status(400).json({ error: '缺少 novelId 参数' });
      return;
    }
    if (!batchQueue.isRunning(novelId)) {
      res.status(400).json({ error: '该小说没有正在执行的批量任务' });
      return;
    }
    batchQueue.cancel(novelId);
    res.json({ status: 'cancelling' });
  });

  router.post('/batch/reset-force', (req, res) => {
    const { novelId } = req.body;
    if (!novelId) {
      res.status(400).json({ error: '缺少 novelId 参数' });
      return;
    }
    const job = batchQueue.forceReset(novelId);
    res.json({
      status: 'reset',
      hadJob: Boolean(job),
    });
  });

  router.post('/batch/pause', (req, res) => {
    const { novelId } = req.body;
    if (!novelId) {
      res.status(400).json({ error: '缺少 novelId 参数' });
      return;
    }
    if (!batchQueue.isRunning(novelId)) {
      res.status(400).json({ error: '该小说没有正在执行的批量任务' });
      return;
    }
    if (batchQueue.isPaused(novelId)) {
      res.status(400).json({ error: '批量任务已处于暂停状态' });
      return;
    }
    batchQueue.pause(novelId);
    res.json({ status: 'pausing' });
  });

  router.post('/batch/resume', (req, res) => {
    const { novelId } = req.body;
    if (!novelId) {
      res.status(400).json({ error: '缺少 novelId 参数' });
      return;
    }
    if (!batchQueue.isPaused(novelId)) {
      res.status(400).json({ error: '批量任务未处于暂停状态' });
      return;
    }
    batchQueue.resume(novelId);
    res.json({ status: 'resuming' });
  });

  router.post('/batch/retry', (req, res) => {
    const { novelId } = req.body;
    if (!novelId) {
      res.status(400).json({ error: '缺少 novelId 参数' });
      return;
    }
    const job = batchQueue.getJob(novelId);
    if (!job) {
      res.status(400).json({ error: '没有找到该小说的批量任务' });
      return;
    }
    if (batchQueue.isRunning(novelId)) {
      res.status(400).json({ error: '批量任务正在执行中，无法重试' });
      return;
    }
    const failedCount = job.items.filter(i => i.status === 'failed').length;
    if (failedCount === 0) {
      res.status(400).json({ error: '没有失败的项目需要重试' });
      return;
    }
    const aiUsageContext = getAiUsageContext();
    res.json({ status: 'retrying', failedCount });
    void runWithAiUsageContextAsync(
      aiUsageContext ?? {
        scope: 'http',
        operationKey: 'generate.batch',
        operationLabel: 'Batch generate',
        operationRegistered: true,
        novelId,
      },
      async () => batchQueue.retryFailed(novelId),
    ).catch(err => {
      console.error('[批量生成] 重试失败:', err);
    });
  });
}
