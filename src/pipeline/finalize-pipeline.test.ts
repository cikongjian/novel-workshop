import { describe, expect, it, vi } from 'vitest';
import { FinalizePipeline } from './finalize-pipeline.js';

describe('FinalizePipeline diagnostics persistence', () => {
  it('allows structural finalize when reader delivery failed', async () => {
    const timestamp = new Date('2026-01-01T00:00:02.000Z').toISOString();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));

    try {
      const chapter = {
        novelId: 'novel-1',
        chapterNumber: 9,
        title: 'Chapter 9',
        content: 'The chapter content stays intact.',
        summary: '',
        wordCount: 31,
        status: 'reviewed',
        agentComments: [],
        revisionCount: 0,
        diagnostics: {
          readerDeliveryAudit: {
            score: 73.4,
            passed: false,
            readerScore: 7.3,
            issues: ['readability failed'],
            suggestions: [],
            dimensions: {
              title: 88,
              opening: 80,
              promisePayoff: 91,
              readability: 45,
              endingHook: 74,
              publicSurface: 88,
            },
          },
          userDirectionAnchorAudit: {
            mode: 'observe',
            anchors: ['会议室', '客户', '签约'],
            presentAnchors: ['会议室'],
            missingAnchors: ['客户', '签约'],
            coverage: 1 / 3,
            shouldRepair: true,
            directionChars: 80,
            contentChars: 1200,
            directionPreview: '推进客户签约',
            warnings: ['user direction anchors missing from final chapter'],
            checkedAt: timestamp,
          },
          updatedAt: timestamp,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const novelManager = {
        getChapter: vi.fn().mockResolvedValue(chapter),
        getNovel: vi.fn().mockResolvedValue({
          id: 'novel-1',
          title: 'Test Novel',
          synopsis: 'Test synopsis',
          genre: 'modern',
          tags: [],
        }),
        getCharacters: vi.fn().mockResolvedValue([]),
        getWorldEntries: vi.fn().mockResolvedValue([]),
        getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
        saveChapter: vi.fn().mockResolvedValue(undefined),
      };
      const pipeline = new FinalizePipeline(new Map(), novelManager, {});
      vi.spyOn(pipeline as any, 'determineFinalizeMode').mockResolvedValue('skip');

      const result = await pipeline.finalize({
        novelId: 'novel-1',
        chapterNumber: 9,
      });

      expect(result).toEqual(expect.objectContaining({ finalizeMode: 'skip' }));
      expect(novelManager.saveChapter).toHaveBeenCalledWith(
        'novel-1',
        expect.objectContaining({ status: 'finalized' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips finalize when user direction anchors are corrupted', async () => {
    const timestamp = new Date('2026-01-01T00:00:03.000Z').toISOString();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));

    try {
      const chapter = {
        novelId: 'novel-1',
        chapterNumber: 10,
        title: 'Chapter 10',
        content: 'The chapter content stays intact.',
        summary: '',
        wordCount: 31,
        status: 'reviewed',
        agentComments: [],
        revisionCount: 0,
        diagnostics: {
          readerDeliveryAudit: {
            score: 91,
            passed: true,
            readerScore: 8.1,
            issues: [],
            suggestions: [],
            dimensions: {
              title: 88,
              opening: 88,
              promisePayoff: 91,
              readability: 84,
              endingHook: 86,
              publicSurface: 88,
            },
          },
          userDirectionAnchorAudit: {
            mode: 'observe',
            anchors: [],
            presentAnchors: [],
            missingAnchors: [],
            coverage: 1,
            shouldRepair: false,
            directionChars: 80,
            contentChars: 1200,
            directionPreview: '?'.repeat(24),
            warnings: ['user direction appears mojibake or question-mark corrupted'],
            checkedAt: timestamp,
          },
          updatedAt: timestamp,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const novelManager = {
        getChapter: vi.fn().mockResolvedValue(chapter),
        getNovel: vi.fn().mockResolvedValue({
          id: 'novel-1',
          title: 'Test Novel',
          synopsis: 'Test synopsis',
          genre: 'modern',
          tags: [],
        }),
        getCharacters: vi.fn().mockResolvedValue([]),
        getWorldEntries: vi.fn().mockResolvedValue([]),
        getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
        saveChapter: vi.fn().mockResolvedValue(undefined),
      };
      const pipeline = new FinalizePipeline(new Map(), novelManager, {});

      const result = await pipeline.finalize({
        novelId: 'novel-1',
        chapterNumber: 10,
      });

      expect(result).toEqual(expect.objectContaining({
        finalizeMode: 'skipped',
        skipped: true,
        reason: 'direction-anchors-corrupted',
      }));
      expect(novelManager.saveChapter).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves diagnostics written after finalize loaded the chapter', async () => {
    const loadedAt = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const backgroundAt = new Date('2026-01-01T00:00:01.000Z').toISOString();
    const finalizedAt = new Date('2026-01-01T00:00:02.000Z').toISOString();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(finalizedAt));

    try {
      const initialChapter = {
        novelId: 'novel-1',
        chapterNumber: 8,
        title: 'Chapter 8',
        content: 'The chapter content stays intact.',
        summary: '',
        wordCount: 31,
        status: 'reviewed',
        agentComments: [],
        revisionCount: 0,
        diagnostics: {
          memoryContextAudit: {
            mode: 'observe',
            retriever: 'legacy',
            totalChars: 10,
            promptChars: 10,
            unusedPersistedSources: [],
            emptyPromptSources: [],
            warnings: [],
            sources: [],
          },
          updatedAt: loadedAt,
        },
        createdAt: loadedAt,
        updatedAt: loadedAt,
      };
      const latestChapter = {
        ...initialChapter,
        diagnostics: {
          ...initialChapter.diagnostics,
          storyStateTracker: {
            chapterNumber: 8,
            parsed: false,
            outputChars: 8,
            failureReason: 'parse returned null',
            headExcerpt: 'not json',
            tailExcerpt: 'not json',
            checkedAt: backgroundAt,
          },
          truthFileHealth: {
            mode: 'observe',
            chapterNumber: 8,
            hasCurrentState: true,
            hasPendingHooks: true,
            hasCharacterMatrix: true,
            currentStateChapter: 7,
            pendingHooksChapter: 7,
            aligned: false,
            warnings: ['story-state snapshot parse failed'],
            checkedAt: backgroundAt,
          },
          updatedAt: backgroundAt,
        },
      };
      const novelManager = {
        getChapter: vi.fn()
          .mockResolvedValueOnce(initialChapter)
          .mockResolvedValueOnce(latestChapter),
        getNovel: vi.fn().mockResolvedValue({
          id: 'novel-1',
          title: 'Test Novel',
          synopsis: 'Test synopsis',
          genre: 'modern',
          tags: [],
        }),
        getCharacters: vi.fn().mockResolvedValue([]),
        getWorldEntries: vi.fn().mockResolvedValue([]),
        getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
        saveChapter: vi.fn().mockResolvedValue(undefined),
      };
      const pipeline = new FinalizePipeline(new Map(), novelManager, {});
      vi.spyOn(pipeline as any, 'determineFinalizeMode').mockResolvedValue('skip');

      await pipeline.finalize({
        novelId: 'novel-1',
        chapterNumber: 8,
      });

      expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-1', expect.objectContaining({
        status: 'finalized',
        updatedAt: finalizedAt,
        diagnostics: expect.objectContaining({
          memoryContextAudit: initialChapter.diagnostics.memoryContextAudit,
          storyStateTracker: latestChapter.diagnostics.storyStateTracker,
          truthFileHealth: latestChapter.diagnostics.truthFileHealth,
          updatedAt: backgroundAt,
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });
});
