import { describe, expect, it, vi } from 'vitest';
import {
  buildMyPublishedBookItems,
  resolveBookDetailVisibility,
  resolveBookRequestIp,
  sanitizePublicBookDetail,
  sanitizePublicBookStore,
} from './catalog-support.js';

describe('bookstore catalog support', () => {
  it('sanitizes internal fields and preserves full detail for owners/admins', () => {
    const book = {
      id: 'book-1',
      novelId: 'novel-1',
      userId: 'author-1',
      publishStatus: 'approved',
      title: 'Public Book',
      cover: 'cover.png',
      description: 'desc',
      category: '玄幻',
      tags: ['升级'],
      publishTime: new Date('2026-03-20T00:00:00.000Z'),
      updateTime: new Date('2026-03-21T00:00:00.000Z'),
      viewCount: 12,
      likeCount: 3,
      likedBy: ['user-1'],
      favoriteCount: 4,
      favoritedBy: ['user-2'],
      commentCount: 1,
      comments: [{ id: 'comment-1' }],
      auditStatus: 'pass',
      auditTime: new Date('2026-03-20T00:00:00.000Z'),
      coverAuditStatus: 'pass',
      coverLocked: false,
      publishedChapters: [],
    } as any;

    const publicBook = sanitizePublicBookStore(book);

    // userId 对公开详情可见（用于书城卡片展示作者等级徽章）
    expect(publicBook.userId).toBe('author-1');
    expect(publicBook).not.toHaveProperty('auditStatus');
    expect(publicBook).not.toHaveProperty('likedBy');
    expect(publicBook).not.toHaveProperty('comments');
    expect(resolveBookDetailVisibility(book)).toEqual(sanitizePublicBookDetail(book));
    expect(resolveBookDetailVisibility(book)).toHaveProperty('comments');
    expect(resolveBookDetailVisibility(book, { id: 'author-1', role: 'user', username: 'author' })).toBe(book);
    expect(resolveBookDetailVisibility(book, { id: 'admin-1', role: 'admin', username: 'admin' })).toBe(book);
  });

  it('resolves request ip from forwarded headers first', () => {
    expect(resolveBookRequestIp({
      forwardedFor: '198.51.100.1, 10.0.0.1',
      remoteAddress: '127.0.0.1',
    })).toBe('198.51.100.1');
    expect(resolveBookRequestIp({
      forwardedFor: ['203.0.113.2'],
      remoteAddress: '127.0.0.1',
    })).toBe('203.0.113.2');
    expect(resolveBookRequestIp({ remoteAddress: '127.0.0.1' })).toBe('127.0.0.1');
    expect(resolveBookRequestIp({})).toBe('unknown');
  });

  it('builds published book metrics with chapter schedule summary', async () => {
    const result = await buildMyPublishedBookItems(
      [
        {
          id: 'book-1',
          novelId: 'novel-1',
          title: 'Public Book',
          cover: 'cover.png',
          description: 'desc',
          category: '玄幻',
          tags: ['升级'],
          publishStatus: 'approved',
          publishTime: new Date('2026-03-20T00:00:00.000Z'),
          updateTime: new Date('2026-03-21T00:00:00.000Z'),
          viewCount: 12,
          likeCount: 3,
          favoriteCount: 4,
          commentCount: 1,
          publishedChapters: [],
          authorName: '作者甲',
          chapterCount: 2,
          wordCount: 2800,
          publishedChapterCount: 2,
          publishedWordCount: 2800,
        } as any,
      ],
      {
        novelManager: {
          countChapters: vi.fn().mockResolvedValue(3),
        } as any,
        bookStoreManager: {
          getPublishedChapters: vi.fn().mockResolvedValue([
            {
              chapterNumber: 1,
              status: 'published',
              submittedAt: new Date('2026-03-20T00:00:00.000Z'),
              publishedAt: new Date('2026-03-20T00:10:00.000Z'),
            },
            {
              chapterNumber: 2,
              status: 'scheduled',
              submittedAt: new Date('2026-03-20T01:00:00.000Z'),
              scheduledAt: new Date('2026-03-21T08:00:00.000Z'),
            },
            {
              chapterNumber: 3,
              status: 'pending_audit',
              submittedAt: new Date('2026-03-20T02:00:00.000Z'),
            },
          ]),
        } as any,
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        totalChapterCount: 3,
        publishedChapterCount: 1,
        scheduledChapterCount: 1,
        pendingAuditChapterCount: 1,
        lastPublishedChapterNumber: 1,
        nextScheduledAt: '2026-03-21T08:00:00.000Z',
      }),
    ]);
  });
});
