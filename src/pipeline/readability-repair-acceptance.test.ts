import { describe, expect, it } from 'vitest';
import { evaluateReadabilityRepairAcceptance } from './readability-repair-acceptance.js';

function quality(overallScore: number, structureScore: number, emotionScore: number) {
  return {
    overallScore,
    structureScore,
    styleScore: 86,
    emotionScore,
    passed: true,
    gateMode: 'warn' as const,
    summary: '',
    findings: [],
  };
}

describe('evaluateReadabilityRepairAcceptance', () => {
  it('accepts reader-score improvement even when aggregate quality dips slightly', () => {
    const result = evaluateReadabilityRepairAcceptance({
      initialScore: 6.7,
      attemptedScore: 7.0,
      previousReaderScore: 6.9,
      initialQuality: quality(68.3, 56.5, 62.4),
      attemptedQuality: quality(66.8, 54.0, 61.0),
    });

    expect(result.accepted).toBe(true);
    expect(result.reason).toBe('reader-score-improved');
  });

  it('rejects repair that improves reader score by breaking structure too far', () => {
    const result = evaluateReadabilityRepairAcceptance({
      initialScore: 6.7,
      attemptedScore: 7.0,
      previousReaderScore: 6.9,
      initialQuality: quality(68.3, 56.5, 62.4),
      attemptedQuality: quality(60, 45, 58),
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('quality-regression-too-large');
  });
});
