import type { QualityGateReport } from './quality-gate.js';

export type ReadabilityRepairAcceptance = {
  accepted: boolean;
  reason: string;
};

export function evaluateReadabilityRepairAcceptance(params: {
  initialScore: number;
  attemptedScore: number;
  previousReaderScore?: number;
  initialQuality?: QualityGateReport;
  attemptedQuality?: QualityGateReport;
}): ReadabilityRepairAcceptance {
  const {
    initialScore,
    attemptedScore,
    previousReaderScore,
    initialQuality,
    attemptedQuality,
  } = params;
  const avoidsPreviousChapterRegression = typeof previousReaderScore !== 'number'
    || attemptedScore >= previousReaderScore - 0.2;
  if (!avoidsPreviousChapterRegression) {
    return { accepted: false, reason: 'previous-reader-score-regression' };
  }

  const improvesReaderScore = attemptedScore > initialScore;
  const qualityStable = isQualityStable(initialQuality, attemptedQuality);
  if (improvesReaderScore && qualityStable) {
    return { accepted: true, reason: 'reader-score-improved' };
  }

  const qualityImproves = !initialQuality
    || !attemptedQuality
    || attemptedQuality.overallScore >= initialQuality.overallScore;
  if (attemptedScore >= initialScore && qualityImproves) {
    return { accepted: true, reason: 'quality-and-reader-stable' };
  }

  return {
    accepted: false,
    reason: improvesReaderScore ? 'quality-regression-too-large' : 'reader-score-not-improved',
  };
}

function isQualityStable(
  before: QualityGateReport | undefined,
  after: QualityGateReport | undefined,
): boolean {
  if (!before || !after) return true;
  return after.structureScore >= before.structureScore - 6
    && after.emotionScore >= before.emotionScore - 4
    && after.overallScore >= before.overallScore - 3
    && after.passed !== false;
}
