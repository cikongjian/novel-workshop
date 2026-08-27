import type { BookStoreManager } from './bookstore-manager.js';
import type { AuditQueueManager } from './audit-queue.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ChapterPublishScheduler');
const SCHEDULER_INTERVAL_MS = 60 * 1000;

export class ChapterPublishScheduler {
  private readonly bookStoreManager: BookStoreManager;
  private readonly auditQueueManager: AuditQueueManager;
  private readonly novelManager: NovelManager;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    bookStoreManager: BookStoreManager,
    auditQueueManager: AuditQueueManager,
    novelManager: NovelManager,
  ) {
    this.bookStoreManager = bookStoreManager;
    this.auditQueueManager = auditQueueManager;
    this.novelManager = novelManager;
  }

  start(): void {
    if (this.timer) return;
    void this.runDueSchedules();
    this.timer = setInterval(() => {
      void this.runDueSchedules();
    }, SCHEDULER_INTERVAL_MS);
    log.info('chapter publish scheduler started');
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async runDueSchedules(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const dueItems = await this.bookStoreManager.listDueScheduledPublications(now);
      for (const item of dueItems) {
        try {
          const chapter = await this.novelManager.getChapter(item.novelId, item.chapterNumber);
          const content = chapter?.content?.trim() ?? '';
          if (!content) {
            await this.bookStoreManager.cancelScheduledChapter(item.bookId, item.chapterNumber);
            log.warn('scheduled chapter skipped because source chapter is empty', item);
            continue;
          }

          const { BookStoreManager } = await import('./bookstore-manager.js');
          const contentHash = BookStoreManager.hashContent(content);
          await this.bookStoreManager.submitChapterForAudit(item.bookId, item.chapterNumber, contentHash, {
            wordCount: chapter?.wordCount,
            title: chapter?.title,
          });
          await this.auditQueueManager.enqueue(item.bookId, item.novelId, item.chapterNumber);
          log.info('scheduled chapter submitted for audit', item);
        } catch (error) {
          log.warn('scheduled chapter enqueue failed', {
            ...item,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
