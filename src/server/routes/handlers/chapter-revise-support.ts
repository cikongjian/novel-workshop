import type { AgentContext } from '../../../agents/types.js';
import type { AgentComment, Chapter } from '../../../novel/types.js';
import type { QualityGateReport } from '../../../pipeline/quality-gate.js';
import { buildChapterCost } from '../../../cost/build-chapter-cost.js';
import { buildStyleGuide } from '../../../pipeline/chapter-enhancement.js';
import { evaluateQualityGate } from '../../../pipeline/quality-gate.js';
import { getConfig } from '../../../config/index.js';
import { buildScenePlanFromOutlineData } from '../../../utils/outline-extractors.js';
import {
  buildRevisionCharacterContext,
  buildRevisionQualityBoostFeedback,
  buildRevisionWorldContext,
  extractReaderScore,
  isRevisionQualityBetter,
  roundRevisionScore,
  toRevisionQualitySnapshot,
} from '../../../utils/revision-utils.js';
import { buildGenreTraceOverrides } from './chapter-route-support.js';
import type { GenerateDeps } from './types.js';
import {
  REVISION_AUTO_POLISH_MAX_ROUNDS,
  REVISION_MIN_EXPECTED_DELTA,
} from './types.js';

type RevisionResult = Awaited<ReturnType<GenerateDeps['revisionPipeline']['reviseChapter']>>;

export function buildRevisionOriginalContext(params: {
  novel: {
    id: string;
    genre: string;
    title: string;
    synopsis: string;
  };
  chapterNumber: number;
  outlineData: Awaited<ReturnType<GenerateDeps['novelManager']['getOutline']>>;
  characters: Awaited<ReturnType<GenerateDeps['novelManager']['getCharacters']>>;
  worldEntries: Awaited<ReturnType<GenerateDeps['novelManager']['getWorldEntries']>>;
}): {
  originalContext: AgentContext;
  scenePlan?: string;
} {
  const chapterOutline = params.outlineData.chapters.find((item) => item.chapterNumber === params.chapterNumber);
  const scenePlan = buildScenePlanFromOutlineData(chapterOutline);
  const unresolvedForeshadowing = params.outlineData.foreshadowing
    .filter((item) => !item.isResolved)
    .slice(0, 4)
    .map((item) => `- ${item.hint}`)
    .join('\n');
  return {
    originalContext: {
      novelId: params.novel.id,
      genre: params.novel.genre,
      novelTitle: params.novel.title,
      novelSynopsis: params.novel.synopsis,
      chapterNumber: params.chapterNumber,
      outlineContext: chapterOutline?.summary || undefined,
      scenePlan,
      unresolvedForeshadowing: unresolvedForeshadowing || undefined,
      characterContext: buildRevisionCharacterContext(params.characters),
      worldContext: buildRevisionWorldContext(params.worldEntries),
    },
    scenePlan,
  };
}

export function createRevisionQualityEvaluator(params: {
  genre: string;
  scenePlan?: string;
}): (content: string) => QualityGateReport {
  const stylePreset = buildStyleGuide({ genre: params.genre }).resolvedPreset;
  const cfg = getConfig();
  const thresholds = {
    passScore: cfg.qualityFeatures.passScore,
    minStructureScore: cfg.qualityFeatures.minStructureScore,
    minStyleScore: cfg.qualityFeatures.minStyleScore,
    minEmotionScore: cfg.qualityFeatures.minEmotionScore,
  };
  return (content: string) => evaluateQualityGate({
    chapterContent: content,
    scenePlan: params.scenePlan,
    stylePreset,
    gateMode: 'strict',
    thresholds,
  });
}

export async function runRevisionWithAutoBoost(params: {
  deps: GenerateDeps;
  novelId: string;
  chapterNumber: number;
  feedback: string;
  chapterContent: string;
  novelGenre: string;
  originalContext: AgentContext;
  enableAiMarkerGuard?: boolean;
  aiMarkerGuardThreshold?: number;
  mode?: 'rewrite' | 'spot-fix';
  modelOverride?: GenerateDeps['modelClient'];
  beforeQuality: QualityGateReport;
  scenePlan?: string;
}): Promise<{
  finalResult: RevisionResult;
  finalContent: string;
  afterQuality: QualityGateReport;
  autoBoostAttempted: boolean;
  autoBoostApplied: boolean;
  revisionCostOutputs: RevisionResult['agentOutputs'];
}> {
  const genreTraceOverrides = buildGenreTraceOverrides(params.novelGenre);
  const evaluateRevisionQuality = createRevisionQualityEvaluator({
    genre: params.novelGenre,
    scenePlan: params.scenePlan,
  });
  const firstResult = await params.deps.revisionPipeline.reviseChapter({
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    feedback: params.feedback,
    originalContext: params.originalContext,
    previousContent: params.chapterContent,
    modelOverride: params.modelOverride,
    enableAiMarkerGuard: params.enableAiMarkerGuard,
    aiMarkerGuardThreshold: params.aiMarkerGuardThreshold,
    genreOverrides: genreTraceOverrides,
    mode: params.mode,
    onEvent: (event) => {
      params.deps.broadcast(event);
    },
  });

  const revisionCostOutputs = [...firstResult.agentOutputs];
  let finalResult = firstResult;
  let finalContent = firstResult.revisedContent ?? params.chapterContent;
  let afterQuality = evaluateRevisionQuality(finalContent);
  let autoBoostAttempted = false;
  let autoBoostApplied = false;

  for (let round = 0; round < REVISION_AUTO_POLISH_MAX_ROUNDS; round += 1) {
    const delta = roundRevisionScore(afterQuality.overallScore - params.beforeQuality.overallScore);
    if (delta >= REVISION_MIN_EXPECTED_DELTA) {
      break;
    }

    autoBoostAttempted = true;
    const boostFeedback = buildRevisionQualityBoostFeedback({
      originalFeedback: params.feedback,
      beforeQuality: params.beforeQuality,
      afterQuality,
      minExpectedDelta: REVISION_MIN_EXPECTED_DELTA,
      roundNumber: round + 1,
      stylePreset: buildStyleGuide({ genre: params.novelGenre }).resolvedPreset,
      scenePlan: params.scenePlan,
    });
    const boostResult = await params.deps.revisionPipeline.reviseChapter({
      novelId: params.novelId,
      chapterNumber: params.chapterNumber,
      feedback: boostFeedback,
      originalContext: params.originalContext,
      previousContent: finalContent,
      modelOverride: params.modelOverride,
      enableAiMarkerGuard: params.enableAiMarkerGuard,
      aiMarkerGuardThreshold: params.aiMarkerGuardThreshold,
      genreOverrides: genreTraceOverrides,
      mode: params.mode,
      onEvent: (event) => {
        params.deps.broadcast(event);
      },
    });
    revisionCostOutputs.push(...boostResult.agentOutputs);
    if (!boostResult.revisedContent) {
      break;
    }

    const boostedQuality = evaluateRevisionQuality(boostResult.revisedContent);
    if (!isRevisionQualityBetter(boostedQuality, afterQuality)) {
      break;
    }

    finalResult = boostResult;
    finalContent = boostResult.revisedContent;
    afterQuality = boostedQuality;
    autoBoostApplied = true;
  }

  return {
    finalResult,
    finalContent,
    afterQuality,
    autoBoostAttempted,
    autoBoostApplied,
    revisionCostOutputs,
  };
}

export function buildRevisionQualityDeltaPayload(params: {
  beforeQuality: QualityGateReport;
  afterQuality: QualityGateReport;
  autoBoostAttempted: boolean;
  autoBoostApplied: boolean;
}) {
  return {
    before: toRevisionQualitySnapshot(params.beforeQuality),
    after: toRevisionQualitySnapshot(params.afterQuality),
    deltaOverall: roundRevisionScore(params.afterQuality.overallScore - params.beforeQuality.overallScore),
    targetDelta: REVISION_MIN_EXPECTED_DELTA,
    autoBoostAttempted: params.autoBoostAttempted,
    autoBoostApplied: params.autoBoostApplied,
  };
}

export async function finalizeRevisionSuccess(params: {
  deps: GenerateDeps;
  novelId: string;
  chapterNumber: number;
  chapter: Chapter;
  finalResult: RevisionResult;
  finalContent: string;
  revisionCostOutputs: RevisionResult['agentOutputs'];
  autoBoostApplied: boolean;
  qualityDeltaPayload: Record<string, unknown>;
  modelAccessSource: string;
  billingBypassed: boolean;
  freezeId?: string;
  billingUserId?: string;
}): Promise<Record<string, unknown>> {
  const {
    deps,
    novelId,
    chapterNumber,
    chapter,
    finalResult,
    finalContent,
    revisionCostOutputs,
    autoBoostApplied,
    qualityDeltaPayload,
    modelAccessSource,
    billingBypassed,
    freezeId,
    billingUserId,
  } = params;
  const { novelManager, billingService, broadcast } = deps;

  if (finalResult.revisedContent) {
    await novelManager.archiveChapterVersion(novelId, chapterNumber, 'revise');
    const timestamp = new Date().toISOString();
    const revisionComments: AgentComment[] = [];
    for (const output of finalResult.agentOutputs) {
      revisionComments.push({
        agentRole: output.agentRole,
        comment: output.content,
        timestamp: output.timestamp,
      });
    }
    const readerScore = extractReaderScore(finalResult.readerFeedback);
    const updatedChapter: Chapter = {
      ...chapter,
      content: finalContent,
      wordCount: finalContent.length,
      revisionCount: chapter.revisionCount + 1,
      status: 'edited',
      agentComments: revisionComments,
      readerScore: readerScore ?? chapter.readerScore,
      updatedAt: timestamp,
    };
    await novelManager.saveChapter(novelId, updatedChapter);
    await novelManager.syncNovelMetadataByChapters(novelId);
  }

  const revisionCostSummary = buildChapterCost(novelId, chapterNumber, revisionCostOutputs, {
    operationType: 'revise',
    operationLabel: autoBoostApplied ? '章节修订（含自动补修）' : '章节修订',
  });
  if (revisionCostSummary.totalInputTokens > 0 || revisionCostSummary.totalOutputTokens > 0) {
    try {
      await novelManager.appendChapterCost(novelId, revisionCostSummary);
    } catch (costErr) {
      console.warn(`[chapter-revise] 成本写入失败，不影响主流程 novel=${novelId} chapter=${chapterNumber}:`, costErr instanceof Error ? costErr.message : costErr);
    }
  }

  broadcast({
    type: 'pipeline:complete',
    agentRole: 'writer',
    novelId,
    chapterNumber,
    data: JSON.stringify({ chapterNumber, cost: revisionCostSummary, mode: 'revise' }),
    timestamp: new Date().toISOString(),
  });

  if (freezeId && billingService && billingUserId && billingUserId !== 'dev') {
    try {
      const actualChars = finalContent.length;
      const reviseRuleCode = await billingService.getOperationRuleCode('reviseChapter');
      const actualEstimate = await billingService.estimate({
        ruleCode: reviseRuleCode,
        charCount: Math.max(actualChars, 1),
      });
      await billingService.settleFreeze(billingUserId, freezeId, actualEstimate.estimatedPoints);
    } catch (settleErr) {
      console.warn('[修订章节] 计费结算失败:', settleErr instanceof Error ? settleErr.message : settleErr);
    }
  }

  return {
    ...finalResult,
    qualityDelta: qualityDeltaPayload,
    modelAccessSource,
    billingBypassed,
  };
}

export async function rollbackRevisionFreeze(params: {
  deps: GenerateDeps;
  freezeId?: string;
  billingUserId?: string;
}): Promise<void> {
  if (!params.freezeId || !params.deps.billingService || !params.billingUserId || params.billingUserId === 'dev') {
    return;
  }
  try {
    await params.deps.billingService.settleFreeze(params.billingUserId, params.freezeId, 0);
  } catch (refundErr) {
    console.warn('[修订章节] 冻结退回失败:', refundErr instanceof Error ? refundErr.message : refundErr);
  }
}
