import { describe, expect, it } from 'vitest';
import {
  buildAbComparisons,
  buildScenePlan,
  computeAverageDelta,
  round1,
} from './commercial-ab-test-support.js';

describe('commercial ab test support', () => {
  it('rounds to one decimal place', () => {
    expect(round1(1.26)).toBe(1.3);
    expect(round1(-0.04)).toBe(0);
  });

  it('builds scene plan from non-empty beats only', () => {
    expect(buildScenePlan([
      { summary: '主角踏入禁区' },
      { summary: ' ' },
      {},
    ])).toBe('- 场景1：主角踏入禁区');
  });

  it('builds comparisons and average delta', () => {
    const comparisons = buildAbComparisons(
      [
        {
          sample: { label: '样本A', novelId: 'n1', chapterNumber: 3 },
          score: { overall: 70, structure: 68, style: 72, emotion: 74, summary: 'base' },
          skillCount: 1,
        },
      ],
      [
        {
          sample: { label: '样本A', novelId: 'n1', chapterNumber: 3 },
          score: { overall: 73.24, structure: 69.04, style: 75.06, emotion: 76.96, summary: 'enhanced' },
          skillCount: 3,
        },
      ],
    );

    expect(comparisons).toEqual([
      {
        label: '样本A',
        novelId: 'n1',
        chapterNumber: 3,
        skillCountBefore: 1,
        skillCountAfter: 3,
        before: { overall: 70, structure: 68, style: 72, emotion: 74, summary: 'base' },
        after: { overall: 73.24, structure: 69.04, style: 75.06, emotion: 76.96, summary: 'enhanced' },
        delta: { overall: 3.2, structure: 1, style: 3.1, emotion: 3 },
      },
    ]);
    expect(computeAverageDelta(comparisons)).toEqual({
      overall: 3.2,
      structure: 1,
      style: 3.1,
      emotion: 3,
    });
  });
});
