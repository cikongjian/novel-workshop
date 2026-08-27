import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BookStore, BookAutoUpdateConfig, BookAutoUpdateConfigRequest, BookAutoUpdateJob } from './types.js';

const BOOKSTORE_DATA_FILE = 'bookstore.json';
const MAX_AUTO_UPDATE_HISTORY = 30;

type StoredBook = BookStore & { autoUpdate?: BookAutoUpdateConfig };

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeAutoUpdateJob(raw: any): BookAutoUpdateJob | null {
  const scheduledAt = toDate(raw?.scheduledAt);
  const createdAt = toDate(raw?.createdAt);
  if (!scheduledAt || !createdAt || typeof raw?.id !== 'string') {
    return null;
  }

  return {
    id: raw.id,
    chapterNumber: Number(raw.chapterNumber) || 1,
    scheduledAt,
    status: raw.status === 'running' || raw.status === 'submitted' || raw.status === 'failed'
      ? raw.status
      : 'pending',
    generatedChapter: raw.generatedChapter === true,
    createdAt,
    startedAt: toDate(raw.startedAt),
    finishedAt: toDate(raw.finishedAt),
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

function normalizeAutoUpdateConfig(raw: any): BookAutoUpdateConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const updatedAt = toDate(raw.updatedAt);
  if (!updatedAt || typeof raw.updatedBy !== 'string') return undefined;

  return {
    enabled: raw.enabled === true,
    timeOfDay: typeof raw.timeOfDay === 'string' ? raw.timeOfDay : '08:00',
    timezone: typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone : 'Asia/Shanghai',
    maxWordCount: Number.isInteger(raw.maxWordCount) ? Number(raw.maxWordCount) : undefined,
    userDirection: typeof raw.userDirection === 'string' ? raw.userDirection : '',
    updatedAt,
    updatedBy: raw.updatedBy,
    lastPlannedAt: toDate(raw.lastPlannedAt),
    lastRunAt: toDate(raw.lastRunAt),
    lastSuccessAt: toDate(raw.lastSuccessAt),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
    queue: Array.isArray(raw.queue)
      ? raw.queue
        .map(normalizeAutoUpdateJob)
        .filter((item: BookAutoUpdateJob | null): item is BookAutoUpdateJob => item !== null)
      : [],
    history: Array.isArray(raw.history)
      ? raw.history
        .map(normalizeAutoUpdateJob)
        .filter((item: BookAutoUpdateJob | null): item is BookAutoUpdateJob => item !== null)
        .slice(-MAX_AUTO_UPDATE_HISTORY)
      : [],
  };
}

function nextOccurrence(timeOfDay: string, timezone: string, now = new Date()): Date {
  const [hourPart, minutePart] = timeOfDay.split(':');
  const hour = Number.parseInt(hourPart ?? '', 10);
  const minute = Number.parseInt(minutePart ?? '', 10);
  const zonedNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const timezoneOffsetMs = now.getTime() - zonedNow.getTime();
  const next = new Date(zonedNow);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= zonedNow.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return new Date(next.getTime() + timezoneOffsetMs);
}

export class BookstoreAutoUpdateManager {
  constructor(private readonly dataDir: string) {}

  private sortQueue(queue: BookAutoUpdateJob[]): BookAutoUpdateJob[] {
    return [...queue].sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
  }

  private finalizeConfig(config: BookAutoUpdateConfig): BookAutoUpdateConfig {
    const queue = this.sortQueue(config.queue);
    const nextPendingJob = queue.find((job) => job.status === 'pending');
    return {
      ...config,
      queue,
      lastPlannedAt: nextPendingJob?.scheduledAt,
    };
  }

  private retainQueueForConfigUpdate(
    config: BookAutoUpdateConfig | undefined,
    enabled: boolean,
    now: Date,
  ): BookAutoUpdateJob[] {
    if (!config) return [];
    return this.sortQueue(
      config.queue.filter((job) =>
        job.status === 'running'
        || (enabled && job.status === 'pending' && job.scheduledAt.getTime() <= now.getTime())),
    );
  }

  private getDataFilePath(): string {
    return path.join(this.dataDir, BOOKSTORE_DATA_FILE);
  }

  private async ensureDataFile(): Promise<void> {
    const filePath = this.getDataFilePath();
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify({ books: [] }, null, 2), 'utf-8');
    }
  }

  private async readAllBooks(): Promise<StoredBook[]> {
    await this.ensureDataFile();
    const content = await fs.readFile(this.getDataFilePath(), 'utf-8');
    const data = JSON.parse(content);
    return (Array.isArray(data.books) ? data.books : []).map((book: any) => ({
      ...book,
      publishTime: toDate(book.publishTime) ?? new Date(),
      updateTime: toDate(book.updateTime) ?? new Date(),
      auditTime: toDate(book.auditTime),
      offlineTime: toDate(book.offlineTime),
      publishedChapters: Array.isArray(book.publishedChapters)
        ? book.publishedChapters.map((chapter: any) => ({
            ...chapter,
            scheduledAt: toDate(chapter.scheduledAt),
            submittedAt: toDate(chapter.submittedAt) ?? new Date(),
            publishedAt: toDate(chapter.publishedAt),
          }))
        : [],
      comments: Array.isArray(book.comments)
        ? book.comments.map((comment: any) => ({
            ...comment,
            createdAt: toDate(comment.createdAt) ?? new Date(),
            updatedAt: toDate(comment.updatedAt) ?? new Date(),
          }))
        : [],
      autoUpdate: normalizeAutoUpdateConfig(book.autoUpdate),
    }));
  }

  private async writeAllBooks(books: StoredBook[]): Promise<void> {
    await fs.writeFile(this.getDataFilePath(), JSON.stringify({ books }, null, 2), 'utf-8');
  }

  private getPredictedNextChapterNumber(book: StoredBook): number {
    const publishedProgress = (book.publishedChapters ?? [])
      .filter((chapter) => chapter.status === 'published' || chapter.status === 'scheduled' || chapter.status === 'pending_audit')
      .reduce((max, chapter) => Math.max(max, chapter.chapterNumber), 0);
    return publishedProgress + 1;
  }

  private buildPendingJob(book: StoredBook, config: BookAutoUpdateConfig, now = new Date()): BookAutoUpdateJob {
    return {
      id: randomUUID(),
      chapterNumber: this.getPredictedNextChapterNumber(book),
      scheduledAt: nextOccurrence(config.timeOfDay, config.timezone, now),
      status: 'pending',
      generatedChapter: false,
      createdAt: now,
    };
  }

  private ensureQueue(config: BookAutoUpdateConfig, book: StoredBook, now = new Date()): BookAutoUpdateConfig {
    const hasActiveJob = config.queue.some((job) => job.status === 'pending' || job.status === 'running');
    if (!config.enabled || hasActiveJob) {
      return this.finalizeConfig(config);
    }

    const nextJob = this.buildPendingJob(book, config, now);
    return this.finalizeConfig({
      ...config,
      queue: [...config.queue, nextJob],
    });
  }

  async getBookAutoUpdate(bookId: string): Promise<BookAutoUpdateConfig | null> {
    const books = await this.readAllBooks();
    const book = books.find((item) => item.id === bookId);
    if (!book) return null;
    return book.autoUpdate ?? null;
  }

  async updateBookAutoUpdate(
    bookId: string,
    input: BookAutoUpdateConfigRequest,
    operatorId: string,
    now = new Date(),
  ): Promise<BookAutoUpdateConfig> {
    const books = await this.readAllBooks();
    const index = books.findIndex((book) => book.id === bookId);
    if (index === -1) throw new Error('作品不存在');
    if (input.enabled && books[index].publishStatus !== 'approved') {
      throw new Error('仅已上架作品可以开启自动更新');
    }

    const previous = books[index].autoUpdate;
    let nextConfig: BookAutoUpdateConfig = {
      enabled: input.enabled,
      timeOfDay: input.timeOfDay,
      timezone: input.timezone || 'Asia/Shanghai',
      maxWordCount: input.maxWordCount,
      userDirection: input.userDirection ?? '',
      updatedAt: now,
      updatedBy: operatorId,
      lastPlannedAt: previous?.lastPlannedAt,
      lastRunAt: previous?.lastRunAt,
      lastSuccessAt: previous?.lastSuccessAt,
      lastError: previous?.lastError,
      queue: this.retainQueueForConfigUpdate(previous, input.enabled, now),
      history: previous?.history ?? [],
    };

    if (input.enabled) {
      nextConfig = this.ensureQueue(nextConfig, books[index], now);
    } else {
      nextConfig = this.finalizeConfig(nextConfig);
    }

    books[index].autoUpdate = nextConfig;
    books[index].updateTime = now;
    await this.writeAllBooks(books);
    return nextConfig;
  }

  async enqueueImmediateRun(bookId: string, operatorId: string, now = new Date()): Promise<BookAutoUpdateJob> {
    const books = await this.readAllBooks();
    const index = books.findIndex((book) => book.id === bookId);
    if (index === -1) throw new Error('作品不存在');
    if (books[index].publishStatus !== 'approved') {
      throw new Error('仅已上架作品可以立即执行自动更新');
    }

    const existingConfig = books[index].autoUpdate;
    const baseConfig: BookAutoUpdateConfig = existingConfig ?? {
      enabled: false,
      timeOfDay: '08:00',
      timezone: 'Asia/Shanghai',
      userDirection: '',
      updatedAt: now,
      updatedBy: operatorId,
      queue: [],
      history: [],
    };

    const runningJob = baseConfig.queue.find((job) => job.status === 'running');
    if (runningJob) {
      return runningJob;
    }

    const pendingJobIndex = baseConfig.queue.findIndex((job) => job.status === 'pending');
    if (pendingJobIndex >= 0) {
      const job = {
        ...baseConfig.queue[pendingJobIndex],
        chapterNumber: this.getPredictedNextChapterNumber(books[index]),
        scheduledAt: now,
      };
      const nextQueue = [...baseConfig.queue];
      nextQueue[pendingJobIndex] = job;
      books[index].autoUpdate = this.finalizeConfig({
        ...baseConfig,
        updatedAt: now,
        updatedBy: operatorId,
        queue: nextQueue,
      });
      books[index].updateTime = now;
      await this.writeAllBooks(books);
      return job;
    }

    const job: BookAutoUpdateJob = {
      id: randomUUID(),
      chapterNumber: this.getPredictedNextChapterNumber(books[index]),
      scheduledAt: now,
      status: 'pending',
      generatedChapter: false,
      createdAt: now,
    };

    books[index].autoUpdate = this.finalizeConfig({
      ...baseConfig,
      updatedAt: now,
      updatedBy: operatorId,
      queue: [...baseConfig.queue, job],
    });
    books[index].updateTime = now;
    await this.writeAllBooks(books);
    return job;
  }

  async listDueJobs(now = new Date()): Promise<Array<{ bookId: string; novelId: string; job: BookAutoUpdateJob }>> {
    const books = await this.readAllBooks();
    return books.flatMap((book) => {
      if (book.publishStatus !== 'approved') return [];
      const config = book.autoUpdate;
      if (!config) return [];
      return config.queue
        .filter((job) => job.status === 'pending' && job.scheduledAt.getTime() <= now.getTime())
        .map((job) => ({
          bookId: book.id,
          novelId: book.novelId,
          job,
        }));
    });
  }

  async markJobRunning(
    bookId: string,
    jobId: string,
    chapterNumber: number,
    now = new Date(),
  ): Promise<BookAutoUpdateConfig> {
    const books = await this.readAllBooks();
    const index = books.findIndex((book) => book.id === bookId);
    if (index === -1) throw new Error('作品不存在');
    const config = books[index].autoUpdate;
    if (!config) throw new Error('自动更新配置不存在');

    const job = config.queue.find((item) => item.id === jobId);
    if (!job) throw new Error('自动更新任务不存在');

    job.status = 'running';
    job.chapterNumber = chapterNumber;
    job.startedAt = now;
    config.lastRunAt = now;
    config.lastError = undefined;
    books[index].autoUpdate = this.finalizeConfig(config);
    books[index].updateTime = now;
    await this.writeAllBooks(books);
    return books[index].autoUpdate!;
  }

  async markJobSubmitted(
    bookId: string,
    jobId: string,
    generatedChapter: boolean,
    now = new Date(),
  ): Promise<BookAutoUpdateConfig> {
    const books = await this.readAllBooks();
    const index = books.findIndex((book) => book.id === bookId);
    if (index === -1) throw new Error('作品不存在');
    const config = books[index].autoUpdate;
    if (!config) throw new Error('自动更新配置不存在');

    const jobIndex = config.queue.findIndex((item) => item.id === jobId);
    if (jobIndex === -1) throw new Error('自动更新任务不存在');

    const job = {
      ...config.queue[jobIndex],
      status: 'submitted' as const,
      generatedChapter,
      finishedAt: now,
      error: undefined,
    };

    config.queue.splice(jobIndex, 1);
    config.history = [...config.history, job].slice(-MAX_AUTO_UPDATE_HISTORY);
    config.lastSuccessAt = now;
    config.lastError = undefined;
    books[index].autoUpdate = this.ensureQueue(config, books[index], now);
    books[index].updateTime = now;
    await this.writeAllBooks(books);
    return books[index].autoUpdate!;
  }

  async markJobFailed(bookId: string, jobId: string, error: string, now = new Date()): Promise<BookAutoUpdateConfig> {
    const books = await this.readAllBooks();
    const index = books.findIndex((book) => book.id === bookId);
    if (index === -1) throw new Error('作品不存在');
    const config = books[index].autoUpdate;
    if (!config) throw new Error('自动更新配置不存在');

    const jobIndex = config.queue.findIndex((item) => item.id === jobId);
    if (jobIndex === -1) throw new Error('自动更新任务不存在');

    const job = {
      ...config.queue[jobIndex],
      status: 'failed' as const,
      finishedAt: now,
      error,
    };

    config.queue.splice(jobIndex, 1);
    config.history = [...config.history, job].slice(-MAX_AUTO_UPDATE_HISTORY);
    config.lastError = error;
    books[index].autoUpdate = this.ensureQueue(config, books[index], now);
    books[index].updateTime = now;
    await this.writeAllBooks(books);
    return books[index].autoUpdate!;
  }
}
