import { describe, expect, it, vi } from 'vitest';
import { buildBookStoreManageChapterPage } from './chapter-management-data.js';

describe('chapter-management-data', () => {
  it('builds paged chapter management data with full publish summary', async () => {
    const result = await buildBookStoreManageChapterPage(
      'book-1',
      { novelId: 'novel-1' },
      {
        novelManager: {
          listChapterPage: vi.fn().mockResolvedValue({
            items: [
              { chapterNumber: 101, title: '第一百零一章', wordCount: 2100, updatedAt: '2026-04-20T00:00:00.000Z' },
              { chapterNumber: 102, title: '第一百零二章', wordCount: 2200, updatedAt: '2026-04-21T00:00:00.000Z' },
            ],
            total: 150,
            page: 2,
            pageSize: 100,
            hasMore: false,
          }),
        } as any,
        bookStoreManager: {
          getPublishedChapters: vi.fn().mockResolvedValue([
            {
              chapterNumber: 1,
              status: 'published',
              submittedAt: new Date('2026-04-01T00:00:00.000Z'),
              publishedAt: new Date('2026-04-01T01:00:00.000Z'),
            },
            {
              chapterNumber: 101,
              status: 'scheduled',
              submittedAt: new Date('2026-04-20T00:00:00.000Z'),
              scheduledAt: new Date('2026-04-25T08:00:00.000Z'),
            },
            {
              chapterNumber: 102,
              status: 'pending_audit',
              submittedAt: new Date('2026-04-21T00:00:00.000Z'),
            },
          ]),
        } as any,
      },
      { page: 2, pageSize: 100 },
    );

    expect(result.summary).toMatchObject({
      total: 150,
      published: 1,
      scheduled: 1,
      pendingAudit: 1,
      unpublished: 147,
      lastPublishedChapterNumber: 1,
      nextScheduledAt: '2026-04-25T08:00:00.000Z',
    });
    expect(result.items).toEqual([
      expect.objectContaining({ chapterNumber: 101, status: 'scheduled' }),
      expect.objectContaining({ chapterNumber: 102, status: 'pending_audit' }),
    ]);
    expect(result).toMatchObject({ page: 2, pageSize: 100, hasMore: false });
  });
});
