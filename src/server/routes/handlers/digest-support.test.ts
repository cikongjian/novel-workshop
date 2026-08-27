import { describe, expect, it } from 'vitest';
import {
  buildDigestOutlineContext,
  buildDigestSummary,
  resolveDigestTargetNumbers,
} from './digest-support.js';

describe('digest support', () => {
  it('resolves requested chapter numbers or falls back to all chapters', () => {
    expect(resolveDigestTargetNumbers({
      requestedChapters: [3, 5],
      allChapters: [{ chapterNumber: 1 }, { chapterNumber: 2 }],
    })).toEqual([3, 5]);

    expect(resolveDigestTargetNumbers({
      requestedChapters: [],
      allChapters: [{ chapterNumber: 1 }, { chapterNumber: 2 }],
    })).toEqual([1, 2]);
  });

  it('builds outline context and digest summary', () => {
    const context = buildDigestOutlineContext({
      chapterNumber: 8,
      outline: {
        chapters: [
          { chapterNumber: 8, title: '火线追击', keyEvents: ['围城', '破局'] },
        ],
      } as any,
    });
    expect(context).toContain('第8章大纲：火线追击');
    expect(context).toContain('围城；破局');

    const summary = buildDigestSummary({
      targetCount: 3,
      results: [
        { chapterNumber: 1, ok: true },
        { chapterNumber: 2, ok: false, error: '摘要解析失败' },
        { chapterNumber: 3, ok: true },
      ],
    });
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
  });
});
