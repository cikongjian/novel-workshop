import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookStoreManager } from './bookstore-manager.js';
import { initAppDb } from '../db/app-db.js';
import type { BookStoreSort } from './storefront-types.js';

function createTestManager(tempDir: string): BookStoreManager {
  const db = initAppDb(tempDir);
  // 每个测试用独立的 DB 实例
  (initAppDb as unknown as { _reset?: () => void });
  return new BookStoreManager(tempDir, db);
}

describe('BookStoreManager scheduling', () => {
  let tempDir: string;
  let db: Database.Database;
  let manager: BookStoreManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-bookstore-'));
    db = new Database(path.join(tempDir, 'app.db'));
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, novel_id TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL, title TEXT NOT NULL, cover TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', publish_status TEXT NOT NULL DEFAULT 'pending', audit_status TEXT NOT NULL DEFAULT 'pending', audit_result TEXT, audit_time INTEGER, cover_audit_status TEXT NOT NULL DEFAULT 'pending_review', cover_locked INTEGER NOT NULL DEFAULT 0, cover_audit_reject_reason TEXT, offline_reason TEXT, offline_time INTEGER, view_count INTEGER NOT NULL DEFAULT 0, like_count INTEGER NOT NULL DEFAULT 0, favorite_count INTEGER NOT NULL DEFAULT 0, comment_count INTEGER NOT NULL DEFAULT 0, published_chapters TEXT NOT NULL DEFAULT '[]', auto_update TEXT, publish_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS book_likes (book_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (book_id, user_id));
      CREATE TABLE IF NOT EXISTS book_favorites (book_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (book_id, user_id));
      CREATE TABLE IF NOT EXISTS book_comments (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, avatar_url TEXT, username TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    `);
    manager = new BookStoreManager(tempDir, db);
    await seedBookstore(manager);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('tracks scheduled chapters as due jobs and clears scheduling once submitted for audit', async () => {
    const scheduledAt = new Date('2026-03-14T02:00:00.000Z');
    await manager.scheduleChapterPublication('book-1', 2, 'hash-2', scheduledAt);

    const due = await manager.listDueScheduledPublications(new Date('2026-03-14T02:30:00.000Z'));
    expect(due).toEqual([
      {
        bookId: 'book-1',
        novelId: 'novel-1',
        chapterNumber: 2,
      },
    ]);

    await manager.submitChapterForAudit('book-1', 2, 'hash-2');

    const due2 = await manager.listDueScheduledPublications(new Date('2026-03-14T02:30:00.000Z'));
    expect(due2).toEqual([]);

    const chapters = await manager.getPublishedChapters('book-1');
    expect(chapters.find((item) => item.chapterNumber === 3)).toMatchObject({
      chapterNumber: 3,
      status: 'hidden',
      scheduledAt: undefined,
    });
  });
});

describe('BookStoreManager storefront sorting', () => {
  let tempDir: string;
  let db: Database.Database;
  let manager: BookStoreManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-bookstore-sort-'));
    db = new Database(path.join(tempDir, 'app.db'));
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, novel_id TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL, title TEXT NOT NULL, cover TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', publish_status TEXT NOT NULL DEFAULT 'pending', audit_status TEXT NOT NULL DEFAULT 'pending', audit_result TEXT, audit_time INTEGER, cover_audit_status TEXT NOT NULL DEFAULT 'pending_review', cover_locked INTEGER NOT NULL DEFAULT 0, cover_audit_reject_reason TEXT, offline_reason TEXT, offline_time INTEGER, view_count INTEGER NOT NULL DEFAULT 0, like_count INTEGER NOT NULL DEFAULT 0, favorite_count INTEGER NOT NULL DEFAULT 0, comment_count INTEGER NOT NULL DEFAULT 0, published_chapters TEXT NOT NULL DEFAULT '[]', auto_update TEXT, publish_time INTEGER NOT NULL, update_time INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS book_likes (book_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (book_id, user_id));
      CREATE TABLE IF NOT EXISTS book_favorites (book_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (book_id, user_id));
      CREATE TABLE IF NOT EXISTS book_comments (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, avatar_url TEXT, username TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    `);
    manager = new BookStoreManager(tempDir, db);
    await seedSortableBookstore(manager);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it.each([
    ['updated', ['book-updated', 'book-hot', 'book-new']],
    ['hot', ['book-hot', 'book-updated', 'book-new']],
    ['new', ['book-new', 'book-hot', 'book-updated']],
  ] satisfies Array<[BookStoreSort, string[]]>)(
    'sorts books by %s',
    async (sort, expectedIds) => {
      const result = await manager.listBooks({ page: 1, pageSize: 10, sort });
      expect(result.items.map((item) => item.id)).toEqual(expectedIds);
    },
  );
});

async function seedBookstore(manager: BookStoreManager) {
  const { importBooks } = await import('./bookstore-store.js');
  const db = (manager as unknown as { db: import('better-sqlite3').Database }).db;
  importBooks(db, [
    {
      id: 'book-1',
      novelId: 'novel-1',
      userId: 'dev',
      publishStatus: 'approved',
      title: '测试书籍',
      cover: '/api/novels/cover/novel-1',
      description: '',
      category: '都市',
      tags: [],
      publishTime: new Date('2026-03-14T00:00:00.000Z'),
      updateTime: new Date('2026-03-14T00:00:00.000Z'),
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
          submittedAt: new Date('2026-03-14T00:00:00.000Z'),
          publishedAt: new Date('2026-03-14T00:10:00.000Z'),
        },
        {
          chapterNumber: 3,
          contentHash: 'hash-3',
          status: 'hidden',
          submittedAt: new Date('2026-03-14T00:00:00.000Z'),
        },
      ],
    } as import('./types.js').BookStore,
  ]);
}

async function seedSortableBookstore(manager: BookStoreManager) {
  const { importBooks } = await import('./bookstore-store.js');
  const db = (manager as unknown as { db: import('better-sqlite3').Database }).db;
  const now = Date.now();
  importBooks(db, [
    {
      id: 'book-updated',
      novelId: 'novel-updated',
      userId: 'dev',
      publishStatus: 'approved',
      title: '更新最快',
      cover: '/api/novels/cover/novel-updated',
      description: '',
      category: '都市',
      tags: [],
      publishTime: new Date('2026-03-10T00:00:00.000Z'),
      updateTime: new Date('2026-03-22T12:00:00.000Z'),
      viewCount: 30,
      likeCount: 3,
      likedBy: ['u1', 'u2', 'u3'],
      favoriteCount: 2,
      favoritedBy: ['u1', 'u2'],
      commentCount: 1,
      comments: [],
      auditStatus: 'pass',
      coverAuditStatus: 'pass',
      coverLocked: true,
      publishedChapters: [{ chapterNumber: 6, contentHash: 'hash-6', status: 'published', submittedAt: new Date('2026-03-22T11:30:00.000Z'), publishedAt: new Date('2026-03-22T12:00:00.000Z') }],
    } as import('./types.js').BookStore,
    {
      id: 'book-hot',
      novelId: 'novel-hot',
      userId: 'dev',
      publishStatus: 'approved',
      title: '最火热',
      cover: '/api/novels/cover/novel-hot',
      description: '',
      category: '都市',
      tags: [],
      publishTime: new Date('2026-03-18T00:00:00.000Z'),
      updateTime: new Date('2026-03-20T10:00:00.000Z'),
      viewCount: 800,
      likeCount: 40,
      likedBy: Array.from({ length: 40 }, (_, i) => `like-${i}`),
      favoriteCount: 25,
      favoritedBy: Array.from({ length: 25 }, (_, i) => `fav-${i}`),
      commentCount: 12,
      comments: [],
      auditStatus: 'pass',
      coverAuditStatus: 'pass',
      coverLocked: true,
      publishedChapters: [],
    } as import('./types.js').BookStore,
    {
      id: 'book-new',
      novelId: 'novel-new',
      userId: 'dev',
      publishStatus: 'approved',
      title: '刚上新',
      cover: '/api/novels/cover/novel-new',
      description: '',
      category: '都市',
      tags: [],
      publishTime: new Date('2026-03-23T00:00:00.000Z'),
      updateTime: new Date('2026-03-23T00:00:00.000Z'),
      viewCount: 10,
      likeCount: 1,
      likedBy: ['u9'],
      favoriteCount: 1,
      favoritedBy: ['u9'],
      commentCount: 0,
      comments: [],
      auditStatus: 'pass',
      coverAuditStatus: 'pass',
      coverLocked: true,
      publishedChapters: [],
    } as import('./types.js').BookStore,
  ]);
}
