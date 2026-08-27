import { describe, expect, it, vi } from 'vitest';
import {
  isNotFoundLikeError,
  parseChapterNumberParam,
  prepareChapterForSave,
  syncPublishedChapterVisibility,
} from './crud-support.js';

describe('chapter crud support', () => {
  it('parses chapter number and detects not-found-like errors', () => {
    expect(parseChapterNumberParam('7')).toEqual({ chapterNumber: 7 });
    expect(parseChapterNumberParam('0').error).toBe('章节编号必须为正整数');
    expect(isNotFoundLikeError('第 2 章不存在')).toBe(true);
    expect(isNotFoundLikeError('validation failed')).toBe(false);
  });

  it('prepares existing chapter save with archive and drafted fallback', async () => {
    const archiveChapterVersion = vi.fn();
    const result = await prepareChapterForSave({
      novelManager: {
        getChapter: vi.fn().mockResolvedValue({
          novelId: 'novel-1',
          chapterNumber: 3,
          title: '旧标题',
          summary: '',
          content: '旧内容',
          wordCount: 3,
          status: 'edited',
          agentComments: [],
          revisionCount: 1,
          createdAt: '2026-03-22T00:00:00.000Z',
          updatedAt: '2026-03-22T00:00:00.000Z',
        }),
        archiveChapterVersion,
      } as any,
      novelId: 'novel-1',
      chapterNumber: 3,
      data: {
        content: '新内容',
        title: '新标题',
      },
      now: '2026-03-23T00:00:00.000Z',
    });

    expect(archiveChapterVersion).toHaveBeenCalledWith('novel-1', 3, 'manual-save');
    expect(result.contentChanged).toBe(true);
    expect(result.titleChanged).toBe(true);
    expect(result.chapter.status).toBe('drafted');
    expect(result.chapter.wordCount).toBe(3);
    expect(result.chapter.title).toBe('新标题');
  });

  it('creates new chapter when no existing chapter is found', async () => {
    const result = await prepareChapterForSave({
      novelManager: {
        getChapter: vi.fn().mockResolvedValue(null),
        archiveChapterVersion: vi.fn(),
      } as any,
      novelId: 'novel-1',
      chapterNumber: 9,
      data: {
        content: '新章正文',
      },
      now: '2026-03-23T00:00:00.000Z',
    });

    expect(result.chapter.status).toBe('outlined');
    expect(result.chapter.content).toBe('新章正文');
    expect(result.contentChanged).toBe(false);
    expect(result.titleChanged).toBe(false);
  });

  it('syncs published chapter visibility based on content or title changes', async () => {
    const hideChapterIfModified = vi.fn();
    const forceHideChapter = vi.fn();

    await syncPublishedChapterVisibility({
      bookStoreManager: {
        hideChapterIfModified,
        forceHideChapter,
      } as any,
      novelId: 'novel-1',
      chapterNumber: 2,
      chapterContent: '正文',
      contentChanged: true,
      titleChanged: false,
      hashContent: vi.fn().mockReturnValue('hash-1'),
    });

    await syncPublishedChapterVisibility({
      bookStoreManager: {
        hideChapterIfModified,
        forceHideChapter,
      } as any,
      novelId: 'novel-1',
      chapterNumber: 2,
      chapterContent: '',
      contentChanged: false,
      titleChanged: true,
      hashContent: vi.fn(),
    });

    expect(hideChapterIfModified).toHaveBeenCalledWith('novel-1', 2, 'hash-1');
    expect(forceHideChapter).toHaveBeenCalledWith('novel-1', 2);
  });
});
