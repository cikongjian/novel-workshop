import type { AgentOutput, AgentRole, AgentContext } from '../agents/types.js';
import { parseEditorOutput } from './editor-output-parser.js';
import { getAdaptiveTemperature } from './context-builders.js';
import { countInlineSpeakerMarkers } from './pipeline-utils.js';
import { evaluateChapterQualityGate } from './chapter-quality-gate.js';
import { auditGenreDrift } from './genre-drift-audit.js';
import { auditChapterReadability } from './readability-audit.js';
import type { DeterministicReaderInput } from './deterministic-reader.js';
import { synthesizeDeterministicReader } from './deterministic-reader.js';
import { parseReaderScore } from './context-builders.js';

export interface QualityGateParams {
  scenePlan: string;
  stylePreset: string;
  antiAiStructure: unknown;
  gateMode: string;
  thresholds: unknown;
  genre: string;
  enableGenreAdaptiveThresholds: boolean;
  enableAiTellClusterGate: boolean;
  domainStructureKeywords: string[];
}

export interface ReadabilityRepairOptions {
  enabled: boolean;
  shouldRepair: boolean;
  hints: string;
  reasons: string[];
  chapterContent: string;
  finalEditedContent: string;
  readerContent: string;
  qualityReport?: { overallScore?: number; emotionScore?: number; structureScore?: number; findings: Array<{ code: string }> };
  initialScore: number;
  previousReaderScore?: number;
  useLlmReader: boolean;
  baseContext: Omit<AgentContext, 'inputText'>;
  editorContext: Omit<AgentContext, 'inputText'>;
  scenePlan?: string;
  outlineContract?: string;
  worldContract?: string;
  structuredAuditEnabled: boolean;
  qualityParams: QualityGateParams;
  novelTitle: string;
  novelSynopsis: string;
  novelGenre: string;
  novelTags?: string[];
  constitutionTags?: string[];
  promiseContract?: unknown;
  runAgent: (role: AgentRole, ctx: AgentContext) => Promise<AgentOutput>;
  allOutputs: AgentOutput[];
  traceStage: (name: string, content: string, meta?: Record<string, unknown>) => void;
  pipelineLog: { debug: (msg: string, meta?: Record<string, unknown>) => void };
  otherReports: Omit<DeterministicReaderInput, 'chapterContent' | 'qualityReport'>;
}

export interface ReadabilityRepairResult {
  polishedText: string;
  finalEditedContent: string;
  qualityReport?: { overallScore?: number; emotionScore?: number; structureScore?: number; findings: Array<{ code: string }> };
  readerContent: string;
  readerScore: number;
  repairAccepted: boolean;
}

export async function runReadabilityRepair(
  options: ReadabilityRepairOptions,
): Promise<ReadabilityRepairResult> {
  const {
    enabled,
    shouldRepair,
    hints,
    reasons,
    chapterContent,
    finalEditedContent,
    readerContent,
    qualityReport,
    initialScore,
    previousReaderScore,
    useLlmReader,
    baseContext,
    editorContext,
    scenePlan,
    outlineContract,
    worldContract,
    structuredAuditEnabled,
    qualityParams,
    novelTitle,
    novelSynopsis,
    novelGenre,
    novelTags,
    constitutionTags,
    promiseContract,
    runAgent,
    traceStage,
    otherReports,
  } = options;

  const result: ReadabilityRepairResult = {
    polishedText: chapterContent,
    finalEditedContent,
    qualityReport,
    readerContent,
    readerScore: initialScore,
    repairAccepted: false,
  };

  if (!enabled || !shouldRepair) {
    return result;
  }

  const repairEditorCtx: AgentContext = {
    ...editorContext,
    inputText: chapterContent,
    outlineContract: outlineContract || undefined,
    worldContract,
    qualityGateFixHints: hints,
    temperatureOverride: getAdaptiveTemperature('editor', false),
  };
  const repairEditorOutput = await runAgent('editor', repairEditorCtx);
  const repairParsed = parseEditorOutput(repairEditorOutput.content);

  if (!repairParsed.polishedText) {
    return result;
  }

  const beforeRepairText = chapterContent;
  const beforeRepairEditedContent = finalEditedContent;
  const beforeRepairReaderContent = readerContent;
  const beforeRepairQualityReport = qualityReport;
  const beforeSpeakerMarkers = countInlineSpeakerMarkers(chapterContent);

  let currentPolished = repairParsed.polishedText;
  let currentFinalEdited = repairEditorOutput.content;

  traceStage('readability-repair.editor', currentPolished, { reasons });

  const repairedQualityReport = evaluateChapterQualityGate({
    chapterContent: currentPolished,
    scenePlan: qualityParams.scenePlan,
    stylePreset: qualityParams.stylePreset as never,
    antiAiStructure: qualityParams.antiAiStructure as never,
    gateMode: qualityParams.gateMode as never,
    thresholds: qualityParams.thresholds as never,
    genre: qualityParams.genre,
    enableGenreAdaptiveThresholds: qualityParams.enableGenreAdaptiveThresholds,
    enableAiTellClusterGate: qualityParams.enableAiTellClusterGate,
    domainStructureKeywords: qualityParams.domainStructureKeywords,
  }) as unknown as ReadabilityRepairResult['qualityReport'];

  const genreDriftBeforeRepair = auditGenreDrift({
    chapterContent: beforeRepairText,
    title: novelTitle,
    synopsis: novelSynopsis,
    genre: novelGenre,
    tags: novelTags,
    constitutionTags,
    promiseContract: promiseContract as never,
  });

  const repairedGenreDrift = auditGenreDrift({
    chapterContent: currentPolished,
    title: novelTitle,
    synopsis: novelSynopsis,
    genre: novelGenre,
    tags: novelTags,
    constitutionTags,
    promiseContract: promiseContract as never,
  });

  const afterSpeakerMarkers = countInlineSpeakerMarkers(currentPolished);
  let repairAccepted = false;
  let repairedReaderContent = beforeRepairReaderContent;
  let repairedReaderScore = initialScore;

  const beforeReadabilityAudit = auditChapterReadability({
    chapterContent: beforeRepairText,
    readerScore: initialScore,
    previousReaderScore,
    qualityGate: beforeRepairQualityReport as never,
    genreDrift: genreDriftBeforeRepair,
  });

  const repairedReadabilityAudit = auditChapterReadability({
    chapterContent: currentPolished,
    readerScore: initialScore,
    previousReaderScore,
    qualityGate: repairedQualityReport as never,
    genreDrift: repairedGenreDrift,
  });

  const readabilityFloorImproved = !beforeReadabilityAudit.qualityFloorPassed
    && repairedReadabilityAudit.qualityFloorPassed;
  const silentReactionImproved = repairedReadabilityAudit.silentReactionCount <= Math.max(
    0,
    beforeReadabilityAudit.silentReactionCount - 2,
  );
  const readabilityIssueImproved = repairedReadabilityAudit.issues.length < beforeReadabilityAudit.issues.length;
  const genreDriftImproved = !genreDriftBeforeRepair.qualityFloorPassed
    && (
      repairedGenreDrift.qualityFloorPassed
      || repairedGenreDrift.promiseDrift.suspenseHits < genreDriftBeforeRepair.promiseDrift.suspenseHits
      || repairedGenreDrift.promiseDrift.suspenseShare < genreDriftBeforeRepair.promiseDrift.suspenseShare
    );
  const qualityDropWithinRepairTolerance = (repairedQualityReport?.overallScore ?? 0) >= (beforeRepairQualityReport?.overallScore ?? 0) - 1
    && (repairedQualityReport?.emotionScore ?? 0) >= (beforeRepairQualityReport?.emotionScore ?? 0) - 2
    && (repairedQualityReport?.structureScore ?? 0) >= (beforeRepairQualityReport?.structureScore ?? 0) - 5;
  const readabilityImproved = (
    readabilityFloorImproved
    || silentReactionImproved
    || readabilityIssueImproved
    || genreDriftImproved
  ) && qualityDropWithinRepairTolerance;

  const structureNeedsImprovement = (beforeRepairQualityReport?.structureScore ?? 100) < 55;
  const emotionNeedsImprovement = (beforeRepairQualityReport?.emotionScore ?? 100) < 50;
  const stalledNeedsImprovement = Boolean(
    beforeRepairQualityReport?.findings.some(finding => finding.code === 'stalled-momentum')
    && (beforeRepairQualityReport?.emotionScore ?? 100) < 65,
  );
  const repairedStillStalled = repairedQualityReport?.findings.some(finding => finding.code === 'stalled-momentum');

  if (afterSpeakerMarkers > beforeSpeakerMarkers) {
    currentPolished = beforeRepairText;
    currentFinalEdited = beforeRepairEditedContent;
    traceStage('readability-repair.reverted', currentPolished, {
      beforeSpeakerMarkers,
      afterSpeakerMarkers,
      reason: 'speaker-marker-regression',
    });
  } else if (
    !beforeRepairQualityReport
    || (
      (repairedQualityReport?.overallScore ?? 0) >= (beforeRepairQualityReport?.overallScore ?? 0)
      && (repairedQualityReport?.emotionScore ?? 0) >= (beforeRepairQualityReport?.emotionScore ?? 0)
      && (!structureNeedsImprovement || (repairedQualityReport?.structureScore ?? 0) > (beforeRepairQualityReport?.structureScore ?? 0))
      && (!emotionNeedsImprovement || (repairedQualityReport?.emotionScore ?? 0) > (beforeRepairQualityReport?.emotionScore ?? 0))
      && (!stalledNeedsImprovement || !repairedStillStalled || (repairedQualityReport?.emotionScore ?? 0) >= (beforeRepairQualityReport?.emotionScore ?? 0) + 3)
    )
    || readabilityImproved
  ) {
    if (useLlmReader) {
      const repairReaderCtx: AgentContext = {
        ...baseContext,
        scenePlan,
        outlineContract: outlineContract || undefined,
        worldContract,
        inputText: currentPolished,
        temperatureOverride: getAdaptiveTemperature('reader', false),
        useStructuredAudit: structuredAuditEnabled,
      };
      const repairedReaderOutput = await runAgent('reader', repairReaderCtx);
      repairedReaderContent = repairedReaderOutput.content;
    } else {
      repairedReaderContent = synthesizeDeterministicReader({
        chapterContent: currentPolished,
        qualityReport: repairedQualityReport as never,
        ...otherReports,
      });
    }
    repairedReaderScore = parseReaderScore(repairedReaderContent);
    const avoidsPreviousChapterRegression = typeof previousReaderScore !== 'number'
      || repairedReaderScore >= previousReaderScore - 0.2;
    if (repairedReaderScore >= initialScore && avoidsPreviousChapterRegression) {
      repairAccepted = true;
    } else if (readabilityImproved && repairedReaderScore >= initialScore - 0.1 && avoidsPreviousChapterRegression) {
      repairAccepted = true;
    } else {
      currentPolished = beforeRepairText;
      currentFinalEdited = beforeRepairEditedContent;
      traceStage('readability-repair.reverted', currentPolished, {
        beforeReaderScore: initialScore,
        afterReaderScore: repairedReaderScore,
        previousReaderScore,
        beforeScore: beforeRepairQualityReport?.overallScore,
        afterScore: repairedQualityReport?.overallScore,
        beforeEmotion: beforeRepairQualityReport?.emotionScore,
        afterEmotion: repairedQualityReport?.emotionScore,
        beforeReadabilityIssues: beforeReadabilityAudit.issues.length,
        afterReadabilityIssues: repairedReadabilityAudit.issues.length,
        beforeSilentReactionCount: beforeReadabilityAudit.silentReactionCount,
        afterSilentReactionCount: repairedReadabilityAudit.silentReactionCount,
        beforeGenreDriftPassed: genreDriftBeforeRepair.qualityFloorPassed,
        afterGenreDriftPassed: repairedGenreDrift.qualityFloorPassed,
        beforeSuspenseShare: genreDriftBeforeRepair.promiseDrift.suspenseShare,
        afterSuspenseShare: repairedGenreDrift.promiseDrift.suspenseShare,
        reason: avoidsPreviousChapterRegression ? 'reader-score-regression' : 'previous-reader-score-regression',
      });
    }
  } else {
    currentPolished = beforeRepairText;
    currentFinalEdited = beforeRepairEditedContent;
    traceStage('readability-repair.reverted', currentPolished, {
      beforeScore: beforeRepairQualityReport?.overallScore,
      afterScore: repairedQualityReport?.overallScore,
      beforeEmotion: beforeRepairQualityReport?.emotionScore,
      afterEmotion: repairedQualityReport?.emotionScore,
      beforeReadabilityIssues: beforeReadabilityAudit.issues.length,
      afterReadabilityIssues: repairedReadabilityAudit.issues.length,
      beforeSilentReactionCount: beforeReadabilityAudit.silentReactionCount,
      afterSilentReactionCount: repairedReadabilityAudit.silentReactionCount,
      beforeGenreDriftPassed: genreDriftBeforeRepair.qualityFloorPassed,
      afterGenreDriftPassed: repairedGenreDrift.qualityFloorPassed,
      beforeSuspenseShare: genreDriftBeforeRepair.promiseDrift.suspenseShare,
      afterSuspenseShare: repairedGenreDrift.promiseDrift.suspenseShare,
    });
  }

  if (repairAccepted) {
    result.polishedText = currentPolished;
    result.finalEditedContent = currentFinalEdited;
    result.qualityReport = repairedQualityReport;
    result.readerContent = repairedReaderContent;
    result.readerScore = repairedReaderScore;
    result.repairAccepted = true;
  } else {
    result.readerContent = beforeRepairReaderContent;
    result.readerScore = parseReaderScore(beforeRepairReaderContent);
  }

  return result;
}
