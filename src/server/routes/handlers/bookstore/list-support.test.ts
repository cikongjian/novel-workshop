import { describe, expect, it, vi } from 'vitest';
import { buildBookStoreListResponse, enrichBookStoreItems } from './list-support.js';
import { brand } from '../../../../config/brand.js';

describe('bookstore list support', () => {
  it('enriches public bookstore items and strips internal fields', async () => {
    const items = await enrichBookStoreItems(
      [
        {
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
          coverAuditStatus: 'pass',
          coverLocked: false,
          publishedChapters: [],
        } as any,
      ],
      {
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 1,
            status: 'published',
            submittedAt: new Date('2026-03-20T00:00:00.000Z'),
          },
        ]),
      } as any,
      {
        listChapterSummariesByNumbers: vi.fn().mockResolvedValue([
          { chapterNumber: 1, title: '第一章', wordCount: 1200, updatedAt: '2026-03-21T00:00:00.000Z' },
        ]),
        getInteractiveFlagsByNovelIds: vi.fn().mockResolvedValue(new Map()),
      } as any,
    );

    expect(items).toEqual([
      expect.objectContaining({
        id: 'book-1',
        authorName: brand.displayName,
        chapterCount: 1,
        wordCount: 1200,
        publishedChapterCount: 1,
        publishedWordCount: 1200,
      }),
    ]);
    // userId 对公开列表可见（作者等级徽章需要按 userId 取等级）
    expect(items[0].userId).toBe('author-1');
    expect(items[0]).not.toHaveProperty('comments');
    expect(items[0]).not.toHaveProperty('likedBy');
  });

  it('builds paginated list responses with the applied sort', async () => {
    const response = await buildBookStoreListResponse(
      {
        listBooks: vi.fn().mockResolvedValue({
          items: [
            {
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
              coverAuditStatus: 'pass',
              coverLocked: false,
              publishedChapters: [],
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }),
        getPublishedChapters: vi.fn().mockResolvedValue([
          {
            chapterNumber: 1,
            status: 'published',
            submittedAt: new Date('2026-03-20T00:00:00.000Z'),
          },
        ]),
      } as any,
      {
        listChapterSummariesByNumbers: vi.fn().mockResolvedValue([
          { chapterNumber: 1, title: '第一章', wordCount: 1200, updatedAt: '2026-03-21T00:00:00.000Z' },
        ]),
        getInteractiveFlagsByNovelIds: vi.fn().mockResolvedValue(new Map()),
      } as any,
      {
        page: 1,
        pageSize: 20,
        sort: 'hot',
      } as any,
      'hot',
    );

    expect(response).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      appliedSort: 'hot',
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      id: 'book-1',
      authorName: brand.displayName,
      chapterCount: 1,
    });
  });

  it('falls back to resolved chapter summaries when cached published word counts are incomplete', async () => {
    const items = await enrichBookStoreItems(
      [
        {
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
          likedBy: [],
          favoriteCount: 4,
          favoritedBy: [],
          commentCount: 1,
          comments: [],
          auditStatus: 'pass',
          coverAuditStatus: 'pass',
          coverLocked: false,
          publishedChapters: [
            {
              chapterNumber: 1,
              contentHash: 'hash-1',
              status: 'published',
              submittedAt: new Date('2026-03-20T00:00:00.000Z'),
              publishedAt: new Date('2026-03-20T00:10:00.000Z'),
              wordCount: 2412,
            },
            {
              chapterNumber: 2,
              contentHash: 'hash-2',
              status: 'published',
              submittedAt: new Date('2026-03-20T01:00:00.000Z'),
              publishedAt: new Date('2026-03-20T01:10:00.000Z'),
            },
            {
              chapterNumber: 3,
              contentHash: 'hash-3',
              status: 'published',
              submittedAt: new Date('2026-03-20T02:00:00.000Z'),
              publishedAt: new Date('2026-03-20T02:10:00.000Z'),
            },
            {
              chapterNumber: 4,
              contentHash: 'hash-4',
              status: 'published',
              submittedAt: new Date('2026-03-20T03:00:00.000Z'),
              publishedAt: new Date('2026-03-20T03:10:00.000Z'),
            },
          ],
        } as any,
      ],
      {
        getPublishedChapters: vi.fn().mockResolvedValue([
          { chapterNumber: 1, contentHash: 'hash-1', status: 'published', submittedAt: new Date('2026-03-20T00:00:00.000Z'), wordCount: 2412 },
          { chapterNumber: 2, contentHash: 'hash-2', status: 'published', submittedAt: new Date('2026-03-20T01:00:00.000Z') },
          { chapterNumber: 3, contentHash: 'hash-3', status: 'published', submittedAt: new Date('2026-03-20T02:00:00.000Z') },
          { chapterNumber: 4, contentHash: 'hash-4', status: 'published', submittedAt: new Date('2026-03-20T03:00:00.000Z') },
        ]),
      } as any,
      {
        listChapterSummariesByNumbers: vi.fn().mockResolvedValue([
          { chapterNumber: 1, title: '第一章', wordCount: 2412, updatedAt: '2026-03-21T00:00:00.000Z' },
          { chapterNumber: 2, title: '第二章', wordCount: 2600, updatedAt: '2026-03-21T01:00:00.000Z' },
          { chapterNumber: 3, title: '第三章', wordCount: 2500, updatedAt: '2026-03-21T02:00:00.000Z' },
          { chapterNumber: 4, title: '第四章', wordCount: 2700, updatedAt: '2026-03-21T03:00:00.000Z' },
        ]),
        getInteractiveFlagsByNovelIds: vi.fn().mockResolvedValue(new Map()),
      } as any,
    );

    expect(items[0]).toMatchObject({
      chapterCount: 4,
      wordCount: 10212,
      publishedChapterCount: 4,
      publishedWordCount: 10212,
    });
  });
});
