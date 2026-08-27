import type { ChapterPipeline } from '../pipeline/chapter-pipeline.js';
import type { NovelMemory } from '../memory/novel-memory.js';
import type { ModelClient } from '../models/types.js';
import type { NovelAgent } from '../agents/types.js';
import type { StoryStateManager } from '../novel/story-state-manager.js';
import { BookStoreManager } from './bookstore-manager.js';
import type { AuditQueueManager } from './audit-queue.js';
import type { BookAutoUpdateConfig, BookAutoUpdateJob } from './types.js';
import { BookstoreAutoUpdateManager } from './auto-update-manager.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { saveGenerationResults } from '../services/generation-result-service.js';
import { schedulePostSaveBackgroundTasks } from '../services/generation-background-tasks.js';
import { generateAndPersistConstitution } from '../server/routes/handlers/shared/constitution-service.js';
import { buildChapterCost } from '../cost/build-chapter-cost.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('BookstoreAutoUpdate');

type BookstoreAutoUpdateServiceDeps = {
  autoUpdateManager: BookstoreAutoUpdateManager;
  bookStoreManager: BookStoreManager;
  auditQueueManager: AuditQueueManager;
  novelManager: NovelManager;
  chapterPipeline?: ChapterPipeline;
  novelMemory?: NovelMemory;
  modelClient?: ModelClient;
  agents?: Map<string, NovelAgent>;
  storyStateManager?: StoryStateManager;
};

export class BookstoreAutoUpdateService {
  private readonly autoUpdateManager: BookstoreAutoUpdateManager;
  private readonly bookStoreManager: BookStoreManager;
  private readonly auditQueueManager: AuditQueueManager;
  private readonly novelManager: NovelManager;
  private chapterPipeline?: ChapterPipeline;
  private novelMemory?: NovelMemory;
  private modelClient?: ModelClient;
  private agents?: Map<string, NovelAgent>;
  private storyStateManager?: StoryStateManager;
  private running = false;

  constructor(deps: BookstoreAutoUpdateServiceDeps) {
    this.autoUpdateManager = deps.autoUpdateManager;
    this.bookStoreManager = deps.bookStoreManager;
    this.auditQueueManager = deps.auditQueueManager;
    this.novelManager = deps.novelManager;
    this.chapterPipeline = deps.chapterPipeline;
    this.novelMemory = deps.novelMemory;
    this.modelClient = deps.modelClient;
    this.agents = deps.agents;
    this.storyStateManager = deps.storyStateManager;
  }

  updateRuntimeDeps(deps: Pick<BookstoreAutoUpdateServiceDeps, 'chapterPipeline' | 'novelMemory' | 'modelClient' | 'agents' | 'storyStateManager'>): void {
    this.chapterPipeline = deps.chapterPipeline;
    this.novelMemory = deps.novelMemory;
    this.modelClient = deps.modelClient;
    this.agents = deps.agents;
    this.storyStateManager = deps.storyStateManager;
  }

  async getBookAutoUpdate(bookId: string): Promise<BookAutoUpdateConfig | null> {
    return this.autoUpdateManager.getBookAutoUpdate(bookId);
  }

  async updateBookAutoUpdate(
    bookId: string,
    input: import('./types.js').BookAutoUpdateConfigRequest,
    operatorId: string,
  ): Promise<BookAutoUpdateConfig> {
    return this.autoUpdateManager.updateBookAutoUpdate(bookId, input, operatorId);
  }

  async runNow(bookId: string, operatorId: string): Promise<BookAutoUpdateJob> {
    const job = await this.autoUpdateManager.enqueueImmediateRun(bookId, operatorId);
    void this.runDueJobs(new Date());
    return job;
  }

  async runDueJobs(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const dueJobs = await this.autoUpdateManager.listDueJobs(now);
      for (const item of dueJobs) {
        await this.executeJob(item.bookId, item.job).catch((error) => {
          log.warn('auto update job failed', {
            bookId: item.bookId,
            novelId: item.novelId,
            jobId: item.job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    } finally {
      this.running = false;
    }
  }

  private async executeJob(bookId: string, job: BookAutoUpdateJob): Promise<void> {
    const book = await this.bookStoreManager.getBook(bookId);
    if (!book) {
      await this.autoUpdateManager.markJobFailed(bookId, job.id, '作品不存在');
      return;
    }
    if (book.publishStatus !== 'approved') {
      await this.autoUpdateManager.markJobFailed(bookId, job.id, '作品当前不在上架状态，自动更新已跳过');
      return;
    }

    const chapterNumber = await this.resolveNextChapterNumber(bookId, book.novelId);
    await this.autoUpdateManager.markJobRunning(bookId, job.id, chapterNumber);

    try {
      const generatedChapter = await this.ensureChapterReady(book.novelId, chapterNumber, book.autoUpdate);
      const chapter = await this.novelManager.getChapter(book.novelId, chapterNumber);
      const content = chapter?.content?.trim() ?? '';
      if (!content) {
        throw new Error('章节内容为空，无法提交审核队列');
      }

      const contentHash = BookStoreManager.hashContent(content);
      await this.bookStoreManager.submitChapterForAudit(bookId, chapterNumber, contentHash, {
        wordCount: chapter?.wordCount,
        title: chapter?.title,
      });
      await this.auditQueueManager.enqueue(bookId, book.novelId, chapterNumber);
      await this.autoUpdateManager.markJobSubmitted(bookId, job.id, generatedChapter);

      log.info('auto update chapter queued for audit', {
        bookId,
        novelId: book.novelId,
        chapterNumber,
        generatedChapter,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.autoUpdateManager.markJobFailed(bookId, job.id, message);
      throw error;
    }
  }

  private async resolveNextChapterNumber(bookId: string, novelId: string): Promise<number> {
    const entries = await this.bookStoreManager.getPublishedChapters(bookId);
    const lockedChapterNumber = entries
      .filter((entry) => entry.status === 'published' || entry.status === 'scheduled' || entry.status === 'pending_audit')
      .reduce((max, entry) => Math.max(max, entry.chapterNumber), 0);
    const chapters = await this.novelManager.listChapters(novelId);
    const nextExistingChapter = chapters.find((chapter) => chapter.chapterNumber > lockedChapterNumber);
    return nextExistingChapter?.chapterNumber ?? (lockedChapterNumber + 1);
  }

  private async ensureChapterReady(
    novelId: string,
    chapterNumber: number,
    config?: BookAutoUpdateConfig,
  ): Promise<boolean> {
    const chapter = await this.novelManager.getChapter(novelId, chapterNumber);
    if (chapter?.content?.trim()) {
      return false;
    }

    if (!this.chapterPipeline || !this.modelClient) {
      throw new Error('AI 生成能力未就绪，暂时无法执行自动更新');
    }

    let novel = await this.novelManager.getNovel(novelId);
    if (!novel.constitution) {
      const constitution = await generateAndPersistConstitution({
        novel,
        novelManager: this.novelManager,
        modelClient: this.modelClient,
        source: 'auto-bootstrap',
      });
      novel = {
        ...novel,
        constitution,
      };
    }

    const result = await this.chapterPipeline.fork().generateChapter({
      novelId,
      chapterNumber,
      userDirection: config?.userDirection ?? '',
      maxWordCount: config?.maxWordCount,
      startupPlatformProfile: novel.startupPlatformProfile,
      skipStrictGate: true,
    });

    await saveGenerationResults(this.novelManager, novelId, chapterNumber, result);
    schedulePostSaveBackgroundTasks(
      this.novelManager,
      this.novelMemory,
      novelId,
      chapterNumber,
      result,
      this.agents,
      this.modelClient,
      this.storyStateManager,
    );

    try {
      const costSummary = buildChapterCost(novelId, chapterNumber, result.agentOutputs, {
        operationType: 'generate',
        operationLabel: '书城自动更新',
      });
      await this.novelManager.appendChapterCost(novelId, costSummary);
    } catch (error) {
      log.warn('auto update chapter cost append failed', {
        novelId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return true;
  }
}
