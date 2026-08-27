import type { QualityGateReport } from './quality-gate.js';
import type { ReaderDeliveryAudit } from './reader-delivery-audit.js';

export type ReaderDeliveryRevisionAcceptance = {
  accepted: boolean;
  reason: string;
  deliveryGain: number;
  readabilityDelta: number;
};

const DELIVERY_GAIN_FLOOR = 0.5;
const READABILITY_FLOOR = 70;
const SIGNIFICANT_DELIVERY_GAIN_FLOOR = 3;
const SIGNIFICANT_READABILITY_GAIN_FLOOR = 8;
const MIN_SIGNIFICANT_READABILITY = 58;
const READABILITY_REGRESSION_TOLERANCE = 2;
const EMOTION_REGRESSION_TOLERANCE = 2;
const OVERALL_REGRESSION_TOLERANCE = 2;

export function evaluateReaderDeliveryRevisionCandidate(params: {
  candidateAudit: ReaderDeliveryAudit;
  bestAudit: ReaderDeliveryAudit;
  candidateScore: number;
  bestScore: number;
  candidateQuality?: QualityGateReport;
  bestQuality?: QualityGateReport;
  directionAnchorCoverageGain?: number;
}): ReaderDeliveryRevisionAcceptance {
  const {
    candidateAudit,
    bestAudit,
    candidateScore,
    bestScore,
    candidateQuality,
    bestQuality,
    directionAnchorCoverageGain = 0,
  } = params;
  const deliveryGain = candidateAudit.score - bestAudit.score;
  const readabilityDelta = candidateAudit.dimensions.readability - bestAudit.dimensions.readability;

  if (candidateQuality?.findings.some(finding => finding.code === 'ai-meta-leak')) {
    return {
      accepted: false,
      reason: 'ai-meta-leak-remains',
      deliveryGain,
      readabilityDelta,
    };
  }

  const significantBelowFloorImprovement = !candidateAudit.passed
    && candidateAudit.dimensions.readability < READABILITY_FLOOR
    && candidateAudit.dimensions.readability >= MIN_SIGNIFICANT_READABILITY
    && deliveryGain >= SIGNIFICANT_DELIVERY_GAIN_FLOOR
    && readabilityDelta >= SIGNIFICANT_READABILITY_GAIN_FLOOR;

  if (
    !candidateAudit.passed
    && candidateAudit.dimensions.readability < READABILITY_FLOOR
    && !significantBelowFloorImprovement
  ) {
    return {
      accepted: false,
      reason: 'readability-still-too-low',
      deliveryGain,
      readabilityDelta,
    };
  }

  if (readabilityDelta < -READABILITY_REGRESSION_TOLERANCE) {
    return {
      accepted: false,
      reason: 'readability-regression',
      deliveryGain,
      readabilityDelta,
    };
  }

  if (qualityRegressed(candidateQuality, bestQuality)) {
    return {
      accepted: false,
      reason: 'quality-regression',
      deliveryGain,
      readabilityDelta,
    };
  }

  const accepted = candidateAudit.passed
    || significantBelowFloorImprovement
    || deliveryGain > DELIVERY_GAIN_FLOOR
    || (
      Math.abs(deliveryGain) <= DELIVERY_GAIN_FLOOR
      && candidateScore > bestScore
    )
    || directionAnchorCoverageGain > 0.2;

  return {
    accepted,
    reason: significantBelowFloorImprovement
      ? 'reader-delivery-significant-improvement-below-floor'
      : accepted ? 'reader-delivery-improved' : 'reader-delivery-not-improved',
    deliveryGain,
    readabilityDelta,
  };
}

function qualityRegressed(
  candidate: QualityGateReport | undefined,
  best: QualityGateReport | undefined,
): boolean {
  if (!candidate || !best) return false;
  return candidate.emotionScore < best.emotionScore - EMOTION_REGRESSION_TOLERANCE
    || candidate.overallScore < best.overallScore - OVERALL_REGRESSION_TOLERANCE
    || (best.passed && !candidate.passed);
}
