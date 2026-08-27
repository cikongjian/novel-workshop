import { describe, expect, it } from 'vitest';
import {
  buildChapterLengthGuardFeedback,
  buildChapterLengthFallbackTrim,
  buildChapterUnderLengthGuardFeedback,
  buildChapterLengthGuardSummary,
  enforceFinalChapterLengthLimit,
  finalizeChapterLengthGuardAudit,
  resolveLengthGuardMin,
  resolveLengthGuardMax,
  shouldTriggerChapterUnderLengthGuard,
  shouldTriggerChapterLengthGuard,
  trimChapterToSentenceBoundary,
} from './chapter-length-guard.js';

describe('chapter-length-guard', () => {
  it('triggers when chapter badly exceeds target', () => {
    expect(shouldTriggerChapterLengthGuard(12000, 3000)).toBe(true);
    expect(resolveLengthGuardMax(3000)).toBeGreaterThan(3000);
  });

  it('triggers when chapter is badly shorter than target', () => {
    expect(shouldTriggerChapterUnderLengthGuard(1200, 3000)).toBe(true);
    expect(resolveLengthGuardMin(3000)).toBeLessThan(3000);
  });

  it('builds clear compression feedback', () => {
    expect(buildChapterLengthGuardFeedback({ targetWordCount: 3000, actualWordCount: 12000 })).toContain('字数纠偏任务');
  });

  it('builds clear expansion feedback', () => {
    expect(buildChapterUnderLengthGuardFeedback({ targetWordCount: 3000, actualWordCount: 1200 })).toContain('字数补全任务');
    expect(buildChapterUnderLengthGuardFeedback({ targetWordCount: 3000, actualWordCount: 1200 })).toContain('不得把“林栀看见了”');
  });

  it('trims to a sentence boundary near target', () => {
    const content = '第一句。第二句。第三句。第四句。第五句。第六句。';
    const trimmed = trimChapterToSentenceBoundary(content, 10);
    expect(trimmed.length).toBeLessThanOrEqual(resolveLengthGuardMax(10));
    expect(trimmed.endsWith('。')).toBe(true);
  });

  it('preserves ending hook when fallback trimming a long chapter', () => {
    const head = Array.from({ length: 30 }, (_, index) => `开头推进第${index}段。动作落地，局势变化。`).join('\n\n');
    const middle = Array.from({ length: 40 }, (_, index) => `中段解释第${index}段。这里可以压缩，不能压掉章末钩子。`).join('\n\n');
    const tail = [
      '铁门上的字消失了。',
      '苏清月回头看沈忠：“你听到那个声音了吗？”',
      '沈忠点头，手指按在刀柄上。',
      '石壁里的锁芯又转了一下，像有人在门外拔出了第二把钥匙。',
      '下一刻，门缝里传来沈渊的声音：“别开。”',
      '苏清月的手停在门上。',
    ].join('\n\n');

    const trimmed = trimChapterToSentenceBoundary(`${head}\n\n${middle}\n\n${tail}`, 900);

    expect(trimmed.length).toBeLessThanOrEqual(resolveLengthGuardMax(900));
    expect(trimmed).toContain('下一刻，门缝里传来沈渊的声音');
    expect(trimmed.endsWith('苏清月的手停在门上。')).toBe(true);
  });

  it('reports whether fallback trimming actually shortened the chapter', () => {
    const longText = Array.from({ length: 80 }, (_, index) => `第${index}段推进结果。`).join('\n\n');
    const trimmed = buildChapterLengthFallbackTrim(longText, 300);
    const unchanged = buildChapterLengthFallbackTrim('短章正文。', 300);

    expect(trimmed.applied).toBe(true);
    expect(trimmed.content.length).toBeLessThanOrEqual(resolveLengthGuardMax(300));
    expect(unchanged).toEqual({ content: '短章正文。', applied: false });
  });

  it('enforces the allowed max after a late-stage rewrite expands the chapter', () => {
    const lateRewrite = Array.from({ length: 250 }, (_, index) => `第${index}段推进结果落地。`).join('\n\n');
    expect(shouldTriggerChapterLengthGuard(lateRewrite.length, 3000)).toBe(false);

    const result = enforceFinalChapterLengthLimit({
      text: lateRewrite,
      targetWordCount: 3000,
    });

    expect(result.content.length).toBeLessThanOrEqual(resolveLengthGuardMax(3000));
    expect(result.audit).toMatchObject({
      triggered: true,
      direction: 'ok',
      usedFallbackTrim: true,
      finalWordCount: result.content.length,
    });
  });

  it('reports guard summary', () => {
    const summary = buildChapterLengthGuardSummary(12000, 3000);
    expect(summary.triggered).toBe(true);
    expect(summary.summary).toContain('triggered');
  });

  it('reports under-length summary', () => {
    const summary = buildChapterLengthGuardSummary(1200, 3000);
    expect(summary.triggered).toBe(true);
    expect(summary.direction).toBe('under');
    expect(summary.summary).toContain('allowed min');
  });

  it('records final overrun even when earlier length guard did not run', () => {
    const audit = finalizeChapterLengthGuardAudit({
      finalWordCount: 3314,
      targetWordCount: 2400,
    });

    expect(audit).toEqual(expect.objectContaining({
      triggered: true,
      direction: 'over',
      targetWordCount: 2400,
      actualWordCount: 3314,
      finalWordCount: 3314,
      attemptedCompression: false,
      attemptedExpansion: false,
      usedFallbackTrim: false,
    }));
    expect(audit?.summary).toContain('final chapter length exceeds allowed max');
  });

  it('keeps existing compression metadata when final length is audited', () => {
    const audit = finalizeChapterLengthGuardAudit({
      existing: {
        ...buildChapterLengthGuardSummary(4000, 2400),
        attemptedCompression: true,
        attemptedExpansion: false,
        usedFallbackTrim: true,
        finalWordCount: 2520,
      },
      finalWordCount: 2600,
      targetWordCount: 2400,
    });

    expect(audit).toEqual(expect.objectContaining({
      attemptedCompression: true,
      usedFallbackTrim: true,
      finalWordCount: 2600,
    }));
  });
});
