import { describe, expect, it } from 'vitest';
import {
  buildBackfillEmptyResponse,
  buildChapterTitleAuditInput,
  resolveChapterTitleGenerationOutcome,
  resolveTitleRewriteThreshold,
} from './title-route-support.js';

describe('title route support', () => {
  it('normalizes rewrite threshold to 0-100', () => {
    expect(resolveTitleRewriteThreshold(88)).toBe(88);
    expect(resolveTitleRewriteThreshold(999)).toBe(100);
    expect(resolveTitleRewriteThreshold(-3)).toBe(0);
    expect(resolveTitleRewriteThreshold('88')).toBeUndefined();
  });

  it('builds chapter title audit input with full content', () => {
    const input = buildChapterTitleAuditInput({
      novel: {
        title: '长夜余烬',
        synopsis: '一场废土复仇',
        genre: 'fantasy',
        tags: ['废土'],
        constitutionTags: ['强者流'],
        startupPlatformProfile: 'fanqie',
      },
      chapterNumber: 12,
      outline: '主角直面真相',
      summary: '旧敌现身',
      content: '甲'.repeat(700),
      recentTitles: ['旧日余烬', '血夜追缉'],
    });

    expect(input.outline).toBe('主角直面真相');
    expect(input.summary).toBe('旧敌现身');
    expect(input.fullContent).toBe('甲'.repeat(700));
    expect(input.recentTitles).toEqual(['旧日余烬', '血夜追缉']);
  });

  it('builds empty backfill responses', () => {
    expect(buildBackfillEmptyResponse({})).toEqual({
      updated: 0,
      message: '所有章节已有标题',
      threshold: 70,
    });
    expect(buildBackfillEmptyResponse({ rewriteBelowScore: 68 })).toEqual({
      updated: 0,
      message: '没有标题低于阈值 68 的章节',
      threshold: 68,
    });
  });

  it('keeps the original title in auto mode when the candidate does not pass replacement rules', () => {
    const outcome = resolveChapterTitleGenerationOutcome({
      currentTitle: 'A',
      generatedTitle: 'B',
      auditInput: {
        summary: '测试摘要',
        fullContent: '测试全文内容',
        recentTitles: [],
      },
    });

    expect(outcome.adopted).toBe(false);
    expect(outcome.title).toBe('A');
  });

  it('applies a different generated title in manual mode even when auto mode would keep the old one', () => {
    const outcome = resolveChapterTitleGenerationOutcome({
      currentTitle: 'A',
      generatedTitle: 'B',
      adoptionMode: 'manual',
      auditInput: {
        summary: '测试摘要',
        fullContent: '测试全文内容',
        recentTitles: [],
      },
    });

    expect(outcome.adopted).toBe(true);
    expect(outcome.forced).toBe(true);
    expect(outcome.title).toBe('B');
  });
});
