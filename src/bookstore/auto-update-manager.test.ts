import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookstoreAutoUpdateManager } from './auto-update-manager.js';

describe('BookstoreAutoUpdateManager', () => {
  let tempDir: string;
  let manager: BookstoreAutoUpdateManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-auto-update-'));
    manager = new BookstoreAutoUpdateManager(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('moves the existing pending job to now when an admin triggers run-now', async () => {
    await seedBookstore(tempDir, {
      enabled: true,
      timeOfDay: '08:30',
      timezone: 'UTC',
      updatedAt: '2026-03-23T00:00:00.000Z',
      updatedBy: 'admin-1',
      lastPlannedAt: '2026-03-24T08:30:00.000Z',
      queue: [
        {
          id: 'job-future',
          chapterNumber: 2,
          scheduledAt: '2026-03-24T08:30:00.000Z',
          status: 'pending',
          generatedChapter: false,
          createdAt: '2026-03-23T00:00:00.000Z',
        },
      ],
      history: [],
    });

    const now = new Date('2026-03-23T01:05:00.000Z');
    const job = await manager.enqueueImmediateRun('book-1', 'admin-2', now);
    const snapshot = await manager.getBookAutoUpdate('book-1');

    expect(job).toMatchObject({
      id: 'job-future',
      chapterNumber: 2,
    });
    expect(job.scheduledAt.toISOString()).toBe(now.toISOString());
    expect(snapshot).not.toBeNull();
    expect(snapshot?.queue).toHaveLength(1);
    expect(snapshot?.queue[0]).toMatchObject({
      id: 'job-future',
      chapterNumber: 2,
    });
    expect(snapshot?.queue[0].scheduledAt.toISOString()).toBe(now.toISOString());
    expect(snapshot?.updatedBy).toBe('admin-2');
    expect(snapshot?.lastPlannedAt?.toISOString()).toBe(now.toISOString());
  });

  it('replans future pending jobs when the admin updates the recurring config', async () => {
    await seedBookstore(tempDir, {
      enabled: true,
      timeOfDay: '08:30',
      timezone: 'UTC',
      updatedAt: '2026-03-23T00:00:00.000Z',
      updatedBy: 'admin-1',
      lastPlannedAt: '2026-03-24T08:30:00.000Z',
      queue: [
        {
          id: 'job-old',
          chapterNumber: 2,
          scheduledAt: '2026-03-24T08:30:00.000Z',
          status: 'pending',
          generatedChapter: false,
          createdAt: '2026-03-23T00:00:00.000Z',
        },
      ],
      history: [],
    });

    const updated = await manager.updateBookAutoUpdate(
      'book-1',
      {
        enabled: true,
        timeOfDay: '10:45',
        timezone: 'UTC',
        maxWordCount: 3200,
        userDirection: '推进主线冲突',
      },
      'admin-2',
      new Date('2026-03-23T01:05:00.000Z'),
    );

    expect(updated.enabled).toBe(true);
    expect(updated.queue).toHaveLength(1);
    expect(updated.queue[0].id).not.toBe('job-old');
    expect(updated.queue[0].scheduledAt.toISOString()).toBe('2026-03-23T10:45:00.000Z');
    expect(updated.lastPlannedAt?.toISOString()).toBe('2026-03-23T10:45:00.000Z');
  });

  it('keeps the running job visible when auto update is disabled', async () => {
    await seedBookstore(tempDir, {
      enabled: true,
      timeOfDay: '08:30',
      timezone: 'UTC',
      updatedAt: '2026-03-23T00:00:00.000Z',
      updatedBy: 'admin-1',
      lastPlannedAt: '2026-03-24T08:30:00.000Z',
      queue: [
        {
          id: 'job-running',
          chapterNumber: 2,
          scheduledAt: '2026-03-23T00:30:00.000Z',
          status: 'running',
          generatedChapter: false,
          createdAt: '2026-03-23T00:00:00.000Z',
          startedAt: '2026-03-23T00:31:00.000Z',
        },
        {
          id: 'job-future',
          chapterNumber: 3,
          scheduledAt: '2026-03-24T08:30:00.000Z',
          status: 'pending',
          generatedChapter: false,
          createdAt: '2026-03-23T00:10:00.000Z',
        },
      ],
      history: [],
    });

    const updated = await manager.updateBookAutoUpdate(
      'book-1',
      {
        enabled: false,
        timeOfDay: '08:30',
        timezone: 'UTC',
        userDirection: '',
      },
      'admin-2',
      new Date('2026-03-23T01:05:00.000Z'),
    );

    expect(updated.enabled).toBe(false);
    expect(updated.queue).toHaveLength(1);
    expect(updated.queue[0]).toMatchObject({
      id: 'job-running',
      status: 'running',
    });
    expect(updated.lastPlannedAt).toBeUndefined();
  });
});

type SeedAutoUpdate = {
  enabled: boolean;
  timeOfDay: string;
  timezone: string;
  updatedAt: string;
  updatedBy: string;
  lastPlannedAt?: string;
  queue: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
};

async function seedBookstore(dir: string, autoUpdate: SeedAutoUpdate) {
  await fs.writeFile(path.join(dir, 'bookstore.json'), JSON.stringify({
    books: [
      {
        id: 'book-1',
        novelId: 'novel-1',
        userId: 'author-1',
        publishStatus: 'approved',
        title: '测试书籍',
        cover: '/api/novels/cover/novel-1',
        description: '',
        category: '都市',
        tags: [],
        publishTime: '2026-03-20T00:00:00.000Z',
        updateTime: '2026-03-20T00:00:00.000Z',
        viewCount: 0,
        likeCount: 0,
        likedBy: [],
        favoriteCount: 0,
        favoritedBy: [],
        commentCount: 0,
        comments: [],
        auditStatus: 'pass',
        coverAuditStatus: 'pass',
        coverLocked: true,
        publishedChapters: [
          {
            chapterNumber: 1,
            contentHash: 'hash-1',
            status: 'published',
            submittedAt: '2026-03-20T00:00:00.000Z',
            publishedAt: '2026-03-20T00:10:00.000Z',
          },
        ],
        autoUpdate,
      },
    ],
  }, null, 2), 'utf-8');
}
