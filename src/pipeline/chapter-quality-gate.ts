import type { AntiAiStructureThresholds, StylePreset } from './chapter-enhancement.js';
import {
  evaluateQualityGate,
  type QualityGateMode,
  type QualityGateReport,
  type QualityGateThresholds,
} from './quality-gate.js';

export type QualityFeatureThresholds = {
  passScore: number;
  minStructureScore: number;
  minStyleScore: number;
  minEmotionScore: number;
};

function adaptThresholdsByGenre(
  base: QualityGateThresholds,
  genre?: string,
): QualityGateThresholds {
  if (!genre) return base;
  const normalized = genre.toLowerCase();
  if (normalized === 'historical' || normalized === 'mystery') {
    return {
      ...base,
      passScore: Math.min(100, base.passScore + 1),
      minStructureScore: Math.min(100, base.minStructureScore + 2),
    };
  }
  if (normalized === 'romance') {
    return {
      ...base,
      passScore: Math.min(100, base.passScore + 1),
      minEmotionScore: Math.min(100, base.minEmotionScore + 3),
    };
  }
  if (normalized === 'scifi') {
    return {
      ...base,
      minStructureScore: Math.min(100, base.minStructureScore + 2),
      minStyleScore: Math.min(100, base.minStyleScore + 1),
    };
  }
  return base;
}

function buildQualityGateThresholds(features: QualityFeatureThresholds): QualityGateThresholds {
  return {
    passScore: features.passScore,
    minStructureScore: features.minStructureScore,
    minStyleScore: features.minStyleScore,
    minEmotionScore: features.minEmotionScore,
  };
}

export function evaluateChapterQualityGate(params: {
  chapterContent: string;
  scenePlan?: string;
  stylePreset?: StylePreset;
  antiAiStructure?: AntiAiStructureThresholds;
  gateMode: QualityGateMode;
  thresholds: QualityFeatureThresholds;
  genre?: string;
  enableGenreAdaptiveThresholds?: boolean;
  enableAiTellClusterGate?: boolean;
  domainStructureKeywords?: string[];
}): QualityGateReport {
  const baseThresholds = buildQualityGateThresholds(params.thresholds);
  const resolvedThresholds = params.enableGenreAdaptiveThresholds
    ? adaptThresholdsByGenre(baseThresholds, params.genre)
    : baseThresholds;
  return evaluateQualityGate({
    chapterContent: params.chapterContent,
    scenePlan: params.scenePlan,
    stylePreset: params.stylePreset,
    antiAiStructure: params.antiAiStructure,
    gateMode: params.gateMode,
    thresholds: resolvedThresholds,
    enableAiTellClusterGate: params.enableAiTellClusterGate,
    domainStructureKeywords: params.domainStructureKeywords,
  });
}
