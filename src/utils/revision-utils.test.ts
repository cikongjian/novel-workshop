import { describe, expect, it } from 'vitest';
import { extractReaderScore } from './revision-utils.js';

describe('extractReaderScore', () => {
  it('prefers structured overallScore over low dimension scores', () => {
    const feedback = JSON.stringify({
      overallScore: 6.2,
      pacing: '较差 (1.2/10)',
      dimensions: {
        pacing_rhythm: { score: 1.2, findings: [] },
      },
    }, null, 2);

    expect(extractReaderScore(feedback)).toBe(6.2);
  });

  it('falls back to legacy slash score text', () => {
    expect(extractReaderScore('综合来看本章 7.5/10，可以继续优化。')).toBe(7.5);
  });
});
