import { describe, expect, it } from 'vitest';
import {
  getFinalChapterLengthViolation,
  recoverFinalUnderLengthChapter,
} from './final-chapter-length-recovery.js';

describe('recoverFinalUnderLengthChapter', () => {
  it('adopts an expanded candidate inside the allowed range', async () => {
    const result = await recoverFinalUnderLengthChapter({
      text: '原文。'.repeat(300),
      targetWordCount: 3000,
      expand: async () => '扩写正文。'.repeat(520),
      validateCandidate: () => ({ passed: true }),
    });

    expect(result.report).toMatchObject({ attempted: true, applied: true });
    expect(result.content.length).toBeGreaterThanOrEqual(2400);
    expect(result.content.length).toBeLessThanOrEqual(3150);
  });

  it('keeps the source when expansion remains too short', async () => {
    const source = '原文。'.repeat(300);
    const result = await recoverFinalUnderLengthChapter({
      text: source,
      targetWordCount: 3000,
      expand: async () => '仍然太短。'.repeat(200),
    });

    expect(result.content).toBe(source);
    expect(result.report).toMatchObject({ attempted: true, applied: false });
    expect(result.report?.reason).toContain('below allowed min');
  });

  it('keeps the source when regression validation rejects the candidate', async () => {
    const source = '原文。'.repeat(300);
    const result = await recoverFinalUnderLengthChapter({
      text: source,
      targetWordCount: 3000,
      expand: async () => '扩写正文。'.repeat(520),
      validateCandidate: () => ({ passed: false, reason: 'character regression' }),
    });

    expect(result.content).toBe(source);
    expect(result.report).toMatchObject({ attempted: true, applied: false, reason: 'character regression' });
  });

  it('does not call the expander when the source already meets the minimum', async () => {
    let called = false;
    const source = '正文。'.repeat(850);
    const result = await recoverFinalUnderLengthChapter({
      text: source,
      targetWordCount: 3000,
      expand: async () => {
        called = true;
        return source;
      },
    });

    expect(called).toBe(false);
    expect(result).toEqual({ content: source });
  });

  it('blocks final content that remains below the allowed minimum', () => {
    expect(getFinalChapterLengthViolation({
      text: '短章。'.repeat(400),
      targetWordCount: 3000,
    })).toContain('below allowed min 2400');
    expect(getFinalChapterLengthViolation({
      text: '正文。'.repeat(850),
      targetWordCount: 3000,
    })).toBeUndefined();
  });

  it('allows explicit length-guard bypasses', () => {
    expect(getFinalChapterLengthViolation({
      text: '短章。',
      targetWordCount: 3000,
      skip: true,
    })).toBeUndefined();
  });
});
