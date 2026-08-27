import { describe, expect, it } from 'vitest';
import type { QualityGateReport } from './quality-gate.js';
import type { ReaderDeliveryAudit } from './reader-delivery-audit.js';
import { evaluateReaderDeliveryRevisionCandidate } from './reader-delivery-revision-acceptance.js';

function audit(score: number, readability: number, passed = false): ReaderDeliveryAudit {
  return {
    score,
    passed,
    issues: [],
    suggestions: [],
    dimensions: {
      title: 88,
      opening: 90,
      promisePayoff: 90,
      readability,
      endingHook: 88,
      publicSurface: 88,
    },
  };
}

function quality(overallScore: number, emotionScore: number, passed = true): QualityGateReport {
  return {
    gateMode: 'warn',
    structureScore: 90,
    styleScore: 88,
    emotionScore,
    overallScore,
    findings: [],
    passed,
    summary: '',
  };
}

it('rejects a revision candidate that still leaks chapter metadata', () => {
  const candidateQuality = quality(86, 70);
  candidateQuality.findings.push({
    code: 'ai-meta-leak',
    level: 'warn',
    message: '正文引用第N章',
  });
  const result = evaluateReaderDeliveryRevisionCandidate({
    bestAudit: audit(80, 60),
    candidateAudit: audit(88, 76, true),
    bestScore: 7.5,
    candidateScore: 8,
    bestQuality: quality(82, 55),
    candidateQuality,
  });

  expect(result).toMatchObject({ accepted: false, reason: 'ai-meta-leak-remains' });
});

describe('evaluateReaderDeliveryRevisionCandidate', () => {
  it('rejects delivery-score gain when readability remains too low', () => {
    const result = evaluateReaderDeliveryRevisionCandidate({
      bestAudit: audit(77.7, 55),
      candidateAudit: audit(81.5, 56),
      bestScore: 7.6,
      candidateScore: 7.7,
      bestQuality: quality(81.2, 45.5, false),
      candidateQuality: quality(83.4, 48.9, false),
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('readability-still-too-low');
  });

  it('accepts a delivery gain when readability recovers into a readable band', () => {
    const result = evaluateReaderDeliveryRevisionCandidate({
      bestAudit: audit(77.7, 55),
      candidateAudit: audit(85.2, 72),
      bestScore: 7.6,
      candidateScore: 7.8,
      bestQuality: quality(81.2, 45.5, false),
      candidateQuality: quality(83.4, 48.9, false),
    });

    expect(result.accepted).toBe(true);
    expect(result.reason).toBe('reader-delivery-improved');
  });

  it('accepts a significant below-floor readability improvement over a weak original', () => {
    const result = evaluateReaderDeliveryRevisionCandidate({
      bestAudit: audit(74, 50),
      candidateAudit: audit(78, 60),
      bestScore: 7.1,
      candidateScore: 7.1,
      bestQuality: quality(80, 43, true),
      candidateQuality: quality(81, 45, true),
    });

    expect(result.accepted).toBe(true);
    expect(result.reason).toBe('reader-delivery-significant-improvement-below-floor');
  });

  it('rejects later rounds that trade away readability from the best candidate', () => {
    const result = evaluateReaderDeliveryRevisionCandidate({
      bestAudit: audit(85.2, 72),
      candidateAudit: audit(86, 65),
      bestScore: 7.8,
      candidateScore: 7.9,
      bestQuality: quality(83.4, 48.9, false),
      candidateQuality: quality(84, 49, false),
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('readability-still-too-low');
  });

  it('rejects delivery gain that drops emotion quality from a better candidate', () => {
    const result = evaluateReaderDeliveryRevisionCandidate({
      bestAudit: audit(85.2, 74),
      candidateAudit: audit(87, 75),
      bestScore: 7.8,
      candidateScore: 7.9,
      bestQuality: quality(84, 58),
      candidateQuality: quality(83, 54),
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('quality-regression');
  });
});
