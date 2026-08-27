import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { BookStoreManager } from './bookstore-manager.js';
import type { ContentAuditService } from './content-audit-service.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { createLogger } from '../utils/logger.js';

const AUDIT_QUEUE_FILE = 'audit-queue.json';

/** 每次最多审核的章节数（取前 N 章） */
const MAX_AUDIT_CHAPTERS = 3;

/** 单本书审核的最大允许时间（毫秒）。超时后降级为人工审核。 */
const AUDIT_TIMEOUT_MS = 120_000; // 2 分钟

/** done/failed 任务在队列文件中的最大保留条数，超出后自动清理旧记录 */
const MAX_COMPLETED_JOBS = 200;

export type QueueJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface AuditQueueJob {
  id: string;
  bookId: string;
  novelId: string;
  /**
   * 章节级审核时提供章节号。
   * 不提供时为书籍初审（审核前 MAX_AUDIT_CHAPTERS 章）。
   */
  chapterNumber?: number;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: QueueJobStatus;
  /** 审核失败时的错误信息 */
  errorMessage?: string;
}

/**
 * 审核队列管理器
 *
 * 将待审核书城作品排队，逐本异步处理，每次只审核前 MAX_AUDIT_CHAPTERS 章。
 * 队列状态持久化到 audit-queue.json，进程重启后可恢复 queued 任务。
 */
export class AuditQueueManager {
  private readonly dataDir: string;
  private readonly bookStoreManager: BookStoreManager;
  private readonly auditService: ContentAuditService;
  private readonly novelManager: NovelManager;
  private readonly log = createLogger('AuditQueue');
  private isProcessing = false;

  constructor(
    dataDir: string,
    bookStoreManager: BookStoreManager,
    auditService: ContentAuditService,
    novelManager: NovelManager
  ) {
    this.dataDir = dataDir;
    this.bookStoreManager = bookStoreManager;
    this.auditService = auditService;
    this.novelManager = novelManager;
  }

  private getQueueFilePath(): string {
    return path.join(this.dataDir, AUDIT_QUEUE_FILE);
  }

  private async readQueue(): Promise<AuditQueueJob[]> {
    try {
      await fs.access(this.getQueueFilePath());
    } catch {
      await fs.writeFile(
        this.getQueueFilePath(),
        JSON.stringify({ jobs: [] }, null, 2),
        'utf-8'
      );
    }
    const content = await fs.readFile(this.getQueueFilePath(), 'utf-8');
    let data: { jobs: any[] };
    try {
      data = JSON.parse(content) as { jobs: any[] };
    } catch (err) {
      this.log.error('审核队列文件损坏，已重置为空队列', { error: (err as Error).message });
      data = { jobs: [] };
      await fs.writeFile(this.getQueueFilePath(), JSON.stringify(data, null, 2), 'utf-8');
    }
    if (!Array.isArray(data.jobs)) {
      this.log.error('审核队列文件格式异常（jobs 不是数组），已重置');
      data = { jobs: [] };
      await fs.writeFile(this.getQueueFilePath(), JSON.stringify(data, null, 2), 'utf-8');
    }
    return data.jobs.map((job) => ({
      ...job,
      queuedAt: new Date(job.queuedAt),
      startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
      completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
    }));
  }

  private async writeQueue(jobs: AuditQueueJob[]): Promise<void> {
    await fs.writeFile(
      this.getQueueFilePath(),
      JSON.stringify({ jobs }, null, 2),
      'utf-8'
    );
  }

  /**
   * 在文件中原子性地更新单个 job 的状态，避免旧快照覆盖期间新入队的任务。
   */
  private async updateJobInFile(
    jobId: string,
    updater: (job: AuditQueueJob) => void
  ): Promise<void> {
    const jobs = await this.readQueue();
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      updater(job);
    }
    // 清理过旧的 done/failed，防止文件无限增长
    const completed = jobs.filter((j) => j.status === 'done' || j.status === 'failed');
    if (completed.length > MAX_COMPLETED_JOBS) {
      const toRemove = new Set(
        completed
          .sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime())
          .slice(0, completed.length - MAX_COMPLETED_JOBS)
          .map((j) => j.id)
      );
      await this.writeQueue(jobs.filter((j) => !toRemove.has(j.id)));
    } else {
      await this.writeQueue(jobs);
    }
  }

  /**
   * 将书城作品（初审）或单个章节加入审核队列
   * @param chapterNumber 提供时为章节级审核，不提供时为书籍初审（前3章）
   * @returns 任务 ID 和当前队列位置（1 为队首，0 为正在处理）
   */
  async enqueue(
    bookId: string,
    novelId: string,
    chapterNumber?: number
  ): Promise<{ jobId: string; position: number }> {
    const jobs = await this.readQueue();

    // 避免重复入队（同一 bookId + chapterNumber 组合）
    const existing = jobs.find(
      (j) =>
        j.bookId === bookId &&
        j.chapterNumber === chapterNumber &&
        (j.status === 'queued' || j.status === 'processing')
    );
    if (existing) {
      if (existing.status === 'processing') {
        return { jobId: existing.id, position: 0 };
      }
      const queuedJobs = jobs.filter((j) => j.status === 'queued');
      const position = queuedJobs.indexOf(existing) + 1;
      return { jobId: existing.id, position };
    }

    const job: AuditQueueJob = {
      id: randomUUID(),
      bookId,
      novelId,
      chapterNumber,
      queuedAt: new Date(),
      status: 'queued',
    };

    jobs.push(job);
    await this.writeQueue(jobs);

    const position = jobs.filter((j) => j.status === 'queued').length;
    const label = chapterNumber != null ? `第 ${chapterNumber} 章` : '书籍初审';
    this.log.info(`${label}已入审核队列`, { bookId, position });

    setImmediate(() => void this.processNext());

    return { jobId: job.id, position };
  }

  /**
   * 批量入队多个章节审核任务（一次读写 queue 文件）。
   * 跳过已在 queued/processing 状态的重复项。
   * 返回与输入顺序一一对应的结果数组。
   */
  async enqueueBatch(
    items: Array<{ bookId: string; novelId: string; chapterNumber: number }>
  ): Promise<Array<{ jobId: string; position: number }>> {
    if (items.length === 0) return [];
    const jobs = await this.readQueue();
    const results: Array<{ jobId: string; position: number }> = [];

    for (const item of items) {
      const existing = jobs.find(
        (j) =>
          j.bookId === item.bookId &&
          j.chapterNumber === item.chapterNumber &&
          (j.status === 'queued' || j.status === 'processing')
      );
      if (existing) {
        if (existing.status === 'processing') {
          results.push({ jobId: existing.id, position: 0 });
        } else {
          const queuedJobs = jobs.filter((j) => j.status === 'queued');
          const position = queuedJobs.indexOf(existing) + 1;
          results.push({ jobId: existing.id, position });
        }
        continue;
      }

      const job: AuditQueueJob = {
        id: randomUUID(),
        bookId: item.bookId,
        novelId: item.novelId,
        chapterNumber: item.chapterNumber,
        queuedAt: new Date(),
        status: 'queued',
      };
      jobs.push(job);
      results.push({ jobId: job.id, position: jobs.filter((j) => j.status === 'queued').length });
    }

    await this.writeQueue(jobs);
    this.log.info(`批量入队 ${items.length} 个章节审核任务`, { bookId: items[0].bookId });
    setImmediate(() => void this.processNext());

    return results;
  }

  /**
   * 处理队列中的下一个待审核作品（单次）
   */
  async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const jobs = await this.readQueue();
    const nextJob = jobs.find((j) => j.status === 'queued');
    if (!nextJob) return;

    const isChapterJob = nextJob.chapterNumber != null;
    const jobLabel = isChapterJob
      ? `第 ${nextJob.chapterNumber} 章`
      : '书籍初审';

    this.isProcessing = true;
    this.log.info(`开始审核 ${jobLabel}`, { bookId: nextJob.bookId, novelId: nextJob.novelId });

    // 标记为处理中（只更新该任务，不覆盖整个文件）
    await this.updateJobInFile(nextJob.id, (j) => {
      j.status = 'processing';
      j.startedAt = new Date();
    });

    let auditStatus: 'done' | 'failed' = 'done';
    let errorMsg: string | undefined;

    try {
      // 构建待审核章节列表
      const chaptersToAudit: Array<{ id: string; content: string }> = [];

      if (isChapterJob) {
        // 章节级审核：只审核该章
        const chapter = await this.novelManager.getChapter(nextJob.novelId, nextJob.chapterNumber!);
        if (!chapter?.content) {
          // 章节不存在或内容为空，无法审核，回退为 hidden
          await this.bookStoreManager.revertChapterToHidden(nextJob.bookId, nextJob.chapterNumber!);
          this.log.warn(`章节内容为空，跳过审核并回退`, { bookId: nextJob.bookId, chapterNumber: nextJob.chapterNumber });
          return;
        }
        chaptersToAudit.push({
          id: nextJob.chapterNumber!.toString(),
          content: chapter.content,
        });
      } else {
        // 书籍初审：审核前 MAX_AUDIT_CHAPTERS 章
        const chapterSummaries = await this.novelManager.listChapters(nextJob.novelId);
        for (const summary of chapterSummaries.slice(0, MAX_AUDIT_CHAPTERS)) {
          const chapter = await this.novelManager.getChapter(nextJob.novelId, summary.chapterNumber);
          chaptersToAudit.push({
            id: summary.chapterNumber.toString(),
            content: chapter?.content ?? '',
          });
        }
      }

      // 限时审核，超时后抛出错误，避免队列死锁
      const auditPromise = this.auditService.auditNovel(nextJob.novelId, chaptersToAudit);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`审核超时（${AUDIT_TIMEOUT_MS / 1000}s）`)),
          AUDIT_TIMEOUT_MS
        )
      );
      const auditResult = await Promise.race([auditPromise, timeoutPromise]);

      const overallScore =
        auditResult.audits.length > 0
          ? Math.max(...auditResult.audits.map((a) => a.result.overallScore))
          : 0;

      if (isChapterJob) {
        // 章节级：审核通过后二次校验哈希，防止审核期间内容被替换导致违规内容上线
        if (auditResult.overallStatus === 'pass') {
          const { BookStoreManager } = await import('./bookstore-manager.js');
          const latestChapter = await this.novelManager.getChapter(nextJob.novelId, nextJob.chapterNumber!);
          const latestHash = BookStoreManager.hashContent(latestChapter?.content ?? '');
          const publishedChapters = await this.bookStoreManager.getPublishedChapters(nextJob.bookId);
          const record = publishedChapters.find(c => c.chapterNumber === nextJob.chapterNumber);

          if (record && record.contentHash === latestHash) {
            // 哈希一致，内容未被修改，正式发布
            await this.bookStoreManager.markChapterPublished(nextJob.bookId, nextJob.chapterNumber!);
            this.log.info(`章节审核通过 ${jobLabel}`, { bookId: nextJob.bookId });
          } else {
            // 哈希不一致：审核期间内容已变，结果作废，回退为 hidden 让用户重新发布
            await this.bookStoreManager.revertChapterToHidden(nextJob.bookId, nextJob.chapterNumber!);
            this.log.warn(
              `章节审核通过但内容已变更，作废本次结果 ${jobLabel}`,
              { bookId: nextJob.bookId }
            );
          }
        } else {
          await this.bookStoreManager.revertChapterToHidden(
            nextJob.bookId,
            nextJob.chapterNumber!
          );
          this.log.info(
            `章节审核未通过 ${jobLabel}`,
            { bookId: nextJob.bookId, result: auditResult.overallStatus }
          );
        }
      } else {
        // 书籍初审：更新书城整体审核状态
        await this.bookStoreManager.updateAuditStatus(nextJob.bookId, auditResult.overallStatus, {
          violations: auditResult.audits.flatMap((a) => a.result.violations),
          overallScore,
          suggestion:
            auditResult.overallStatus === 'pass'
              ? 'pass'
              : auditResult.overallStatus === 'reject'
                ? 'block'
                : 'review',
          auditedChapters: chaptersToAudit.length,
        });
        this.log.info(
          `书籍初审完成`,
          { bookId: nextJob.bookId, result: auditResult.overallStatus }
        );
      }
    } catch (err) {
      auditStatus = 'failed';
      errorMsg = err instanceof Error ? err.message : String(err);
      this.log.error(`审核失败 ${jobLabel}`, { bookId: nextJob.bookId, error: errorMsg });

      // 审核异常时降级处理
      try {
        if (isChapterJob) {
          // 章节审核异常：回退为 hidden，让作者重新提交
          try {
            await this.bookStoreManager.revertChapterToHidden(nextJob.bookId, nextJob.chapterNumber!);
          } catch { /* 忽略 */ }
        } else {
          await this.bookStoreManager.updateAuditStatus(nextJob.bookId, 'manual_review');
        }
      } catch {
        // 二次失败忽略
      }
    } finally {
      // 重新读取文件再写入，避免覆盖期间新入队的任务
      await this.updateJobInFile(nextJob.id, (j) => {
        j.status = auditStatus;
        j.completedAt = new Date();
        if (errorMsg) j.errorMessage = errorMsg;
      });

      this.isProcessing = false;

      // 继续处理队列中的下一个
      const hasMore = (await this.readQueue()).some((j) => j.status === 'queued');
      if (hasMore) {
        setImmediate(() => void this.processNext());
      }
    }
  }

  /**
   * 服务启动时恢复未完成的队列
   * 将 processing 状态（上次崩溃残留）重置为 queued，重新排队
   */
  async recoverOnStartup(): Promise<void> {
    const jobs = await this.readQueue();
    let changed = false;

    for (const job of jobs) {
      if (job.status === 'processing') {
        job.status = 'queued';
        job.startedAt = undefined;
        changed = true;
        this.log.info(`恢复未完成的审核任务`, { bookId: job.bookId });
      }
    }

    if (changed) {
      await this.writeQueue(jobs);
    }

    // 如果有待处理任务，启动处理
    const hasQueued = jobs.some((j) => j.status === 'queued');
    if (hasQueued) {
      setImmediate(() => void this.processNext());
    }
  }
}
