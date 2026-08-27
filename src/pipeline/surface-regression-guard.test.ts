import { describe, expect, it } from 'vitest';
import { evaluateSurfaceRegression } from './surface-regression-guard.js';

describe('surface regression guard', () => {
  it('passes when a rewrite does not add dangling-subject defects', () => {
    const report = evaluateSurfaceRegression({
      beforeText: 'Lisa的声音从耳麦里传来。\n\n但林栀看见了。',
      afterText: 'Lisa的声音从耳麦里传来，压低了。\n\n但林栀看见了。',
    });

    expect(report.passed).toBe(true);
    expect(report.addedDefects).toBe(0);
  });

  it('rejects rewrites that remove visible sentence subjects', () => {
    const report = evaluateSurfaceRegression({
      beforeText: [
        'Lisa的声音从耳麦里传来，压低了，带着不确定。',
        '但林栀看见了。',
        '顾砚舟换了左手。',
        '林栀放下自己的刀，走到他身边。',
      ].join('\n\n'),
      afterText: [
        '的声音从耳麦里传来，压低了，带着不确定。',
        '但 看见了。',
        '换了左手。',
        '放下自己的刀，走到他身边。',
      ].join('\n\n'),
    });

    expect(report.passed).toBe(false);
    expect(report.addedDefects).toBeGreaterThanOrEqual(3);
    expect(report.examples.join('\n')).toContain('但 看见了');
  });
});
