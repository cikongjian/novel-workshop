import { describe, expect, it, vi } from 'vitest';
import {
  getPublicReaderChapterContent,
  listPublicReaderChapterPage,
  listPublicReaderChapters,
} from './public-reader-data.js';

describe('public-reader-data', () => {
  it('returns no public chapters when the book has no explicitly published chapter records', async () => {
    const chapters = await listPublicReaderChapters({
      bookId: 'book-1',
      novelId: 'novel-1',
      bookStoreManager: {
        getPublishedChapters: vi.fn().mockResolvedValue([]),
      } as any,
      novelManager: {
        listChapterSummariesByNumbers: vi.fn().mockResolvedValue([
          { chapterNumber: 1, title: '第一章', wordCount: 1200 },
        ]),
      } as any,
    });

    expect(chapters).toEqual([]);
  });

  it('does not expose chapter content when the chapter was never published', async () => {
    const chapter = await getPublicReaderChapterContent({
      bookId: 'book-1',
      novelId: 'novel-1',
      chapterNumber: 1,
      bookStoreManager: {
        getPublishedChapters: vi.fn().mockResolvedValue([]),
      } as any,
      novelManager: {
        getChapter: vi.fn().mockResolvedValue({
          chapterNumber: 1,
          title: '第一章',
          content: '未发布章节正文',
          wordCount: 7,
        }),
      } as any,
    });

    expect(chapter).toBeNull();
  });

  it('returns only explicitly published novel chapters in the reader chapter list', async () => {
    const chapters = await listPublicReaderChapters({
      bookId: 'book-1',
      novelId: 'novel-1',
      bookStoreManager: {
        getPublishedChapters: vi.fn().mockResolvedValue([
          { chapterNumber: 1, status: 'published' },
          { chapterNumber: 2, status: 'hidden' },
          { chapterNumber: 3, status: 'published' },
        ]),
      } as any,
      novelManager: {
        listChapterSummariesByNumbers: vi.fn().mockResolvedValue([
          { chapterNumber: 1, title: '第一章', wordCount: 1200, updatedAt: '2026-03-14T00:00:00.000Z' },
        ]),
      } as any,
    });

    expect(chapters).toEqual([
      {
        chapterNumber: 1,
        title: '第一章',
        wordCount: 1200,
        updatedAt: '2026-03-14T00:00:00.000Z',
        source: 'novel',
      },
    ]);
  });

  it('returns a paged public reader chapter list without loading every chapter summary', async () => {
    const listChapterSummariesByNumbers = vi.fn().mockImplementation(async (_novelId: string, chapterNumbers: number[]) => (
      chapterNumbers.map((chapterNumber) => ({
        chapterNumber,
        title: `第${chapterNumber}章`,
        wordCount: chapterNumber * 100,
      }))
    ));

    const result = await listPublicReaderChapterPage({
      bookId: 'book-1',
      novelId: 'novel-1',
      page: 2,
      pageSize: 2,
      order: 'desc',
      bookStoreManager: {
        getPublishedChapters: vi.fn().mockResolvedValue([
          { chapterNumber: 1, status: 'published' },
          { chapterNumber: 2, status: 'published' },
          { chapterNumber: 3, status: 'published' },
          { chapterNumber: 4, status: 'published' },
          { chapterNumber: 5, status: 'published' },
        ]),
      } as any,
      novelManager: {
        listChapterSummariesByNumbers,
      } as any,
    });

    expect(listChapterSummariesByNumbers).toHaveBeenCalledWith('novel-1', [3, 2]);
    expect(result).toMatchObject({
      total: 5,
      page: 2,
      pageSize: 2,
      hasMore: true,
      items: [
        { chapterNumber: 3, title: '第3章', wordCount: 300, source: 'novel' },
        { chapterNumber: 2, title: '第2章', wordCount: 200, source: 'novel' },
      ],
    });
  });

  it('allows published chapters to read from audit fallback when source chapter is missing', async () => {
    const chapter = await getPublicReaderChapterContent({
      bookId: 'book-1',
      novelId: 'novel-1',
      chapterNumber: 3,
      bookStoreManager: {
        getPublishedChapters: vi.fn().mockResolvedValue([
          { chapterNumber: 3, status: 'published' },
        ]),
      } as any,
      novelManager: {
        getChapter: vi.fn().mockResolvedValue(null),
      } as any,
      contentAuditService: {
        getNovelAudits: vi.fn().mockResolvedValue([
          {
            chapterId: '3',
            status: 'pass',
            auditTime: new Date('2026-03-14T01:00:00.000Z'),
            content: '第三章补回内容',
          },
        ]),
      } as any,
    });

    expect(chapter).toEqual({
      chapterNumber: 3,
      title: '第3章',
      wordCount: 7,
      updatedAt: '2026-03-14T01:00:00.000Z',
      content: '第三章补回内容',
      source: 'audit-fallback',
    });
  });

  it('cleans public chapter content before exposing it to readers', async () => {
    const cleanedContent = '“知道了。”\n\n需要测试\n\n光线变暗继续推进。';
    const chapter = await getPublicReaderChapterContent({
      bookId: 'book-1',
      novelId: 'novel-1',
      chapterNumber: 1,
      bookStoreManager: {
        getPublishedChapters: vi.fn().mockResolvedValue([
          { chapterNumber: 1, status: 'published' },
        ]),
      } as any,
      novelManager: {
        getChapter: vi.fn().mockResolvedValue({
          chapterNumber: 1,
          title: '第一章',
          content: '(#林栀)“知道了。”\n\n***\n\n**需要测试**\n\n【光线变暗】继续推进。',
          updatedAt: '2026-03-14T02:00:00.000Z',
        }),
      } as any,
    });

    expect(chapter).toEqual({
      chapterNumber: 1,
      title: '第一章',
      content: cleanedContent,
      wordCount: 19,
      updatedAt: '2026-03-14T02:00:00.000Z',
      source: 'novel',
    });
  });

  it('merges published novel chapters with audit fallback chapters when source files are partially missing', async () => {
    const chapters = await listPublicReaderChapters({
      bookId: 'book-1',
      novelId: 'novel-1',
      bookStoreManager: {
        getPublishedChapters: vi.fn().mockResolvedValue([
          { chapterNumber: 1, status: 'published' },
          { chapterNumber: 2, status: 'published' },
          { chapterNumber: 3, status: 'published' },
        ]),
      } as any,
      novelManager: {
        listChapterSummariesByNumbers: vi.fn().mockResolvedValue([
          { chapterNumber: 1, title: '第一章', wordCount: 1200, updatedAt: '2026-03-14T00:00:00.000Z' },
          { chapterNumber: 3, title: '第三章', wordCount: 1500, updatedAt: '2026-03-14T02:00:00.000Z' },
        ]),
      } as any,
      contentAuditService: {
        getNovelAudits: vi.fn().mockResolvedValue([
          {
            chapterId: '2',
            status: 'pass',
            auditTime: new Date('2026-03-14T01:00:00.000Z'),
            content: '第二章补回内容',
          },
        ]),
      } as any,
    });

    expect(chapters).toEqual([
      {
        chapterNumber: 1,
        title: '第一章',
        wordCount: 1200,
        updatedAt: '2026-03-14T00:00:00.000Z',
        source: 'novel',
      },
      {
        chapterNumber: 2,
        title: '第2章',
        wordCount: 7,
        updatedAt: '2026-03-14T01:00:00.000Z',
        source: 'audit-fallback',
      },
      {
        chapterNumber: 3,
        title: '第三章',
        wordCount: 1500,
        updatedAt: '2026-03-14T02:00:00.000Z',
        source: 'novel',
      },
    ]);
  });
});
