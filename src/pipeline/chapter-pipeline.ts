import type { ModelClient, StreamCallback } from '../models/types.js';
import { RateLimitError } from '../models/openai.js';
import type { NovelAgent, AgentRole, AgentContext, AgentOutput } from '../agents/types.js';
import { createHash } from 'node:crypto';
import { getConfig } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { cleanPublicFacingContent } from '../utils/public-facing-content.js';
import { sanitizeAuthorNote } from '../utils/author-note-sanitizer.js';
import { NovelGenerationLock } from './novel-generation-lock.js';
import { processLinksInDirection, formatLinkContexts } from '../utils/link-understanding.js';
import {
  buildStyleGuide,
  buildScenePlanFromOutline,
  defaultChapterEnhancementThresholds,
  type ChapterEnhancementThresholds,
} from './chapter-enhancement.js';
import {
  buildWorldContextV2,
  selectWorldCardsV2,
} from './world-context-v2.js';
import {
  buildWorldContract,
  evaluateWorldContractFulfillment,
  type WorldContract,
} from './world-contract.js';
import {
  buildOutlineContract,
  evaluateOutlineContractFulfillment,
} from './outline-gate.js';
import {
  buildQualityGateFixHints,
} from './quality-gate.js';
import {
  evaluateContinuityGate,
  buildContinuityGateFixHints,
} from './continuity-gate.js';
import {
  evaluateAiTraceGate,
  buildAiTraceFixHints,
} from './ai-trace-gate.js';
import type { GenreTraceOverrides } from './ai-trace-detector.js';
import { learnFromChapterDiff, loadLearnedPatterns } from './ai-trace-learner.js';
import { synthesizeDeterministicReader } from './deterministic-reader.js';
import { getTemplate } from '../novel/templates/index.js';
import {
  collectChapterMetrics,
  saveChapterMetrics,
} from './quality-metrics.js';
import { updateTruthFiles, loadTruthFiles, type TruthFileBundle } from '../memory/truth-files/index.js';
import { loadSettingBaseline, writePendingBaseline } from './setting-baseline/baseline-store.js';
import { buildSettingBaseline } from './setting-baseline/baseline-snapshot.js';
import { buildBaselineContext } from './setting-baseline/baseline-context.js';
import type { SettingBaseline } from './setting-baseline/types.js';
import { evaluateSettingDriftGate } from './setting-drift-gate.js';
import { parseStructuredReaderOutput } from './audit-report-builder.js';
import { buildAuditReport, dimensionResultFromAiTrace } from './audit-dimensions.js';
import type { AuditReport } from './audit-dimension-types.js';
import { createSnapshot, cleanupOldSnapshots } from '../novel/snapshot-manager.js';
import { buildNamingConstraints, type NameRegistryDeps } from '../novel/name-registry.js';
import {
  evaluatePowerRuleGate,
} from './power-rule-gate.js';
import { extractChapterFacts } from '../novel/chapter-fact-extractor.js';
import { runAllPostProcessing } from './chapter-post-processing.js';
import {
  analyzeForeshadowing,
  buildForeshadowingContextHints,
} from './foreshadowing-tracker.js';
import { buildWriterWorldGuidance } from './world-builder-guidance.js';
import { enforceFinalWorldContract } from './world-final-guard.js';
import { assessRewarmCurve } from './foreshadowing-rewarm.js';
import { diagnoseForeshadowingHealth, buildDensityContextPrompt } from './foreshadowing-density.js';
import {
  analyzeThreadGraph,
  buildThreadGraphContext,
} from './plot-thread-graph.js';
import {
  detectMonotony,
  buildPacingVariationHints,
} from './pacing-analyzer.js';
import {
  analyzeTensionCurve,
  buildTensionCurveContext,
} from './tension-curve-analyzer.js';
import { prioritizeCausalChains, buildCausalChainContext } from './causal-chain-analyzer.js';
import {
  analyzeCharacterArcs,
  buildCharacterStallContext,
  analyzeBeliefEvolution,
  buildBeliefEvolutionContext,
} from './character-arc-analyzer.js';
import {
  analyzeVoiceDrift,
  buildVoiceDriftContext,
} from './voice-drift-analyzer.js';
import { adviseNextChapter, buildChapterAdviceContext } from './chapter-advisor.js';
import { validateAgentOutput, getRetryPolicy } from './output-validator.js';
import { PrefixInjector } from './prefix-injector.js';
import {
  analyzeRelationshipEvolution,
  buildRelationshipEvolutionContext,
} from './relationship-evolution-analyzer.js';
import { buildNarrativeAuditForwardHints } from './narrative-audit.js';
import { auditChapterReadability, buildReadabilityForwardHints } from './readability-audit.js';
import {
  buildReaderDeliveryForwardHints,
} from './reader-delivery-audit.js';
import { buildReaderDeliveryWritingContract } from './reader-delivery-writing-contract.js';
import {
  buildMemoryPersistenceForwardHints,
  evaluateMemoryPersistenceForwardRisk,
} from './memory-persistence-forward-hints.js';
import { buildReaderDeliveryRepairSignal } from './reader-delivery-repair.js';
import { buildReadabilityRepairDecision } from './readability-repair.js';
import { evaluateReadabilityRepairAcceptance } from './readability-repair-acceptance.js';
import { evaluateReaderDeliveryRevisionCandidate } from './reader-delivery-revision-acceptance.js';
import { auditGenreDrift } from './genre-drift-audit.js';
import {
  auditUserDirectionAnchors,
  buildUserDirectionAnchorRepairInstruction,
  buildUserDirectionAnchorInstruction,
} from './user-direction-anchor.js';

import type { ChapterOutline, ChapterPacing, CharacterProfile } from '../novel/types.js';
import type { Scene } from '../novel/types.js';
import type { StartupOpeningStrategyDigest } from '../agent-skills/opening-strategy.js';
import type {
  ChapterGenerationResult,
  EventEmitter,
  PipelineMemory,
  PipelineNovelManager,
} from './types.js';
import { CollaborationLog } from './collaboration-log.js';
import { PerformanceTracker } from './performance-tracker.js';
import type { StoryStateManager } from '../novel/story-state-manager.js';
import type { SeriesManager } from '../novel/series-manager.js';

// --- 从提取模块导入 ---
import {
  ChapterReadCache,
  type WorldFeatureOptions,
  type OutlineFeatureOptions,
  type QualityFeatureOptions,
  type CharacterWhitelistFeatureOptions,
  type ContinuityFeatureOptions,
  type PowerRuleFeatureOptions,
  type SettingDriftFeatureOptions,
  type LongFormFeatureOptions,
  type MemoryOrchestratorFeatureOptions,
  type AiTraceFeatureOptions,
  type TruthFileFeatureOptions,
  type StructuredAuditFeatureOptions,
  type SnapshotFeatureOptions,
  readBoolEnv,
  resolveChapterLengthGuardSkip,
} from './pipeline-constants.js';
import { resolveChapterPipelineFeatures } from './chapter-pipeline-features.js';

import {
  buildPreviousChapterContext,
  buildCharacterContext,
  buildCharacterContextLight,
  buildWorldContext,
  buildConsistencyGuardrails,
  buildCharacterEventContext,
  buildAntiTemplateRules,
  buildAutoRevisionDirection,
  buildMultiQuerySearches,
  buildCultureStoryHooks,
  buildFactionFronts,
  parseReaderScore,
  getAdaptiveTemperature,
  inferChapterType as inferChapterTypeFn,
} from './context-builders.js';
import {
  EDITOR_EXCLUDED_CONTEXT_KEYS,
} from './context-budget.js';

import {
  buildOutlineGateFixHints,
  buildWorldGateFixHints,
  shouldAttemptWorldGateFix,
  evaluateSpeakerWhitelist,
  normalizeName,
} from './gate-orchestrator.js';

import { parseEditorOutput } from './editor-output-parser.js';
import { sanitizeSuspiciousExitMarkers } from '../utils/character-status.js';
import { loadEnhancedMemoryContext } from './chapter-pipeline-memory-context.js';
import { loadOrchestratorMemoryContext } from './chapter-pipeline-orchestrator-context.js';
import { buildMemoryContextAudit, buildMemoryContextForwardHints } from './memory-context-audit.js';
import { buildTruthContextPreview } from './truth-context-preview.js';
import type { RawVectorSearch } from '../memory/orchestrator/index.js';
import { logGateFindings } from './gate-policy.js';
import { evaluateChapterQualityGate } from './chapter-quality-gate.js';
import { rewriteLocalizedAntiAiTells, sanitizeContrastPhrasing } from './localized-anti-ai-rewriter.js';
import { correctTypos } from './typo-corrector.js';
import { loadPatternDB } from './pattern-freq-store.js';
import { detectClichePatterns } from './cliche-pattern-detector.js';
import { verifyRewriteRegression } from './rewrite-regression-guard.js';
import { evaluateSurfaceRegression } from './surface-regression-guard.js';
import { buildVoiceAnchorHints } from './voice-anchor.js';
import { NarrativePatternCache } from './narrative-pattern-cache.js';
import { buildSuperLongModeHints } from './super-long-mode.js';
import {
  evaluateCommercialGate,
  buildCommercialGateFixHints,
} from './commercial-gate.js';
import { evaluateStartupOpeningGate,
  buildStartupOpeningFixHints,
} from './startup-opening-gate.js';
import { SmartGateManager } from './smart-gate-manager.js';
import { saveSmartGateHints, loadPrevChapterSmartGateHints } from './smart-gate-hints.js';
import { computeAgentFingerprint, getCachedAgentOutput, saveAgentOutputToCache } from './agent-output-cache.js';

import {
  DEFAULT_CHAPTER_WORD_TARGET,
  buildChapterLengthGuardFeedback,
  buildChapterLengthFallbackTrim,
  buildChapterUnderLengthGuardFeedback,
  buildChapterLengthGuardSummary,
  enforceFinalChapterLengthLimit,
  shouldTriggerChapterUnderLengthGuard,
  shouldTriggerChapterLengthGuard,
  trimChapterToSentenceBoundary,
} from './chapter-length-guard.js';
import {
  getFinalChapterLengthViolation,
  recoverFinalUnderLengthChapter,
} from './final-chapter-length-recovery.js';
import { getAgentSkillService } from '../agent-skills/service.js';
import { SkillEffectsTracker } from '../agent-skills/skill-effects-tracker.js';
import { getNovelsDir } from '../config/index.js';
import {
  buildStartupRetentionHints,
  normalizeStartupPlatformProfile,
} from './startup-retention-hints.js';
import { buildNovelPromiseContract } from './novel-promise-contract.js';
import { buildChapterPromiseCard } from './chapter-promise-card.js';
import { detectDeferredPayoffPressure } from './chapter-promise-delay.js';
import {
  buildChapterPromiseGateFixHints,
  evaluateChapterPromiseGate,
} from './chapter-promise-gate.js';
import {
  assembleSceneContents,
  buildStartupFunctionalScenePlan,
} from './startup-functional-blocks.js';
import {
  buildStartupSceneBoundaryRepairDirective,
  detectStartupSceneBoundaryIssues,
  estimateLeadingSceneReplayAgainstFullContext,
  estimateLeadingSceneReplaySimilarity,
} from './startup-scene-boundary-guard.js';
import {
  analyzeDistributedSceneReplay,
  stripDistributedReplayedParagraphs,
} from './startup-scene-replay.js';

import { createAgentExecutor } from './agent-executor.js';
import { countInlineSpeakerMarkers, buildDomainStructureKeywords } from './pipeline-utils.js';
import { evaluateReader } from './reader-evaluator.js';
import { buildStructuredAuditReport } from './structured-audit.js';
import { assembleContext } from './context-assembler.js';
import { generateDraft } from './draft-generator.js';

const pipelineLog = createLogger('chapter-pipeline');
const pipelineTraceLog = createLogger('chapter-pipeline-trace');
const worldGateLog = createLogger('world-gate');
const outlineGateLog = createLogger('outline-gate');
const qualityGateLog = createLogger('quality-gate');
const chapterPromiseGateLog = createLogger('chapter-promise-gate');
const commercialGateLog = createLogger('commercial-gate');
const memoryLog = createLogger('memory-context');

let chapterPipelineRunSeq = 0;
const ENABLE_STARTUP_FUNCTIONAL_SCENE_MODE = false;
/** 设定基线自动快照的最小章节号：达到后若仍无基线，自动生成 pending（待人工确认） */
const BASELINE_AUTO_SNAPSHOT_MIN_CHAPTER = 3;

/** 流式心跳节流间隔：单个 agent 流式输出期间，最多每隔此毫秒数触发一次心跳报活 */
const STREAM_HEARTBEAT_THROTTLE_MS = 10_000;

function nextChapterPipelineRunId(): string {
  chapterPipelineRunSeq += 1;
  return `cp-${Date.now()}-${chapterPipelineRunSeq}`;
}

function summarizeStageText(text: string): { hash: string; length: number; head: string } {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  return {
    hash: createHash('sha1').update(text ?? '').digest('hex').slice(0, 12),
    length: text?.length ?? 0,
    head: normalized.slice(0, 80),
  };
}

function normalizeSceneTextForDuplicateCheck(text: string): string {
  return (text ?? '')
    .replace(/\(#.*?\)/g, '')
    .replace(/\s+/g, '')
    .replace(/[“”"'‘’`]/g, '')
    .replace(/[，。！？、；：,.!?;:()\[\]{}<>《》【】\-_]/g, '');
}

function buildSceneDuplicateFingerprints(text: string): Set<string> {
  const normalized = normalizeSceneTextForDuplicateCheck(text);
  const fingerprints = new Set<string>();
  if (normalized.length < 24) return fingerprints;
  for (let index = 0; index <= normalized.length - 12; index += 4) {
    fingerprints.add(normalized.slice(index, index + 12));
  }
  return fingerprints;
}

function estimateSceneDuplicateSimilarity(currentText: string, previousText: string): number {
  const current = buildSceneDuplicateFingerprints(currentText);
  const previous = buildSceneDuplicateFingerprints(previousText);
  if (current.size === 0 || previous.size === 0) return 0;

  let overlap = 0;
  for (const fingerprint of current) {
    if (previous.has(fingerprint)) overlap += 1;
  }
  return overlap / Math.min(current.size, previous.size);
}

function normalizeSceneParagraphForReplayCheck(text: string): string {
  return normalizeSceneTextForDuplicateCheck(text);
}

function splitSceneReplayParagraphs(text: string): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function buildSceneReplayWindows(text: string): string[] {
  const paragraphs = splitSceneReplayParagraphs(text);
  const windows: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const single = paragraphs[index];
    if (single) windows.push(single);
    const pair = paragraphs.slice(index, index + 2).join('\n\n').trim();
    if (pair.length > (single?.length ?? 0)) windows.push(pair);
  }
  return windows;
}

function estimateParagraphReplayAgainstPriorContent(paragraph: string, previousText: string): number {
  if (!paragraph.trim() || !previousText.trim()) return 0;
  let maxSimilarity = 0;
  for (const candidate of buildSceneReplayWindows(previousText)) {
    maxSimilarity = Math.max(maxSimilarity, estimateSceneDuplicateSimilarity(paragraph, candidate));
    if (maxSimilarity >= 0.999) break;
  }
  return maxSimilarity;
}

function stripLeadingReplayedParagraphs(currentText: string, previousText: string): {
  sanitizedText: string;
  removedParagraphs: string[];
} {
  const paragraphs = (currentText ?? '')
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);
  if (paragraphs.length <= 1 || !(previousText ?? '').trim()) {
    return { sanitizedText: currentText.trim(), removedParagraphs: [] };
  }

  const normalizedPrevious = normalizeSceneParagraphForReplayCheck(previousText);
  const removedParagraphs: string[] = [];
  let removeUntil = 0;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const normalizedParagraph = normalizeSceneParagraphForReplayCheck(paragraph);
    if (normalizedParagraph.length < 28) {
      break;
    }

    const replayed = normalizedPrevious.includes(normalizedParagraph)
      || estimateParagraphReplayAgainstPriorContent(paragraph, previousText) >= 0.44;
    if (!replayed) {
      break;
    }

    removedParagraphs.push(paragraph);
    removeUntil = index + 1;
  }

  if (removedParagraphs.length === 0 || removeUntil >= paragraphs.length) {
    return { sanitizedText: currentText.trim(), removedParagraphs: [] };
  }

  const sanitizedText = paragraphs.slice(removeUntil).join('\n\n').trim();
  if (sanitizedText.length < 140) {
    return { sanitizedText: currentText.trim(), removedParagraphs: [] };
  }

  return { sanitizedText, removedParagraphs };
}

function buildSceneDuplicateRepairDirective(params: {
  sceneNumber: number;
  sceneTitle: string;
  sceneSummary: string;
  sceneNotes?: string;
  previousSceneContent: string;
}): string {
  const previousHead = params.previousSceneContent
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);

  return [
    `## 启动章功能块防重复修复：场景${params.sceneNumber}《${params.sceneTitle}》`,
    '- 你刚才把当前场景写得和上一场景过于相似，禁止重复上一场景的电话、对话、动作链和结尾钩子。',
    `- 当前场景必须完成的功能：${params.sceneSummary}`,
    params.sceneNotes ? `- 当前场景执行提醒：${params.sceneNotes}` : '',
    `- 上一场景已完成内容摘要：${previousHead}`,
    '- 当前场景必须显著推进到新的时间点、新的地点或新的关系动作。',
    '- 如果上一场景已经完成提案/签字/电话核查，这一场就不能再重写同一件事，必须写绑定后的新局面与新回报。',
    '- 优先写新的可见动作、新的对话结果、新的关系变化，不要复述前文。',
  ].filter(Boolean).join('\n');
}

function buildSceneReplayRepairDirective(params: {
  sceneNumber: number;
  sceneTitle: string;
  sceneSummary: string;
  sceneNotes?: string;
  priorChapterContent: string;
}): string {
  const previousHead = params.priorChapterContent
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  return [
    `## 启动章功能块全章回放修复：场景${params.sceneNumber}《${params.sceneTitle}》`,
    '- 你刚才把当前场景写成了对本章前文的重述或压缩回放，这是禁止的。',
    `- 当前场景必须完成的功能：${params.sceneSummary}`,
    params.sceneNotes ? `- 当前场景执行提醒：${params.sceneNotes}` : '',
    `- 本章前面已经写过的内容摘要：${previousHead}`,
    '- 当前场景不能重新从“主角被推进车厢/进入会场/提出协议/首次发现能力”写起。',
    '- 当前场景只能承接前文已发生的结果继续往后推，禁止再做整章摘要、世界观重讲或前情回顾。',
    '- 若需要提及前文结果，只能一句带过，随后立刻进入新的动作、新的交换结果或新的章尾钩子。',
  ].filter(Boolean).join('\n');
}

function buildSceneDistributedReplayRepairDirective(params: {
  sceneNumber: number;
  sceneTitle: string;
  sceneSummary: string;
  sceneNotes?: string;
  matchedParagraphs: string[];
}): string {
  const samples = params.matchedParagraphs
    .slice(0, 3)
    .map(item => item.replace(/\s+/g, ' ').trim().slice(0, 70))
    .filter(Boolean);

  return [
    `## 启动章功能块中段回放修复：场景${params.sceneNumber}《${params.sceneTitle}》`,
    '- 你刚才不是只在开头重启，而是在当前场景中后段重打了前文已经完成的一整轮节拍，这属于场景回放。',
    `- 当前场景必须完成的功能：${params.sceneSummary}`,
    params.sceneNotes ? `- 当前场景执行提醒：${params.sceneNotes}` : '',
    samples.length > 0 ? `- 当前检测到的回放段落示例：${samples.join('；')}` : '',
    '- 当前场景不得再次重复已完成的开直播、再放同类录音、再打同一类证据、再给同一轮围观反馈。',
    '- 只允许保留一句前情结果作为承接，然后立刻进入新的结果、新的代价、新的站队变化或新的章尾任务。',
  ].filter(Boolean).join('\n');
}

function reportHasFindingCodes(
  report: { findings?: Array<{ code: string }> } | undefined,
  codes: string[],
): boolean {
  if (!report?.findings?.length) return false;
  return report.findings.some(item => codes.includes(item.code));
}

function buildHardBlockMessage(
  label: string,
  codes: string[],
  report?: { findings?: Array<{ code: string; message?: string }> },
): string {
  const matchedMessages = [...new Set(
    (report?.findings ?? [])
      .filter(item => codes.includes(item.code))
      .map(item => item.message?.trim())
      .filter((item): item is string => Boolean(item)),
  )];

  if (matchedMessages.length > 0) {
    return `${label}命中硬阻断规则：${matchedMessages.join('；')}。该章节不能保存，必须继续自动修正。`;
  }

  return `${label}命中硬阻断规则：${codes.join('、')}。该章节不能保存，必须继续自动修正。`;
}

function getMatchedFindingMessages(
  report: { findings?: Array<{ code: string; message?: string }> } | undefined,
  codes: string[],
): string[] {
  return [...new Set(
    (report?.findings ?? [])
      .filter(item => codes.includes(item.code))
      .map(item => item.message?.trim())
      .filter((item): item is string => Boolean(item)),
  )];
}

function buildHardBlockRepairDirective(
  label: string,
  messages: string[],
): string {
  const lines = [
    `## ${label}二次强修（高于普通润色）`,
    '- 这是硬阻断修复，不允许保留触发门禁的句子或段落。',
    '- 若某段同时承担信息说明和回报推进，只保留现实现场可见、公开可感的部分，删除系统碎片、案卷细节和私下密谈依赖。',
  ];

  if (messages.length > 0) {
    lines.push(`- 当前必须消除的问题：${messages.join('；')}`);
  }

  lines.push('- 删除所有“系统/预警/光幕直接给出未来片段、金额、账号、尾号、合同、监控、会所、包厢、报销单”的表达。');
  lines.push('- 删除或压缩过长的休息室、办公室、会客室、私下谈条件桥段，把主要回报挪回直播、热搜、片场、围观反馈、品牌方动作这些公开战场。');
  lines.push('- 若没有现场可见来源，就不要让主角说出精确细节；改成标签级判断、当场观察或公开场面里的异动。');
  lines.push('- 输出仍保持“润色后的正文 + ---EDITOR_NOTES--- + 修改说明”。');
  return lines.join('\n');
}

function buildValidationRetryDirective(
  role: AgentRole,
  issues: string[],
): string {
  const lines = [
    `## ${role} 输出校验回灌（下一轮必须消除）`,
    `- 上一轮输出命中的问题：${issues.join('；')}`,
  ];

  if (role === 'writer' || role === 'editor') {
    lines.push('- 不要复用上一轮触发校验的表达，必须直接改写相关段落，而不是只换同义词。');
    lines.push('- 禁止出现“系统/光幕/预警直接给出账户、流水、合同、金额、监控、会所、采购款、空壳公司”等案卷级细节。');
    lines.push('- 若剧情需要反击，只能保留现场可见的异动、公开反馈和角色当场能观察到的信息。');
    lines.push('- 娱乐圈题材若涉及谈判，只能压成辅戏，主回报必须回到直播、热搜、片场、围观反馈等公开战场。');
  }

  return lines.join('\n');
}

function isStartupOpeningStrategyDigest(value: unknown): value is StartupOpeningStrategyDigest {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.enabled === 'boolean'
    && typeof data.brief === 'string'
    && typeof data.summary === 'string'
    && Array.isArray(data.conflicts)
    && data.conflicts.every(item => typeof item === 'string')
    && Array.isArray(data.consumedSkillIds)
    && data.consumedSkillIds.every(item => typeof item === 'string');
}

function pickStartupOpeningStrategyDigest(outputs: AgentOutput[]): StartupOpeningStrategyDigest | undefined {
  const preferredRoles: AgentRole[] = ['opening-supervisor', 'writer', 'editor'];
  for (const role of preferredRoles) {
    const output = outputs.find(item => item.agentRole === role);
    const candidate = output?.metadata?.startupOpeningStrategy;
    if (isStartupOpeningStrategyDigest(candidate)) return candidate;
  }
  for (const output of outputs) {
    const candidate = output.metadata?.startupOpeningStrategy;
    if (isStartupOpeningStrategyDigest(candidate)) return candidate;
  }
  return undefined;
}
const patternRotationCache = new NarrativePatternCache();

type SuperLongDiagnosticsPayload = NonNullable<ChapterGenerationResult['superLongDiagnostics']>;
type SuperLongDiagnosticsModule = SuperLongDiagnosticsPayload['modules'][number];

const SUPER_LONG_MODULE_META: Array<{
  key: SuperLongDiagnosticsModule['key'];
  title: string;
}> = [
  { key: 'layered-memory', title: '分层记忆' },
  { key: 'character-ledger', title: '角色状态账本' },
  { key: 'timeline-engine', title: '时间线与因果引擎' },
  { key: 'foreshadow-debt', title: '伏笔债务看板' },
  { key: 'anti-ai-radar', title: '重复表达雷达' },
  { key: 'pov-lock', title: '视角与叙述锁' },
  { key: 'chapter-goal-budget', title: '章节目标预算' },
  { key: 'hook-planner', title: '断章钩子规划器' },
];

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function createDisabledSuperLongDiagnostics(): SuperLongDiagnosticsPayload {
  return {
    enabled: false,
    summary: '超长篇模式未启用',
    modules: SUPER_LONG_MODULE_META.map(({ key, title }) => ({
      key,
      title,
      enabled: false,
      summary: '未启用，未注入该模块。',
    })),
  };
}

export class ChapterPipeline {
  private worldFeatures: Required<WorldFeatureOptions>;
  private outlineFeatures: Required<OutlineFeatureOptions>;
  private qualityFeatures: Required<QualityFeatureOptions>;
  private characterWhitelistFeatures: Required<CharacterWhitelistFeatureOptions>;
  private continuityFeatures: Required<ContinuityFeatureOptions>;
  private powerRuleFeatures: Required<PowerRuleFeatureOptions>;
  private settingDriftFeatures: Required<SettingDriftFeatureOptions>;
  private longFormFeatures: Required<LongFormFeatureOptions>;
  private memoryOrchestratorFeatures: Required<MemoryOrchestratorFeatureOptions>;
  private aiTraceFeatures: Required<AiTraceFeatureOptions>;
  private truthFileFeatures: Required<TruthFileFeatureOptions>;
  private structuredAuditFeatures: Required<StructuredAuditFeatureOptions>;
  private snapshotFeatures: Required<SnapshotFeatureOptions>;
  private rawVectorSearch?: RawVectorSearch;
  private storyStateManager?: StoryStateManager;
  private seriesManager?: SeriesManager;
  private universeManager?: import('../novel/universe-manager.js').UniverseManager;
  private anchorManager?: import('../novel/universe-anchor.js').UniverseAnchorManager;
  private chapterCache = new ChapterReadCache();
  /** 单次生成周期内的角色缓存，避免 10+ 次重复 getCharacters I/O */
  private cachedCharacters: Awaited<ReturnType<PipelineNovelManager['getCharacters']>> | null = null;
  private runQueue: Promise<void> = Promise.resolve();
  private generationLock: NovelGenerationLock;

  constructor(
    private agents: Map<AgentRole, NovelAgent>,
    private memory: PipelineMemory,
    private novelManager: PipelineNovelManager,
    private model: ModelClient,
    private enhancementThresholds: ChapterEnhancementThresholds = defaultChapterEnhancementThresholds(),
    worldFeatures: WorldFeatureOptions = {},
    outlineFeatures: OutlineFeatureOptions = {},
    qualityFeatures: QualityFeatureOptions = {},
    characterWhitelistFeatures: CharacterWhitelistFeatureOptions = {},
    continuityFeatures: ContinuityFeatureOptions = {},
    powerRuleFeatures: PowerRuleFeatureOptions = {},
    settingDriftFeatures: SettingDriftFeatureOptions = {},
    longFormFeatures: LongFormFeatureOptions = {},
    memoryOrchestratorFeatures: MemoryOrchestratorFeatureOptions = {},
    aiTraceFeatures: AiTraceFeatureOptions = {},
    truthFileFeatures: TruthFileFeatureOptions = {},
    structuredAuditFeatures: StructuredAuditFeatureOptions = {},
    snapshotFeatures: SnapshotFeatureOptions = {},
  ) {
    const resolvedFeatures = resolveChapterPipelineFeatures({
      worldFeatures,
      outlineFeatures,
      qualityFeatures,
      characterWhitelistFeatures,
      continuityFeatures,
      powerRuleFeatures,
      settingDriftFeatures,
      longFormFeatures,
      memoryOrchestratorFeatures,
      aiTraceFeatures,
      truthFileFeatures,
      structuredAuditFeatures,
      snapshotFeatures,
    });
    this.worldFeatures = resolvedFeatures.worldFeatures;
    this.outlineFeatures = resolvedFeatures.outlineFeatures;
    this.qualityFeatures = resolvedFeatures.qualityFeatures;
    this.characterWhitelistFeatures = resolvedFeatures.characterWhitelistFeatures;
    this.continuityFeatures = resolvedFeatures.continuityFeatures;
    this.powerRuleFeatures = resolvedFeatures.powerRuleFeatures;
    this.settingDriftFeatures = resolvedFeatures.settingDriftFeatures;
    this.longFormFeatures = resolvedFeatures.longFormFeatures;
    this.memoryOrchestratorFeatures = resolvedFeatures.memoryOrchestratorFeatures;
    this.aiTraceFeatures = resolvedFeatures.aiTraceFeatures;
    this.truthFileFeatures = resolvedFeatures.truthFileFeatures;
    this.structuredAuditFeatures = resolvedFeatures.structuredAuditFeatures;
    this.snapshotFeatures = resolvedFeatures.snapshotFeatures;
    const dataDir = typeof this.novelManager.getDataDir === 'function'
      ? this.novelManager.getDataDir()
      : getConfig().dataDir;
    this.generationLock = new NovelGenerationLock(dataDir);
  }

  fork(): ChapterPipeline {
    const isolated = new ChapterPipeline(
      this.agents,
      this.memory,
      this.novelManager,
      this.model,
      { ...this.enhancementThresholds },
      { ...this.worldFeatures },
      { ...this.outlineFeatures },
      { ...this.qualityFeatures },
      { ...this.characterWhitelistFeatures },
      { ...this.continuityFeatures },
      { ...this.powerRuleFeatures },
      { ...this.settingDriftFeatures },
      { ...this.longFormFeatures },
      { ...this.memoryOrchestratorFeatures },
      { ...this.aiTraceFeatures },
      { ...this.truthFileFeatures },
      { ...this.structuredAuditFeatures },
      { ...this.snapshotFeatures },
    );

    if (this.storyStateManager) {
      isolated.setStoryStateManager(this.storyStateManager);
    }
    if (this.seriesManager) {
      isolated.setSeriesManager(this.seriesManager);
    }
    if (this.universeManager) {
      isolated.setUniverseManager(this.universeManager);
    }
    if (this.anchorManager) {
      isolated.setAnchorManager(this.anchorManager);
    }
    if (this.rawVectorSearch) {
      isolated.setRawVectorSearch(this.rawVectorSearch);
    }

    return isolated;
  }

  /** 注入故事状态管理器（可选，不影响现有管线） */
  setStoryStateManager(manager: StoryStateManager): void {
    this.storyStateManager = manager;
  }

  /** 注入系列管理器（可选，不影响现有管线） */
  setSeriesManager(manager: SeriesManager): void {
    this.seriesManager = manager;
  }

  /** 注入宇宙管理器（可选，不影响现有管线） */
  setUniverseManager(manager: import('../novel/universe-manager.js').UniverseManager): void {
    this.universeManager = manager;
  }

  /** 注入原始向量搜索接口（编排器模式需要） */
  setRawVectorSearch(search: RawVectorSearch): void {
    this.rawVectorSearch = search;
  }

  /** 注入宇宙锚点管理器（可选） */
  setAnchorManager(manager: import('../novel/universe-anchor.js').UniverseAnchorManager): void {
    this.anchorManager = manager;
  }

  /** 单次生成周期内缓存角色列表，避免重复 I/O */
  private async getCharactersCached(novelId: string): ReturnType<PipelineNovelManager['getCharacters']> {
    if (!this.cachedCharacters) {
      this.cachedCharacters = await this.novelManager.getCharacters(novelId);
    }
    return this.cachedCharacters;
  }

  private async acquireRunLock(novelId: string, chapterNumber: number, runId: string): Promise<() => void> {
    const previous = this.runQueue.catch(() => {});
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.runQueue = previous.then(() => current);

    const waitStartedAt = Date.now();
    await previous;
    const waitedMs = Date.now() - waitStartedAt;
    if (waitedMs > 25) {
      pipelineLog.warn(`[serialize] run=${runId} novel=${novelId} chapter=${chapterNumber} waited ${waitedMs}ms for prior chapter generation`);
    }

    return () => {
      release();
    };
  }

  async generateChapter(params: {
    novelId: string;
    chapterNumber: number;
    userDirection: string;
    stylePreset?: string;
    maxWordCount?: number;
    styleNotes?: string;
    startupPlatformProfile?: string;
    modelOverride?: ModelClient;
    onEvent?: EventEmitter;
    /** 为 true 时所有 strict 门禁降级为 warn（重写预览场景） */
    skipStrictGate?: boolean;
    /** 为 true 时禁用字数守卫的自动压缩（默认禁用，避免 resizer 改写内容和额外 token 消耗） */
    skipLengthGuard?: boolean;
    onDraftReady?: (result: ChapterGenerationResult) => Promise<void> | void;
    /** 外部中断信号（批量取消时传入） */
    signal?: AbortSignal;
    /** 心跳回调：每个 agent 阶段完成时触发，用于批量队列的智能空闲超时检测 */
    onHeartbeat?: (stage: string) => void;
  }): Promise<ChapterGenerationResult> {
    const {
      novelId,
      chapterNumber,
      userDirection: rawUserDirection,
      stylePreset,
      maxWordCount = DEFAULT_CHAPTER_WORD_TARGET,
      styleNotes,
      startupPlatformProfile,
      modelOverride,
      onEvent,
      skipStrictGate,
      skipLengthGuard,
      onHeartbeat,
      onDraftReady,
      signal,
    } = params;
    const runId = nextChapterPipelineRunId();
    const releaseRunLock = await this.acquireRunLock(novelId, chapterNumber, runId);
    let releaseGenerationLock: (() => Promise<void>) | null = null;
    let restoreGateState = () => {};
    try {
      releaseGenerationLock = await this.generationLock.acquire({
        novelId,
        chapterNumber,
        runId,
        signal,
      });
      const traceStage = (stage: string, text: string, meta?: Record<string, unknown>): void => {
        const summary = summarizeStageText(text);
        pipelineTraceLog.info(`[trace] run=${runId} stage=${stage}`, {
          novelId,
          chapterNumber,
          ...summary,
          ...meta,
        });
        // 触发心跳，让批量队列的智能超时知道"我还活着"
        try {
          onHeartbeat?.(stage);
        } catch {
          // 心跳回调失败不影响主流程
        }
      };

      // 链接理解：检测创作指令中的 URL，抓取内容作为参考素材
      const { cleanDirection, linkContexts } = await processLinksInDirection(rawUserDirection);
      const linkRefBlock = formatLinkContexts(linkContexts);
      const userDirection = linkRefBlock
        ? `${cleanDirection}\n\n${linkRefBlock}`
        : cleanDirection;
      const directionAnchorInstruction = buildUserDirectionAnchorInstruction(userDirection);
      const anchoredUserDirection = [userDirection, directionAnchorInstruction].filter(Boolean).join('\n\n');

      const activeModel = modelOverride ?? this.model;

      // 启动/重写场景：临时将所有 strict 门禁降级为 warn，避免阻塞主流程
      const savedGateState = skipStrictGate
      ? {
          quality: {
            strictFallbackToWarn: this.qualityFeatures.strictFallbackToWarn,
            gateMode: this.qualityFeatures.gateMode,
          },
          world: {
            strictFallbackToWarn: this.worldFeatures.strictFallbackToWarn,
            gateMode: this.worldFeatures.gateMode,
          },
          outline: {
            strictFallbackToWarn: this.outlineFeatures.strictFallbackToWarn,
            gateMode: this.outlineFeatures.gateMode,
          },
          continuity: {
            strictFallbackToWarn: this.continuityFeatures.strictFallbackToWarn,
            gateMode: this.continuityFeatures.gateMode,
          },
          characterWhitelist: {
            strictFallbackToWarn: this.characterWhitelistFeatures.strictFallbackToWarn,
            gateMode: this.characterWhitelistFeatures.gateMode,
          },
          powerRule: {
            strictFallbackToWarn: this.powerRuleFeatures.strictFallbackToWarn,
            gateMode: this.powerRuleFeatures.gateMode,
          },
        }
      : null;
    if (skipStrictGate) {
      this.qualityFeatures.strictFallbackToWarn = true;
      this.qualityFeatures.gateMode = this.qualityFeatures.gateMode === 'off' ? 'off' : 'warn';
      this.worldFeatures.strictFallbackToWarn = true;
      this.worldFeatures.gateMode = this.worldFeatures.gateMode === 'off' ? 'off' : 'warn';
      this.outlineFeatures.strictFallbackToWarn = true;
      this.outlineFeatures.gateMode = this.outlineFeatures.gateMode === 'off' ? 'off' : 'warn';
      this.continuityFeatures.strictFallbackToWarn = true;
      this.continuityFeatures.gateMode = this.continuityFeatures.gateMode === 'off' ? 'off' : 'warn';
      this.characterWhitelistFeatures.strictFallbackToWarn = true;
      this.characterWhitelistFeatures.gateMode = this.characterWhitelistFeatures.gateMode === 'off' ? 'off' : 'warn';
      this.powerRuleFeatures.strictFallbackToWarn = true;
      this.powerRuleFeatures.gateMode = this.powerRuleFeatures.gateMode === 'off' ? 'off' : 'warn';
    }

      restoreGateState = () => {
        if (savedGateState) {
          this.qualityFeatures.strictFallbackToWarn = savedGateState.quality.strictFallbackToWarn;
          this.qualityFeatures.gateMode = savedGateState.quality.gateMode;
        this.worldFeatures.strictFallbackToWarn = savedGateState.world.strictFallbackToWarn;
        this.worldFeatures.gateMode = savedGateState.world.gateMode;
        this.outlineFeatures.strictFallbackToWarn = savedGateState.outline.strictFallbackToWarn;
        this.outlineFeatures.gateMode = savedGateState.outline.gateMode;
        this.continuityFeatures.strictFallbackToWarn = savedGateState.continuity.strictFallbackToWarn;
        this.continuityFeatures.gateMode = savedGateState.continuity.gateMode;
        this.characterWhitelistFeatures.strictFallbackToWarn = savedGateState.characterWhitelist.strictFallbackToWarn;
        this.characterWhitelistFeatures.gateMode = savedGateState.characterWhitelist.gateMode;
        this.powerRuleFeatures.strictFallbackToWarn = savedGateState.powerRule.strictFallbackToWarn;
        this.powerRuleFeatures.gateMode = savedGateState.powerRule.gateMode;
      }
    };
    const collaborationLog = new CollaborationLog();
    const perfTracker = new PerformanceTracker();
    perfTracker.begin(novelId, chapterNumber);
    this.chapterCache.clear();
    this.cachedCharacters = null;

    const allOutputs: AgentOutput[] = [];

    const { runAgent } = createAgentExecutor(this.agents, {
      novelId,
      chapterNumber,
      runId,
      onEvent,
      onHeartbeat,
      signal,
      skipStrictGate,
      perfTracker,
      model: activeModel,
      allOutputs,
    });

    try {
      onHeartbeat?.('context:start');
    } catch {
      // 心跳回调失败不影响生成主流程
    }

    // 章节生成前自动快照（fire-and-forget，失败不阻塞）
    if (this.snapshotFeatures.enabled && chapterNumber > 1) {
      try {
        const novelsDir = getNovelsDir();
        await createSnapshot(novelId, chapterNumber - 1, novelsDir);
        cleanupOldSnapshots(novelId, novelsDir).catch(() => {});
      } catch (err) {
        pipelineLog.debug('自动快照失败', { reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const { novel, prevChapterContext, memoryContext, styleDna, outline, characters, worldEntries, events, prevSmartGateHints } = await assembleContext(
      novelId,
      chapterNumber,
      userDirection,
      this.novelManager,
      this.memory,
      this.chapterCache,
      this.getCharactersCached.bind(this),
    );
    try {
      onHeartbeat?.('context:complete');
    } catch {
      // 心跳回调失败不影响生成主流程
    }
    const combinedPrevContext = [prevChapterContext, memoryContext].filter(Boolean).join('\n\n');

    // 安全网：第 2 章及以后必须有前文上下文，否则 Outline/Writer 会凭空编造
    if (chapterNumber > 1 && !combinedPrevContext.trim()) {
      // 检查前面是否有任何章节文件存在
      let hasPreviousChapters = false;
      try {
        for (let i = 1; i < chapterNumber; i += 1) {
          const chapter = await this.chapterCache.get(this.novelManager, novelId, i);
          if (chapter) {
            hasPreviousChapters = true;
            break;
          }
        }
      } catch {
        // 读取失败，假设没有前面的章节
      }

      if (!hasPreviousChapters) {
        // 前面没有章节文件，允许生成继续（可能是用户删除了所有前面的章节）
        pipelineLog.warn(
          `[safety-net] run=${runId} novel=${novelId} chapter=${chapterNumber} — 前文上下文为空，但前面没有章节文件，允许生成继续。`,
        );
      } else {
        // 前面有章节文件但都是空白的，抛出异常
        pipelineLog.error(
          `[safety-net] run=${runId} novel=${novelId} chapter=${chapterNumber} — 前文上下文为空！` +
          '上一章可能未成功落库，中止生成以防内容断裂。',
        );
        throw new Error(
          `第 ${chapterNumber} 章生成失败：未能读取到前文内容（第 ${chapterNumber - 1} 章可能未成功保存），请检查前一章是否存在后重试。`,
        );
      }
    }

    // 轻量角色上下文 — 用于 Outline Agent（仅名字/定位/状态一行），节省 60-70% token
    const characterLightContext = buildCharacterContextLight(characters);
    const [characterFileContext, worldFileContext, consistencyGuardrailsCtx, antiTemplateResult, characterEventCtx] = await Promise.all([
      Promise.resolve(buildCharacterContext(characters)),
      Promise.resolve(buildWorldContext(worldEntries)),
      buildConsistencyGuardrails(this.novelManager, characters, novelId, this.enhancementThresholds.consistency),
      buildAntiTemplateRules(this.novelManager, this.chapterCache, novelId, chapterNumber, this.enhancementThresholds),
      Promise.resolve(buildCharacterEventContext(characters, events, chapterNumber)),
    ]);
    const antiTemplateRules = antiTemplateResult.antiTemplateRules;
    const recurringDescriptionHints = antiTemplateResult.recurringDescriptionHints;
    const chapterOpeningHints = antiTemplateResult.chapterOpeningHints;
    const payoffDensityHints = antiTemplateResult.payoffDensityHints;

    // 并行加载可选上下文（故事状态机、系列、宇宙锚点）
    const [storyStateResult, seriesResult, universeResult, anchorResult] = await Promise.all([
      this.storyStateManager
        ? this.storyStateManager.getState(novelId).catch(() => null)
        : Promise.resolve(null),
      this.seriesManager
        ? this.seriesManager.findSeriesByNovel(novelId).catch(() => null)
        : Promise.resolve(null),
      this.universeManager
        ? this.universeManager.findUniverseByNovel(novelId).catch(() => null)
        : Promise.resolve(null),
      this.anchorManager
        ? this.anchorManager.buildAnchorContext(novelId).catch(() => '')
        : Promise.resolve(''),
    ]);

    // 处理故事状态机上下文
    let storyStateContext = '';
    let causalChainHints = '';
    let tensionCurveHints = '';
    let relationshipEvolutionHints = '';
    let characterStallHints = '';
    let beliefEvolutionHints = '';
    let chapterAdviceContext = '';

    if (storyStateResult) {
      storyStateContext = this.storyStateManager!.buildStateContext(storyStateResult, chapterNumber);
      const latestSnapshot = storyStateResult.snapshots.length > 0
        ? storyStateResult.snapshots[storyStateResult.snapshots.length - 1]
        : null;
      if (latestSnapshot?.causalChains?.length) {
        const causalPriorities = prioritizeCausalChains(latestSnapshot.causalChains, chapterNumber);
        causalChainHints = buildCausalChainContext(causalPriorities);
      }
      const tensionAnalysis = analyzeTensionCurve(storyStateResult, chapterNumber);
      tensionCurveHints = tensionAnalysis ? buildTensionCurveContext(tensionAnalysis) : '';
      const arcAnalysis = analyzeCharacterArcs(storyStateResult, chapterNumber);
      characterStallHints = buildCharacterStallContext(arcAnalysis);
      const beliefEvolutions = analyzeBeliefEvolution(storyStateResult, chapterNumber);
      beliefEvolutionHints = buildBeliefEvolutionContext(beliefEvolutions);
      const relEvolution = analyzeRelationshipEvolution(storyStateResult, chapterNumber);
      relationshipEvolutionHints = buildRelationshipEvolutionContext(relEvolution);
      const advice = adviseNextChapter(storyStateResult, chapterNumber);
      if (advice) {
        chapterAdviceContext = buildChapterAdviceContext(advice);
      }
    }

    // 处理系列上下文
    const seriesContext = seriesResult && this.seriesManager
      ? this.seriesManager.buildSeriesContext(seriesResult, novelId)
      : '';

    const universeContext = universeResult && this.universeManager
      ? this.universeManager.buildUniverseContext(universeResult, novelId)
      : '';

    // 处理宇宙锚点上下文
    const anchorContext = anchorResult;

    // 角色语言漂移检测（需要近期章节正文 + 角色档案）
    let voiceDriftHints = '';
    let recentChapterContentsForVoice: string[] = [];
    if (chapterNumber > 1) {
      try {
        const startCh = Math.max(1, chapterNumber - 3);
        const chapterPromises: Promise<{ content: string } | null>[] = [];
        for (let i = startCh; i < chapterNumber; i++) {
          chapterPromises.push(this.novelManager.getChapter(novelId, i).catch(() => null));
        }
        const chapters = await Promise.all(chapterPromises);
        recentChapterContentsForVoice = chapters.filter(ch => ch?.content).map(ch => ch!.content);
        if (recentChapterContentsForVoice.length > 0) {
          const driftAnalysis = analyzeVoiceDrift(characters, recentChapterContentsForVoice);
          voiceDriftHints = buildVoiceDriftContext(driftAnalysis);
        }
      } catch (err) { pipelineLog.debug('语言漂移分析失败，已降级跳过', { reason: err instanceof Error ? err.message : String(err) }); }
    }
    if (this.qualityFeatures.enableVoiceAnchors && recentChapterContentsForVoice.length > 0) {
      const anchorHints = buildVoiceAnchorHints({
        characters,
        recentChapterContents: recentChapterContentsForVoice,
      });
      if (anchorHints) {
        voiceDriftHints = [voiceDriftHints, anchorHints].filter(Boolean).join('\n\n');
      }
    }

    const styleProfile = buildStyleGuide({
      genre: novel.genre,
      stylePreset,
      userDirection: anchoredUserDirection,
      styleNotes,
      styleDna,
    });
    const resolvedStartupPlatformProfile = normalizeStartupPlatformProfile(
      startupPlatformProfile ?? novel.startupPlatformProfile,
    );
    const promiseContract = buildNovelPromiseContract({
      ...novel,
      startupPlatformProfile: resolvedStartupPlatformProfile,
    });
    const protagonistNames = characters
      .filter(item => item.role === 'protagonist')
      .map(item => item.name);
    const chapterOutline = outline.chapters.find(item => item.chapterNumber === chapterNumber);
    const chapterPromiseCard = buildChapterPromiseCard({
      chapterNumber,
      totalPlannedChapters: novel.targetChapters || undefined,
      novelTitle: novel.title,
      genre: novel.genre,
      constitution: novel.constitution,
      promiseContract,
      chapterOutline,
    });
    const domainStructureKeywords = buildDomainStructureKeywords(promiseContract);
    const chapterPromiseDelayPressure = detectDeferredPayoffPressure({
      card: chapterPromiseCard,
      recentChapterContents: recentChapterContentsForVoice,
    });
    pipelineTraceLog.info(`[trace] run=${runId} stage=context`, {
      novelId,
      chapterNumber,
      title: novel.title,
      protagonistNames: protagonistNames.slice(0, 6).join('、'),
      previousContextChars: combinedPrevContext.length,
      memoryContextChars: memoryContext.length,
      userDirectionChars: userDirection.length,
    });
    const startupRetentionHints = buildStartupRetentionHints({
      chapterNumber,
      protagonistNames,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      novelTags: novel.tags,
      constitutionTags: novel.constitutionTags,
      platformProfile: resolvedStartupPlatformProfile,
    });

    // 智能取名系统：构建命名约束（AI模板黑名单 + 跨小说避让名单 + 姓氏建议）
    // 仅当 novelManager 支持 listNovels 时才扫描跨小说主角名
    let namingConstraints: string | undefined;
    if (typeof this.novelManager.listNovels === 'function') {
      const nameRegistryDeps: NameRegistryDeps = {
        listNovels: (this.novelManager as { listNovels: NameRegistryDeps['listNovels'] }).listNovels.bind(this.novelManager),
        getCharacters: (novelIdToScan: string) => this.novelManager.getCharacters(novelIdToScan),
      };
      try {
        namingConstraints = await buildNamingConstraints(
          nameRegistryDeps,
          novelId,
          novel.genre,
          characters,
        );
      } catch (err) {
        pipelineTraceLog.warn(`[trace] run=${runId} stage=naming-constraints failed`, {
          novelId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const readerDeliveryContract = buildReaderDeliveryWritingContract({
      genre: novel.genre,
      novelTags: novel.tags,
      constitutionTags: novel.constitutionTags,
    });
    const baseContext: AgentContext = {
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      novelTags: novel.tags,
      constitutionTags: novel.constitutionTags,
      chapterNumber,
      userDirection: anchoredUserDirection,
      stylePreset: styleProfile.resolvedPreset,
      startupPlatformProfile: resolvedStartupPlatformProfile,
      promiseContractSummary: promiseContract.summary,
      promiseOpeningHints: promiseContract.openingHint,
      promisePayoffHints: promiseContract.payoffHint,
      promiseAntiDriftHints: promiseContract.antiDriftHint,
      chapterPromiseCard: [
        chapterPromiseCard.summary,
        chapterPromiseDelayPressure.directive ? `- 延迟兑现强约束：${chapterPromiseDelayPressure.directive}` : '',
      ].filter(Boolean).join('\n'),
      maxWordCount,
      styleGuide: styleProfile.styleGuide,
      previousChapterSummary: combinedPrevContext || undefined,
      characterContext: characterFileContext || undefined,
      worldContext: worldFileContext || undefined,
      consistencyGuardrails: consistencyGuardrailsCtx || undefined,
      antiTemplateRules: antiTemplateRules || undefined,
      characterEventContext: characterEventCtx || undefined,
      storyStateContext: storyStateContext || undefined,
      causalChainHints: causalChainHints || undefined,
      tensionCurveHints: tensionCurveHints || undefined,
      characterStallHints: characterStallHints || undefined,
      beliefEvolutionHints: beliefEvolutionHints || undefined,
      relationshipEvolutionHints: relationshipEvolutionHints || undefined,
      voiceDriftHints: voiceDriftHints || undefined,
      recurringDescriptionHints: recurringDescriptionHints || undefined,
      chapterOpeningHints: chapterOpeningHints || undefined,
      payoffDensityHints: payoffDensityHints || undefined,
      seriesContext: seriesContext || undefined,
      universeContext: universeContext || undefined,
      anchorContext: anchorContext || undefined,
      chapterAdviceContext: chapterAdviceContext || undefined,
      readerDeliveryContract,
      totalPlannedChapters: novel.targetChapters || undefined,
      titleGuidance: novel.titleGuidance || undefined,
      namingConstraints,
      smartGateHints: prevSmartGateHints,
    };

    // 设定基线（创作宪法）：confirmed 基线作为不可漂移的设定骨架注入 Writer；
    // 无基线且已过开篇时自动生成 pending 基线（待人工确认），不阻塞主流程
    let settingBaselineForGate: SettingBaseline | null = null;
    try {
      const settingBaseline = await loadSettingBaseline(getNovelsDir(), novelId);
      settingBaselineForGate = settingBaseline;
      if (settingBaseline) {
        baseContext.baselineContext = buildBaselineContext(settingBaseline);
      } else if (chapterNumber >= BASELINE_AUTO_SNAPSHOT_MIN_CHAPTER) {
        const pendingBaseline = buildSettingBaseline({
          novel: { id: novel.id, genre: novel.genre, title: novel.title, synopsis: novel.synopsis, tags: novel.tags },
          worldEntries,
          characters,
          promiseContract,
          fromChapters: `1-${chapterNumber}`,
        });
        await writePendingBaseline(getNovelsDir(), pendingBaseline);
      }
    } catch (err) {
      pipelineLog.debug('设定基线加载/生成失败，已降级跳过', { reason: err instanceof Error ? err.message : String(err) });
    }
    if (startupRetentionHints.directionHint) {
      baseContext.userDirection = [baseContext.userDirection, startupRetentionHints.directionHint]
        .filter(Boolean)
        .join('\n\n');
    }
    if (startupRetentionHints.openingHint) {
      baseContext.chapterOpeningHints = [baseContext.chapterOpeningHints, startupRetentionHints.openingHint]
        .filter(Boolean)
        .join('\n\n');
    }
    if (startupRetentionHints.payoffHint) {
      baseContext.payoffDensityHints = [baseContext.payoffDensityHints, startupRetentionHints.payoffHint]
        .filter(Boolean)
        .join('\n\n');
    }
    if (promiseContract.directionHint) {
      baseContext.userDirection = [baseContext.userDirection, promiseContract.directionHint]
        .filter(Boolean)
        .join('\n\n');
    }
    if (promiseContract.openingHint) {
      baseContext.chapterOpeningHints = [baseContext.chapterOpeningHints, promiseContract.openingHint]
        .filter(Boolean)
        .join('\n\n');
    }
    if (promiseContract.payoffHint) {
      baseContext.payoffDensityHints = [baseContext.payoffDensityHints, promiseContract.payoffHint]
        .filter(Boolean)
        .join('\n\n');
    }
    if (chapterPromiseDelayPressure.directive) {
      baseContext.userDirection = [baseContext.userDirection, chapterPromiseDelayPressure.directive]
        .filter(Boolean)
        .join('\n\n');
      baseContext.payoffDensityHints = [baseContext.payoffDensityHints, chapterPromiseDelayPressure.directive]
        .filter(Boolean)
        .join('\n\n');
      chapterPromiseGateLog.warn(
        `[deferred-payoff] forced execution pressure active, novel=${novelId} chapter=${chapterNumber} ${chapterPromiseDelayPressure.summary}`,
      );
    }

    // 将大纲修正备注注入一致性门禁，让 Agent 感知前文变动
    const outlineCorrectionNotes = chapterOutline?.notes
      ?.split('\n')
      .filter(l => l.startsWith('[自动修正'))
      .join('\n');
    if (outlineCorrectionNotes) {
      baseContext.consistencyGuardrails = [baseContext.consistencyGuardrails, outlineCorrectionNotes].filter(Boolean).join('\n');
    }

    // 将剧情分支信息注入 userDirection，让 Outline/Writer Agent 按分支方向创作
    const plotBranchDirective = await this.buildPlotBranchDirective(novelId, chapterNumber);
    if (plotBranchDirective) {
      baseContext.userDirection = [baseContext.userDirection, plotBranchDirective].filter(Boolean).join('\n\n');
    }
    baseContext.chapterAdviceContext = [
      baseContext.chapterAdviceContext,
      readerDeliveryContract,
    ].filter(Boolean).join('\n\n');
    const previousChapterNumber = chapterNumber - 1;
    let previousReaderScoreForRepair: number | undefined;
    if (previousChapterNumber >= 1) {
      try {
        const previousChapterForForwardHints = await this.chapterCache.get(this.novelManager, novelId, previousChapterNumber);
        previousReaderScoreForRepair = previousChapterForForwardHints?.readerScore;
        const auditForwardHints = [
          buildNarrativeAuditForwardHints(previousChapterForForwardHints),
          buildReadabilityForwardHints(previousChapterForForwardHints),
          buildReaderDeliveryForwardHints(previousChapterForForwardHints),
          buildMemoryContextForwardHints(previousChapterForForwardHints),
        ].filter(Boolean).join('\n\n');
        const memoryPersistenceForwardHints = buildMemoryPersistenceForwardHints(previousChapterForForwardHints);
        const memoryPersistenceRisk = evaluateMemoryPersistenceForwardRisk(previousChapterForForwardHints);
        const chapterAdviceForwardHints = [
          auditForwardHints,
          memoryPersistenceForwardHints,
        ].filter(Boolean).join('\n\n');
        if (chapterAdviceForwardHints) {
          baseContext.chapterAdviceContext = [
            baseContext.chapterAdviceContext,
            chapterAdviceForwardHints,
          ].filter(Boolean).join('\n\n');
        }
        if (memoryPersistenceForwardHints && memoryPersistenceRisk.shouldPromoteToUserDirection) {
          baseContext.userDirection = [
            baseContext.userDirection,
            memoryPersistenceForwardHints,
          ].filter(Boolean).join('\n\n');
          pipelineLog.warn('previous chapter memory persistence risk promoted to user direction', {
            novelId,
            chapterNumber,
            previousChapterNumber,
            severity: memoryPersistenceRisk.severity,
            codes: memoryPersistenceRisk.codes,
          });
        }
        if (auditForwardHints) {
          baseContext.userDirection = [
            baseContext.userDirection,
            auditForwardHints,
          ].filter(Boolean).join('\n\n');
        }
      } catch (err) {
        pipelineLog.debug('上一章审计前馈构建失败，已降级跳过', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const unresolvedForeshadowing = outline.foreshadowing.filter(item => !item.isResolved);
    const unresolved = unresolvedForeshadowing
      .map(item => `- ${item.hint}（第 ${item.plantedInChapter} 章埋下）`)
      .join('\n');
    if (unresolved) {
      baseContext.unresolvedForeshadowing = unresolved;
    }

    // 情节线依赖图分析
    const threadGraphAnalysis = analyzeThreadGraph(outline.plotThreads);
    const threadGraphContext = buildThreadGraphContext(threadGraphAnalysis);
    if (threadGraphContext) {
      baseContext.plotThreadGraphHints = threadGraphContext;
    }

    // 伏笔编排大师 → 智能选择本章应回收的伏笔（替代机械的紧急度排序）
    const foreshadowingAnalysis = analyzeForeshadowing({
      foreshadowing: outline.foreshadowing,
      currentChapter: chapterNumber,
    });
    if (unresolvedForeshadowing.length > 0) {
      const foreshadowingSchedulerEnabled = readBoolEnv(process.env.FORESHADOWING_SCHEDULER_ENABLED, true);
      const scheduler = foreshadowingSchedulerEnabled
        ? this.agents.get('foreshadowing-scheduler')
        : undefined;
      if (scheduler && foreshadowingAnalysis.overdue.length > 0) {
        try {
          // 获取上一章正文片段供编排大师参考
          let prevChapterSnippet = '';
          if (chapterNumber > 1) {
            const prevChapter = await this.novelManager.getChapter(novelId, chapterNumber - 1);
            if (prevChapter?.content) {
              prevChapterSnippet = prevChapter.content.slice(0, 2000);
            }
          }

          const schedulerInput = [
            '## 上一章正文片段',
            prevChapterSnippet || '（第一章，无前文）',
            '',
            '## 本章大纲',
            chapterOutline?.summary || userDirection || '（无大纲）',
            '',
            '## 未回收伏笔池（JSON）',
            JSON.stringify(unresolvedForeshadowing.map(f => ({
              id: f.id,
              hint: f.hint,
              plantedInChapter: f.plantedInChapter,
              priority: f.priority,
              resolution: f.resolution,
              relatedPlotThreads: f.relatedPlotThreads,
              plannedResolveChapter: f.plannedResolveChapter,
              recoveryPath: f.recoveryPath || '',
            })), null, 2),
            '',
            `## 当前进度：第 ${chapterNumber} 章，共 ${foreshadowingAnalysis.overdue.length} 条逾期伏笔`,
            '',
            '## 选择规则',
            '- 优先选择 plannedResolveChapter == 当前章节（' + chapterNumber + '）的伏笔，按既定规划推进',
            '- 被前置伏笔阻塞的不要选（prerequisites 未回收的）',
            '- 仅在规划路径有空位时才考虑其他逾期伏笔',
          ].join('\n');

          onEvent?.({
            type: 'agent:start',
            agentRole: 'foreshadowing-scheduler',
            novelId,
            chapterNumber,
            data: '',
            timestamp: new Date().toISOString(),
          });

          let streamed = '';
          const SCHEDULER_TIMEOUT = 45_000; // 伏笔编排大师最多 45 秒，超时降级
          const schedulerOutput = await Promise.race([
            scheduler.execute({
              novelId,
              genre: baseContext.genre,
              novelTitle: baseContext.novelTitle,
              novelSynopsis: baseContext.novelSynopsis,
              chapterNumber,
              inputText: schedulerInput,
            }, activeModel, (chunk) => {
              streamed += chunk;
              onEvent?.({
                type: 'agent:chunk',
                agentRole: 'foreshadowing-scheduler',
                novelId,
                chapterNumber,
                data: chunk,
                timestamp: new Date().toISOString(),
              });
            }, signal),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('伏笔编排大师超时，降级到机械选择')), SCHEDULER_TIMEOUT),
            ),
          ]);

          onEvent?.({
            type: 'agent:complete',
            agentRole: 'foreshadowing-scheduler',
            novelId,
            chapterNumber,
            data: schedulerOutput.content,
            timestamp: new Date().toISOString(),
          });

          // 解析编排结果
          const rawContent = streamed || schedulerOutput.content;
          const separatorIdx = rawContent.indexOf('---SCHEDULE_RESULT---');
          if (separatorIdx >= 0) {
            const jsonStr = rawContent.slice(separatorIdx + '---SCHEDULE_RESULT---'.length).trim();
            try {
              const parsed = JSON.parse(jsonStr);
              const scheduled = Array.isArray(parsed.scheduled) ? parsed.scheduled : [];
              if (scheduled.length > 0) {
                // 用编排大师选出的伏笔构建 Writer 提示
                const hints = scheduled.map((s: { id: string; hint: string; integration: string }) => {
                  const original = unresolvedForeshadowing.find(f => f.id === s.id);
                  const elapsed = original ? chapterNumber - original.plantedInChapter : 0;
                  return `- （已过 ${elapsed} 章）：${s.hint}\n  融入建议：${s.integration}`;
                }).join('\n');
                baseContext.foreshadowingHints = '以下伏笔由编排大师选定，适合在本章自然回收：\n' + hints;
              }
            } catch (err) { pipelineLog.debug('伏笔编排大师 JSON 解析失败，降级到机械选择', { reason: err instanceof Error ? err.message : String(err) }); }
          }
        } catch (err) {
          onEvent?.({
            type: 'agent:error',
            agentRole: 'foreshadowing-scheduler',
            novelId,
            chapterNumber,
            data: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          });
          pipelineLog.debug('伏笔编排大师执行失败，降级到机械选择', { reason: err instanceof Error ? err.message : String(err) });
        }
      }

      // 降级：如果编排大师未产出结果，使用机械预算选择
      if (!baseContext.foreshadowingHints && foreshadowingAnalysis.overdue.length > 0) {
        const FORESHADOWING_BUDGET = 3;
        const overdue = foreshadowingAnalysis.overdue;

        // 优先选择 plannedResolveChapter == 当前章节 的伏笔（按规划路径推进）
        const plannedForThisChapter = overdue.filter(
          s => s.item.plannedResolveChapter === chapterNumber,
        );
        const selected: typeof overdue = [];
        const usedThreads = new Set<string>();

        for (const item of plannedForThisChapter) {
          if (selected.length >= FORESHADOWING_BUDGET) break;
          const threads = item.item.relatedPlotThreads;
          const threadKey = threads.length > 0 ? threads[0] : item.item.id;
          if (!usedThreads.has(threadKey)) {
            usedThreads.add(threadKey);
            selected.push(item);
          }
        }

        // 不够时再从普通逾期伏笔中补足
        for (const item of overdue) {
          if (selected.length >= FORESHADOWING_BUDGET) break;
          if (selected.includes(item)) continue;
          const threads = item.item.relatedPlotThreads;
          const threadKey = threads.length > 0 ? threads[0] : item.item.id;
          if (!usedThreads.has(threadKey)) {
            usedThreads.add(threadKey);
            selected.push(item);
          }
        }
        if (selected.length < FORESHADOWING_BUDGET) {
          for (const item of overdue) {
            if (selected.length >= FORESHADOWING_BUDGET) break;
            if (selected.includes(item)) continue;
            const threads = item.item.relatedPlotThreads;
            if (threads.length > 0 && usedThreads.has(threads[0])) {
              selected.push(item);
            }
          }
        }

        baseContext.foreshadowingHints = buildForeshadowingContextHints(selected);
      }
    }

    // 伏笔回温曲线推理 + 密度健康度诊断 → 注入 Writer 上下文
    try {
      const allForeshadowing = outline.foreshadowing;
      if (allForeshadowing.length > 0) {
        // 回温曲线：推理每条伏笔处于哪个生命周期阶段
        const rewarmReport = assessRewarmCurve({
          foreshadowing: allForeshadowing,
          currentChapter: chapterNumber,
        });
        if (rewarmReport.contextPrompt) {
          baseContext.foreshadowingHints = [
            baseContext.foreshadowingHints,
            rewarmReport.contextPrompt,
          ].filter(Boolean).join('\n\n');
        }

        // 密度诊断：全局健康度评估（每 5 章诊断一次，避免上下文膨胀）
        if (chapterNumber % 5 === 0 || chapterNumber <= 3) {
          const densityReport = diagnoseForeshadowingHealth({
            foreshadowing: allForeshadowing,
            currentChapter: chapterNumber,
          });
          const densityPrompt = buildDensityContextPrompt(densityReport);
          if (densityPrompt) {
            baseContext.foreshadowingHints = [
              baseContext.foreshadowingHints,
              densityPrompt,
            ].filter(Boolean).join('\n\n');
          }
        }
      }
    } catch (err) { pipelineLog.debug('伏笔回温/密度诊断失败，已降级跳过', { reason: err instanceof Error ? err.message : String(err) }); }

    // 节奏单调性检测 → 注入 Writer 上下文
    try {
      const pacingData = await this.novelManager.getPacing(novelId);
      if (pacingData.length >= 2) {
        const profiles = pacingData.map((p: ChapterPacing) => p.profile);
        if (detectMonotony(profiles)) {
          baseContext.pacingHints = buildPacingVariationHints(profiles[profiles.length - 1]);
        }
      }
    } catch (err) { pipelineLog.debug('节奏分析失败，已降级跳过', { reason: err instanceof Error ? err.message : String(err) }); }

    let superLongContextPatch: Partial<AgentContext> = {};
    let superLongDiagnostics: ChapterGenerationResult['superLongDiagnostics'] = createDisabledSuperLongDiagnostics();
    if (this.longFormFeatures.superLongModeEnabled) {
      try {
        const superLongHints = await buildSuperLongModeHints({
          enabled: true,
          novelManager: this.novelManager,
          novelId,
          novel,
          chapterNumber,
          outline,
          chapterOutline,
          characters,
          storyState: storyStateResult,
          foreshadowingAnalysis,
          threadGraphAnalysis,
        });

        if (superLongHints.layeredMemoryHint) {
          superLongContextPatch.previousChapterSummary = [baseContext.previousChapterSummary, superLongHints.layeredMemoryHint]
            .filter(Boolean)
            .join('\n\n');
        }
        if (superLongHints.characterLedgerHint) {
          superLongContextPatch.characterContext = [baseContext.characterContext, superLongHints.characterLedgerHint]
            .filter(Boolean)
            .join('\n\n');
        }
        if (superLongHints.timelineEngineHint) {
          superLongContextPatch.storyStateContext = [baseContext.storyStateContext, superLongHints.timelineEngineHint]
            .filter(Boolean)
            .join('\n\n');
        }
        if (superLongHints.foreshadowDebtHint) {
          superLongContextPatch.foreshadowingHints = [baseContext.foreshadowingHints, superLongHints.foreshadowDebtHint]
            .filter(Boolean)
            .join('\n\n');
        }
        if (superLongHints.antiAiRadarHint) {
          superLongContextPatch.antiTemplateRules = [baseContext.antiTemplateRules, superLongHints.antiAiRadarHint]
            .filter(Boolean)
            .join('\n\n');
        }
        if (superLongHints.povLockHint) {
          superLongContextPatch.styleGuide = [baseContext.styleGuide, superLongHints.povLockHint]
            .filter(Boolean)
            .join('\n\n');
        }
        if (superLongHints.chapterGoalBudgetHint) {
          superLongContextPatch.chapterAdviceContext = [baseContext.chapterAdviceContext, superLongHints.chapterGoalBudgetHint]
            .filter(Boolean)
            .join('\n\n');
        }
        if (superLongHints.hookPlannerHint) {
          superLongContextPatch.payoffDensityHints = [baseContext.payoffDensityHints, superLongHints.hookPlannerHint]
            .filter(Boolean)
            .join('\n\n');
        }
      } catch {
        // 超长篇增强提示失败不影响主流程
      }
    }

    if (this.longFormFeatures.superLongModeEnabled) {
      const overdueCount = foreshadowingAnalysis.overdue.length;
      const criticalOverdueCount = foreshadowingAnalysis.overdue.filter(item => item.urgency === 'critical').length;
      const activeForeshadowCount = foreshadowingAnalysis.active.length;
      const blockedThreadsCount = threadGraphAnalysis.blocked.length;
      const readyThreadsCount = threadGraphAnalysis.readyToAdvance.length;
      const storySnapshotsCount = storyStateResult?.snapshots.length ?? 0;

      const modules: SuperLongDiagnosticsModule[] = SUPER_LONG_MODULE_META.map(({ key, title }) => {
        const enabled =
          key === 'layered-memory' ? Boolean(superLongContextPatch.previousChapterSummary)
          : key === 'character-ledger' ? Boolean(superLongContextPatch.characterContext)
          : key === 'timeline-engine' ? Boolean(superLongContextPatch.storyStateContext)
          : key === 'foreshadow-debt' ? Boolean(superLongContextPatch.foreshadowingHints)
          : key === 'anti-ai-radar' ? Boolean(superLongContextPatch.antiTemplateRules)
          : key === 'pov-lock' ? Boolean(superLongContextPatch.styleGuide)
          : key === 'chapter-goal-budget' ? Boolean(superLongContextPatch.chapterAdviceContext)
          : Boolean(superLongContextPatch.payoffDensityHints);

        if (key === 'layered-memory') {
          return {
            key,
            title,
            enabled,
            score: enabled ? 88 : 35,
            summary: enabled
              ? '已注入全书 / 分卷 / 近章三级记忆。'
              : '未生成分层记忆提示，可能因历史章节不足。',
            evidence: [`历史章节 ${Math.max(0, chapterNumber - 1)} 章`, '近章窗口 20 章'],
          };
        }
        if (key === 'character-ledger') {
          return {
            key,
            title,
            enabled,
            score: enabled ? clampScore(80 + Math.min(12, Math.max(0, characters.length - 2))) : 30,
            summary: enabled ? '角色身份、称谓和关系约束已注入。' : '未生成角色账本提示。',
            evidence: [`角色池 ${characters.length}`],
          };
        }
        if (key === 'timeline-engine') {
          return {
            key,
            title,
            enabled,
            score: enabled
              ? (storySnapshotsCount > 0 ? 90 : 78)
              : (storySnapshotsCount > 0 ? 40 : 60),
            summary: enabled ? '时间锚点与因果待兑现链路已注入。' : '未生成时间线引擎提示。',
            evidence: [`状态快照 ${storySnapshotsCount}`],
          };
        }
        if (key === 'foreshadow-debt') {
          return {
            key,
            title,
            enabled,
            score: enabled
              ? clampScore(88 - overdueCount * 5 - criticalOverdueCount * 4)
              : (overdueCount > 0 ? 28 : 62),
            summary: enabled
              ? `已注入伏笔债务：逾期 ${overdueCount} 条。`
              : '未生成伏笔债务提示。',
            evidence: [
              `逾期 ${overdueCount} 条`,
              `严重逾期 ${criticalOverdueCount} 条`,
              `活跃 ${activeForeshadowCount} 条`,
            ],
          };
        }
        if (key === 'anti-ai-radar') {
          return {
            key,
            title,
            enabled,
            score: enabled ? 78 : 92,
            summary: enabled ? '检测到近期表达重复风险，已注入去重策略。' : '近期未触发高频重复表达告警。',
          };
        }
        if (key === 'pov-lock') {
          return {
            key,
            title,
            enabled,
            score: enabled ? 86 : 62,
            summary: enabled ? '已注入主视角与叙述距离约束。' : '未生成视角锁提示。',
          };
        }
        if (key === 'chapter-goal-budget') {
          return {
            key,
            title,
            enabled,
            score: enabled ? 91 : 40,
            summary: enabled ? '剧情 / 人物 / 世界 / 钩子预算已注入。' : '未生成章节目标预算提示。',
            evidence: [`目标总章数 ${novel.targetChapters ?? chapterNumber}`],
          };
        }
        return {
          key,
          title,
          enabled,
          score: enabled
            ? clampScore(86 - blockedThreadsCount * 4 - Math.max(0, overdueCount - 1) * 2)
            : 45,
          summary: enabled ? '已生成章节末尾钩子策略。' : '未生成断章钩子规划提示。',
          evidence: [`可推进线 ${readyThreadsCount} 条`, `受阻线 ${blockedThreadsCount} 条`],
        };
      });

      const activeModules = modules.filter(item => item.enabled);
      const averageScore = activeModules.length > 0
        ? clampScore(activeModules.reduce((sum, item) => sum + (item.score ?? 0), 0) / activeModules.length)
        : 0;

      const riskSignals: string[] = [];
      if (overdueCount > 0) {
        riskSignals.push(`伏笔逾期 ${overdueCount} 条`);
      }
      if (blockedThreadsCount > 0) {
        riskSignals.push(`受阻情节线 ${blockedThreadsCount} 条`);
      }

      superLongDiagnostics = {
        enabled: true,
        summary: activeModules.length > 0
          ? `已启用：${activeModules.length}/8 模块生效，稳定度 ${averageScore}。${riskSignals.length > 0 ? riskSignals.join('；') : '长线负债可控。'}`
          : '已启用，但本章未生成有效的超长篇增强模块。',
        modules,
      };
    }

    // Outline Agent 只需要轻量角色列表，不需要完整档案
    let outlineOutput = await runAgent('outline', {
      ...baseContext,
      characterContext: characterLightContext || undefined,
      temperatureOverride: getAdaptiveTemperature('outline', false),
    });
    const outlineAnchorAudit = auditUserDirectionAnchors({
      direction: userDirection,
      content: outlineOutput.content,
      stage: 'outline',
    });
    if (outlineAnchorAudit.shouldRepair) {
      const repairInstruction = buildUserDirectionAnchorRepairInstruction(outlineAnchorAudit);
      pipelineTraceLog.warn(`[trace] run=${runId} stage=outline.anchor-retry`, {
        novelId,
        chapterNumber,
        missingAnchors: outlineAnchorAudit.missingAnchors,
        coverage: outlineAnchorAudit.coverage,
      });
      outlineOutput = await runAgent('outline', {
        ...baseContext,
        userDirection: [baseContext.userDirection, repairInstruction].filter(Boolean).join('\n\n'),
        characterContext: characterLightContext || undefined,
        temperatureOverride: getAdaptiveTemperature('outline', true),
      });
    }
    let scenePlan = buildScenePlanFromOutline(outlineOutput.content, chapterNumber);
    const outlineContract = buildOutlineContract({
      chapterNumber,
      chapterOutline,
      outlineText: outlineOutput.content,
      unresolvedForeshadowing,
      maxRequired: this.outlineFeatures.maxRequired,
    });

    const contextWithOutline: AgentContext = {
      ...baseContext,
      outlineContext: outlineOutput.content,
      scenePlan,
      outlineContract: outlineContract.prompt || undefined,
    };
    const onStageCharacterIds = ChapterPipeline.collectOnStageCharacterIds({
      chapterOutline,
      outlineText: outlineOutput.content,
      characters,
    });
    // 分层披露：登场角色输出完整档案，其余角色仅输出一行摘要
    const scopedCharacterFileContext = onStageCharacterIds.size > 0
      ? buildCharacterContext(characters, {
          identityRuleFocusCharacterIds: [...onStageCharacterIds],
          relevantCharacterIds: onStageCharacterIds,
        })
      : characterFileContext;
    contextWithOutline.characterContext = scopedCharacterFileContext || undefined;
    const openingSupervisorEnabled = readBoolEnv(process.env.OPENING_SUPERVISOR_ENABLED, true);
    if (openingSupervisorEnabled && chapterNumber <= 3 && this.agents.has('opening-supervisor')) {
      try {
        const openingSupervisorOutput = await runAgent('opening-supervisor', {
          ...contextWithOutline,
          previousChapterSummary: combinedPrevContext || undefined,
          temperatureOverride: 0.35,
        });
        if (openingSupervisorOutput.content.trim()) {
          contextWithOutline.chapterOpeningHints = [
            contextWithOutline.chapterOpeningHints,
            '开篇三章总监执行要点\n' + openingSupervisorOutput.content.trim(),
          ].filter(Boolean).join('\n\n');
        }
      } catch (err) {
        pipelineLog.debug('开篇三章总监执行失败，已降级跳过', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (this.qualityFeatures.enablePatternRotationCache) {
      const rotationHints = patternRotationCache.buildHints(novelId);
      if (rotationHints.openingHint) {
        contextWithOutline.chapterOpeningHints = [
          contextWithOutline.chapterOpeningHints,
          `章节开头轮换缓存提示\n- ${rotationHints.openingHint}`,
        ].filter(Boolean).join('\n');
      }
      if (rotationHints.hookHint) {
        contextWithOutline.payoffDensityHints = [
          contextWithOutline.payoffDensityHints,
          `章末钩子轮换缓存提示\n- ${rotationHints.hookHint}`,
        ].filter(Boolean).join('\n');
      }
    }

    if (this.qualityFeatures.enableAntiClicheDetection) {
      try {
        const patternDB = loadPatternDB(getNovelsDir(), novelId);
        const hints: string[] = [];
        if (patternDB.totalChapters >= 2) {
          const clicheReport = detectClichePatterns('', patternDB);
          if (clicheReport.writerHints.length > 0) {
            hints.push(...clicheReport.writerHints);
          }
        }
        try {
          const { getGlobalClichePatterns } = await import('./pattern-freq-store.js');
          const globalPatterns = getGlobalClichePatterns(getNovelsDir());
          if (globalPatterns.length > 0) {
            hints.push(`以下表达在多部小说中高频出现，请避免或换用：${globalPatterns.slice(0, 10).join('、')}`);
          }
        } catch { /* 全局库未启用时静默 */ }
        try {
          const { loadLearnedClichePatterns, loadGlobalLearnedClichePatterns } = await import('./cliche-diff-learner.js');
          const learnedNovel = loadLearnedClichePatterns({ novelId, novelsDir: getNovelsDir() });
          const learnedGlobal = loadGlobalLearnedClichePatterns(getNovelsDir());
          const allLearned = [...new Set([...learnedNovel, ...learnedGlobal])];
          if (allLearned.length > 0) {
            hints.push(`以下表达在历史章节中被Editor修正过，请避免：${allLearned.slice(0, 10).join('、')}`);
          }
        } catch { /* diff学习未启用时静默 */ }
        if (hints.length > 0) {
          contextWithOutline.antiClicheHints = hints.join('\n');
          pipelineLog.info(`[anti-cliche] novel=${novelId} hints injected (${hints.length} items)`);
        }
      } catch (err) {
        pipelineLog.debug('反套路化提示注入失败（已降级）', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let truthFilesPresent = false;
    let truthFilesContext = '';
    let truthFilesUsedInPrompt = false;
    let truthFilesSections: string[] = [];
    let truthFilesBundle: TruthFileBundle | null = null;
    try {
      const truthFiles = await loadTruthFiles(novelId, getNovelsDir());
      truthFilesBundle = truthFiles;
      truthFilesPresent = Boolean(
        truthFiles.currentState
        || truthFiles.pendingHooks
        || truthFiles.characterMatrix,
      );
      const truthContextPreview = buildTruthContextPreview({
        bundle: truthFiles,
        currentChapter: chapterNumber,
      });
      truthFilesContext = truthContextPreview.text;
      truthFilesSections = truthContextPreview.sections;
      if (truthContextPreview.enabled && truthFilesContext) {
        contextWithOutline.storyStateContext = [
          contextWithOutline.storyStateContext,
          truthFilesContext,
        ].filter(Boolean).join('\n\n');
        truthFilesUsedInPrompt = true;
        pipelineLog.info('truth context preview injected', {
          novelId,
          chapterNumber,
          chars: truthContextPreview.chars,
          sections: truthContextPreview.sections,
        });
      }
    } catch (err) {
      truthFilesPresent = false;
      truthFilesContext = '';
      truthFilesUsedInPrompt = false;
      truthFilesSections = [];
      truthFilesBundle = null;
      pipelineLog.debug('truth context preview skipped', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    const useOrchestrator = this.memoryOrchestratorFeatures.enabled && this.rawVectorSearch;
    let memoryWorldCtx: string;
    let memoryCharCtx: string;
    let mergedPreviousSummary: string | undefined;
    let memoryAuditParts: {
      digestCtx: string;
      arcCtx: string;
      enhancedChapterCtx: string;
      factCtx: string;
      threadCtx: string;
      characterStateCtx: string;
    } = {
      digestCtx: '',
      arcCtx: '',
      enhancedChapterCtx: '',
      factCtx: '',
      threadCtx: '',
      characterStateCtx: '',
    };

    if (useOrchestrator) {
      pipelineLog.info('Using memory orchestrator for context retrieval');
      const orchestratorResult = await loadOrchestratorMemoryContext({
        rawSearch: this.rawVectorSearch!,
        novelManager: this.novelManager,
        novelId,
        userDirection,
        outlineContent: outlineOutput.content,
        chapterNumber,
        chapterCount: novel.chapterCount || chapterNumber,
        previousChapterContext: prevChapterContext,
        focusCharacterIds: onStageCharacterIds.size > 0
          ? [...onStageCharacterIds].slice(0, 3)
          : undefined,
        characterAliases: new Map(
          characters
            .filter(c => c.aliases && c.aliases.length > 0)
            .map(c => [c.name, c.aliases] as const),
        ),
        genre: novel.genre,
        truthFiles: truthFilesBundle
          ? { loadBundle: async () => truthFilesBundle }
          : undefined,
      });
      memoryWorldCtx = orchestratorResult.memoryWorldCtx;
      memoryCharCtx = orchestratorResult.memoryCharCtx;
      mergedPreviousSummary = orchestratorResult.mergedPreviousSummary;
      memoryAuditParts = {
        digestCtx: orchestratorResult.digestCtx,
        arcCtx: orchestratorResult.arcCtx,
        enhancedChapterCtx: orchestratorResult.enhancedChapterCtx,
        factCtx: orchestratorResult.factCtx,
        threadCtx: orchestratorResult.threadCtx,
        characterStateCtx: orchestratorResult.characterStateCtx,
      };
    } else {
      const memoryQueries = buildMultiQuerySearches(userDirection, outlineOutput.content);
      const legacyResult = await loadEnhancedMemoryContext({
        memory: this.memory,
        novelId,
        userDirection,
        outlineContent: outlineOutput.content,
        chapterNumber,
        previousChapterContext: prevChapterContext,
        queries: memoryQueries,
        logger: memoryLog,
        chapterCount: novel.chapterCount || chapterNumber,
        focusCharacterIds: onStageCharacterIds.size > 0
          ? [...onStageCharacterIds].slice(0, 3)
          : undefined,
        characterAliases: new Map(
          characters
            .filter(c => c.aliases && c.aliases.length > 0)
            .map(c => [c.name, c.aliases] as const),
        ),
        genre: novel.genre,
        memoryPriority: novel.memoryPriority,
      });
      memoryWorldCtx = legacyResult.memoryWorldCtx;
      memoryCharCtx = legacyResult.memoryCharCtx;
      mergedPreviousSummary = legacyResult.mergedPreviousSummary;
      memoryAuditParts = {
        digestCtx: legacyResult.digestCtx,
        arcCtx: legacyResult.arcCtx,
        enhancedChapterCtx: legacyResult.enhancedChapterCtx,
        factCtx: legacyResult.factCtx,
        threadCtx: legacyResult.threadCtx,
        characterStateCtx: legacyResult.characterStateCtx,
      };
    }

    if (mergedPreviousSummary) {
      contextWithOutline.previousChapterSummary = mergedPreviousSummary;
    }

    const reusableWorldEntries = worldEntries.filter(entry => !entry.tags.includes('auto-generated'));
    const worldQuery = [userDirection, outlineOutput.content].filter(Boolean).join('\n');
    let selectedWorldCards = [] as ReturnType<typeof selectWorldCardsV2>;

    if (this.worldFeatures.retrievalV2Enabled) {
      selectedWorldCards = selectWorldCardsV2({
        entries: reusableWorldEntries,
        query: worldQuery,
        chapterNumber,
        memoryWorldContext: memoryWorldCtx,
        topK: this.worldFeatures.retrievalTopK,
      });

      const cardContext = buildWorldContextV2({
        entries: reusableWorldEntries,
        query: worldQuery,
        chapterNumber,
        memoryWorldContext: memoryWorldCtx,
        topK: this.worldFeatures.retrievalTopK,
      });
      if (cardContext) {
        contextWithOutline.worldContext = cardContext;
      } else if (memoryWorldCtx) {
        contextWithOutline.worldContext = [worldFileContext, memoryWorldCtx].filter(Boolean).join('\n\n');
      }
    } else if (memoryWorldCtx) {
      contextWithOutline.worldContext = [worldFileContext, memoryWorldCtx].filter(Boolean).join('\n\n');
    }

    if (memoryCharCtx) {
      contextWithOutline.characterContext = [scopedCharacterFileContext, memoryCharCtx].filter(Boolean).join('\n\n');
    }
    const cultureStoryHooks = buildCultureStoryHooks({
      worldEntries: reusableWorldEntries,
      selectedWorldCards,
      chapterNumber,
    });
    if (cultureStoryHooks) {
      contextWithOutline.cultureStoryHooks = cultureStoryHooks;
    }

    const factionFrontsCtx = buildFactionFronts({
      worldEntries: reusableWorldEntries,
      chapterNumber,
    });
    if (factionFrontsCtx) {
      contextWithOutline.factionFronts = factionFrontsCtx;
    }

    let worldContract: WorldContract | undefined;
    if (this.worldFeatures.contractEnabled) {
      worldContract = buildWorldContract({
        entries: reusableWorldEntries,
        chapterNumber,
        query: worldQuery || userDirection,
        memoryWorldContext: memoryWorldCtx,
        topK: this.worldFeatures.retrievalTopK,
        selectedCards: selectedWorldCards,
      });
      if (worldContract.prompt) {
        contextWithOutline.worldContract = worldContract.prompt;
      }
    }

    // world-builder 和 character 并行执行
    // 带缓存：如果输入指纹没变（同一小说相邻章节），直接复用上一章的输出，跳过 AI 调用
    const WORLD_BUILDER_TIMEOUT_MS = 120_000;
    const _novelsDir = getNovelsDir();

    // 计算输入指纹
    const worldFingerprint = computeAgentFingerprint({
      outlineText: contextWithOutline.outlineContext,
      worldContext: contextWithOutline.worldContext,
      worldContract: contextWithOutline.worldContract,
      includeOutline: true,
      cacheVersion: 'world-builder-canon-v2',
    });
    const charFingerprint = computeAgentFingerprint({
      outlineText: contextWithOutline.outlineContext,
      characterContext: contextWithOutline.characterContext,
      worldContract: contextWithOutline.worldContract,
    });

    // 尝试读缓存
    const [cachedWorld, cachedChar] = await Promise.all([
      getCachedAgentOutput(_novelsDir, novelId, 'world-builder', worldFingerprint),
      getCachedAgentOutput(_novelsDir, novelId, 'character', charFingerprint),
    ]);

    const [worldOutput, charOutput] = await Promise.all([
      cachedWorld
        ? (() => {
            pipelineLog.info(`[agent-cache] world-builder 命中缓存，跳过 AI 调用 novel=${novelId} chapter=${chapterNumber}`);
            onEvent?.({ type: 'agent:complete', agentRole: 'world-builder', novelId, chapterNumber, data: cachedWorld, timestamp: new Date().toISOString(), usage: { inputTokens: 0, outputTokens: 0 } });
            return { agentRole: 'world-builder' as const, content: cachedWorld, timestamp: new Date().toISOString() };
          })()
        : Promise.race([
            runAgent('world-builder', {
              ...contextWithOutline,
              temperatureOverride: getAdaptiveTemperature('world-builder', false),
            }),
            new Promise<Awaited<ReturnType<typeof runAgent>>>((_, reject) =>
              setTimeout(() => reject(new Error('世界架构师 AI 调用超时，降级使用已检索的世界设定')), WORLD_BUILDER_TIMEOUT_MS),
            ),
          ]).then(async (out) => {
            // 保存到缓存
            await saveAgentOutputToCache(_novelsDir, novelId, 'world-builder', out.content, worldFingerprint, chapterNumber);
            return out;
          }).catch(async (err): Promise<Awaited<ReturnType<typeof runAgent>>> => {
            const errMsg = err instanceof Error ? err.message : String(err);
            const fallbackWorldCtx = typeof contextWithOutline.worldContext === 'string'
              ? contextWithOutline.worldContext
              : '';
            console.warn(`[chapter-pipeline] world-builder timed out (${WORLD_BUILDER_TIMEOUT_MS}ms), falling back to ${fallbackWorldCtx.length} chars of pre-retrieved world context`);

            onEvent?.({
              type: 'agent:error',
              agentRole: 'world-builder',
              novelId,
              chapterNumber,
              data: errMsg,
              timestamp: new Date().toISOString(),
            });
            onEvent?.({
              type: 'agent:complete',
              agentRole: 'world-builder',
              novelId,
              chapterNumber,
              data: fallbackWorldCtx,
              timestamp: new Date().toISOString(),
              usage: { inputTokens: 0, outputTokens: 0 },
            });

            return {
              agentRole: 'world-builder',
              content: fallbackWorldCtx,
              timestamp: new Date().toISOString(),
            };
          }),
      cachedChar
        ? (() => {
            pipelineLog.info(`[agent-cache] character 命中缓存，跳过 AI 调用 novel=${novelId} chapter=${chapterNumber}`);
            onEvent?.({ type: 'agent:complete', agentRole: 'character', novelId, chapterNumber, data: cachedChar, timestamp: new Date().toISOString(), usage: { inputTokens: 0, outputTokens: 0 } });
            return { agentRole: 'character' as const, content: cachedChar, timestamp: new Date().toISOString() };
          })()
        : runAgent('character', {
            ...contextWithOutline,
            temperatureOverride: getAdaptiveTemperature('character', false),
          }).then(async (out) => {
            await saveAgentOutputToCache(_novelsDir, novelId, 'character', out.content, charFingerprint, chapterNumber);
            return out;
          }),
    ]);

    const startupFunctionalScenePlan = ENABLE_STARTUP_FUNCTIONAL_SCENE_MODE
      ? buildStartupFunctionalScenePlan({
        chapterNumber,
        outlineText: outlineOutput.content,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        promiseContract,
        chapterPromiseCard,
        maxWordCount,
      })
      : null;
    if (startupFunctionalScenePlan) {
      scenePlan = startupFunctionalScenePlan.scenePlan;
      contextWithOutline.scenePlan = scenePlan;
    }

    // 解析技能并注入到 Writer 上下文
    const skillService = getAgentSkillService();
    const resolvedSkills = await skillService.resolveSkills({
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      novelTags: novel.tags,
      constitutionTags: novel.constitutionTags,
      role: 'writer',
      chapterNumber,
      triggerContext: {
        chapterType: chapterOutline ? inferChapterTypeFn(userDirection, chapterOutline.summary) : undefined,
        plotThreadsAdvanced: chapterOutline?.plotThreadsAdvanced,
        tensionTarget: chapterOutline?.tensionTarget,
        platformProfile: resolvedStartupPlatformProfile,
        maxWordCount,
      },
    });

    // 前缀注入：在关键节点强制插入题材专属前缀（仅当 chapterOutline 存在时）
    let enhancedOutlineText = outlineOutput.content;
    if (chapterOutline) {
      const prefixInjector = new PrefixInjector();
      const enhancedOutline = prefixInjector.injectPrefix(
        chapterOutline,
        contextWithOutline.constitutionTags || [],
      );
      // 将增强后的 outline 转换为文本，替换原始 outlineContext
      enhancedOutlineText = `章节 ${enhancedOutline.chapterNumber}: ${enhancedOutline.title}\n\n${enhancedOutline.summary}\n\n节奏点：\n${enhancedOutline.beats.map((b, i) => `${i + 1}. ${b.summary}`).join('\n')}`;
    }

    const worldBuilderGuidance = buildWriterWorldGuidance(worldOutput.content);
    const writerContext: AgentContext = {
      ...contextWithOutline,
      ...superLongContextPatch,
      outlineContext: enhancedOutlineText, // 使用增强后的 outline 文本
      worldContext: contextWithOutline.worldContext,
      worldBuilderGuidance,
      characterContext: [charOutput.content, superLongContextPatch.characterContext].filter(Boolean).join('\n\n'),
      worldContract: worldContract?.prompt,
      cultureStoryHooks: contextWithOutline.cultureStoryHooks,
      factionFronts: contextWithOutline.factionFronts,
      temperatureOverride: getAdaptiveTemperature('writer', false),
      customInstructions: resolvedSkills.systemPromptAppendix || undefined,
    };
    const editorBaseContext = { ...writerContext };
    for (const key of EDITOR_EXCLUDED_CONTEXT_KEYS) {
      if (key in editorBaseContext) {
        (editorBaseContext as Record<string, unknown>)[key] = undefined;
      }
    }

    const editorContext: AgentContext = {
      ...editorBaseContext,
      inputText: '',
      worldContract: worldContract?.prompt,
      temperatureOverride: getAdaptiveTemperature('editor', false),
    };

    let chapterDraftText = '';
    let polishedText = '';
    let finalEditedContent = '';
    let editorSuggestedTitle = '';
    let generatedScenes: Scene[] | undefined;
    const sceneMode = startupFunctionalScenePlan ? true : undefined;

    if (startupFunctionalScenePlan) {
      generatedScenes = startupFunctionalScenePlan.scenes.map(scene => ({ ...scene }));
      const sceneDrafts: string[] = [];
      const sceneEditedOutputs: string[] = [];
      let previousSceneContent = '';
      const buildStartupSceneDirective = (sceneIndex: number): string | undefined => {
        const directives: string[] = [];
        const isLastScene = sceneIndex === generatedScenes!.length - 1;
        const isSecondScene = sceneIndex === 1;
        const isFirstScene = sceneIndex === 0;

        if (chapterPromiseCard.genreFocus === 'romance' && isSecondScene) {
          directives.push(
            '当前是恋爱启动章中段功能块，必须落成不可回退的关系推进（公开同框/被迫合作/同居规则确认/签字领证至少一项），不要只停在互怼试探。',
          );
        }
        if (chapterPromiseCard.genreFocus === 'romance' && isLastScene) {
          directives.push(
            '当前是恋爱启动章最后功能块，章尾必须落在关系推进钩子（靠近、护短、失控在意、身份绑定后的下一步）。',
          );
          directives.push(
            '禁止把账户、空壳公司、资金链、幕后调查写成主结尾；这些信息最多一句带过，不能夺走章尾焦点。',
          );
        }
        if (chapterPromiseCard.genreFocus === 'survival' && isFirstScene) {
          directives.push(
            '当前是生存启动章第一功能块，只能写绝境、资源缺口、入口触发和进入决定；禁止提前写交易成功、贡献点到账、净水装置改善或下个世界预告。',
          );
        }
        if (chapterPromiseCard.genreFocus === 'survival' && isSecondScene) {
          directives.push(
            '当前是生存启动章第二功能块，重点是异界快速换货、带回验证、第一次公开兑换；禁止重新铺开绝境开局，也不要把车厢长期经营和下一轮计划全部写完。',
          );
        }
        if (chapterPromiseCard.genreFocus === 'survival' && isLastScene) {
          directives.push(
            '当前是生存启动章最后功能块，必须承接“资源已带回、价值已验证”的新局面，只写条件改善、余波交易、车厢/据点新威胁和下一轮资源窗口。',
          );
          directives.push(
            '禁止重新从被推进车厢、发现界门、第一次交易写起；前情最多一句带过，随后立刻进入新的改善结果和更近的风险。',
          );
        }

        if (!isLastScene) {
          directives.push(
            '当前不是最后功能块，不要提前把后续功能块的核心回报和章尾钩子一次写完；写到本块任务落地就收住。',
          );
        }

        return directives.length > 0 ? directives.join('\n') : undefined;
      };

      const generateStartupSceneSegment = async (
        scene: Scene,
        previousContent: string,
        extraDirective?: string,
        traceSuffix = '',
      ): Promise<{
        draftText: string;
        polishedSceneText: string;
        editorOutputText: string;
      }> => {
        const mergedDirective = [writerContext.userDirection, extraDirective].filter(Boolean).join('\n\n');
        const sceneWriterContext: AgentContext = {
          ...writerContext,
          userDirection: mergedDirective || undefined,
          maxWordCount: scene.wordTarget || writerContext.maxWordCount,
          sceneNumber: scene.sceneNumber,
          sceneSummary: scene.summary,
          sceneCharacters: scene.characters.join('、') || undefined,
          sceneLocation: scene.location || undefined,
          sceneTensionTarget: scene.tension,
          sceneWordTarget: scene.wordTarget || undefined,
          previousSceneContent: previousContent || undefined,
          fullScenePlan: scenePlan,
        };
        const sceneWriterOutput = await runAgent('writer', sceneWriterContext);
        traceStage(
          `writer.scene-${scene.sceneNumber}${traceSuffix}`,
          sceneWriterOutput.content,
        );

        const sceneEditorContext: AgentContext = {
          ...editorBaseContext,
          userDirection: [editorBaseContext.userDirection, extraDirective].filter(Boolean).join('\n\n') || undefined,
          maxWordCount: scene.wordTarget || writerContext.maxWordCount,
          sceneNumber: scene.sceneNumber,
          sceneSummary: scene.summary,
          sceneCharacters: scene.characters.join('、') || undefined,
          sceneLocation: scene.location || undefined,
          sceneTensionTarget: scene.tension,
          sceneWordTarget: scene.wordTarget || undefined,
          previousSceneContent: previousContent || undefined,
          fullScenePlan: scenePlan,
          inputText: sceneWriterOutput.content,
        };
        const sceneEditorOutput = await runAgent('editor', sceneEditorContext);
        const parsedScene = parseEditorOutput(sceneEditorOutput.content);
        const polishedSceneText = (parsedScene.polishedText || sceneWriterOutput.content).trim();
        traceStage(
          `editor.scene-${scene.sceneNumber}${traceSuffix}`,
          polishedSceneText,
        );

        return {
          draftText: sceneWriterOutput.content,
          polishedSceneText,
          editorOutputText: sceneEditorOutput.content,
        };
      };

      for (let index = 0; index < generatedScenes.length; index += 1) {
        const scene = generatedScenes[index];
        const sceneDirective = buildStartupSceneDirective(index);
        const priorChapterContent = generatedScenes
          .slice(0, index)
          .map(item => item.content.trim())
          .filter(Boolean)
          .join('\n\n');
        let sceneRun = await generateStartupSceneSegment(scene, previousSceneContent, sceneDirective);
        let duplicateSimilarity = previousSceneContent
          ? estimateSceneDuplicateSimilarity(sceneRun.polishedSceneText, previousSceneContent)
          : 0;
        let leadingDuplicateSimilarity = previousSceneContent
          ? estimateLeadingSceneReplaySimilarity(sceneRun.polishedSceneText, previousSceneContent)
          : 0;
        let replaySimilarity = priorChapterContent
          ? estimateSceneDuplicateSimilarity(sceneRun.polishedSceneText, priorChapterContent)
          : 0;
        let leadingReplaySimilarity = priorChapterContent
          ? estimateLeadingSceneReplaySimilarity(sceneRun.polishedSceneText, priorChapterContent)
          : 0;
        let fullContextReplaySimilarity = priorChapterContent
          ? estimateLeadingSceneReplayAgainstFullContext(sceneRun.polishedSceneText, priorChapterContent)
          : 0;
        let distributedReplayReport = priorChapterContent
          ? analyzeDistributedSceneReplay(sceneRun.polishedSceneText, priorChapterContent)
          : undefined;
        let boundaryIssues = detectStartupSceneBoundaryIssues({
          genreFocus: chapterPromiseCard.genreFocus,
          sceneIndex: index,
          sceneText: sceneRun.polishedSceneText,
          priorChapterContent,
        });

        const retryDirectives: string[] = [];
        const retryReasons: string[] = [];

        if (previousSceneContent && (duplicateSimilarity >= 0.55 || leadingDuplicateSimilarity >= 0.42)) {
          retryDirectives.push(buildSceneDuplicateRepairDirective({
            sceneNumber: scene.sceneNumber,
            sceneTitle: scene.title,
            sceneSummary: scene.summary,
            sceneNotes: scene.notes,
            previousSceneContent,
          }));
          retryReasons.push(`adjacent-duplicate:${Math.max(duplicateSimilarity, leadingDuplicateSimilarity).toFixed(3)}`);
        }

        if (
          priorChapterContent
          && (replaySimilarity >= 0.38 || leadingReplaySimilarity >= 0.42 || fullContextReplaySimilarity >= 0.46)
        ) {
          retryDirectives.push(buildSceneReplayRepairDirective({
            sceneNumber: scene.sceneNumber,
            sceneTitle: scene.title,
            sceneSummary: scene.summary,
            sceneNotes: scene.notes,
            priorChapterContent,
          }));
          retryReasons.push(`chapter-replay:${Math.max(replaySimilarity, leadingReplaySimilarity, fullContextReplaySimilarity).toFixed(3)}`);
        }

        if (distributedReplayReport?.shouldRetry) {
          retryDirectives.push(buildSceneDistributedReplayRepairDirective({
            sceneNumber: scene.sceneNumber,
            sceneTitle: scene.title,
            sceneSummary: scene.summary,
            sceneNotes: scene.notes,
            matchedParagraphs: distributedReplayReport.matchedParagraphs.map(item => item.paragraph),
          }));
          retryReasons.push(`distributed-replay:${distributedReplayReport.matchedParagraphCount}/${distributedReplayReport.eligibleParagraphCount}`);
        }

        if (boundaryIssues.length > 0) {
          retryDirectives.push(buildStartupSceneBoundaryRepairDirective({
            sceneNumber: scene.sceneNumber,
            sceneTitle: scene.title,
            sceneSummary: scene.summary,
            sceneNotes: scene.notes,
            issues: boundaryIssues,
          }));
          retryReasons.push(`boundary:${boundaryIssues.map(item => item.code).join(',')}`);
        }

        if (retryDirectives.length > 0) {
          pipelineLog.warn('[startup-scene-guard] retrying current scene due to replay/boundary issues', {
            novelId,
            chapterNumber,
            sceneNumber: scene.sceneNumber,
            reasons: retryReasons,
          });
          const mergedRetryDirective = [sceneDirective, ...retryDirectives].filter(Boolean).join('\n\n');
          sceneRun = await generateStartupSceneSegment(
            scene,
            previousSceneContent,
            mergedRetryDirective || undefined,
            '.guard-retry',
          );
          duplicateSimilarity = previousSceneContent
            ? estimateSceneDuplicateSimilarity(sceneRun.polishedSceneText, previousSceneContent)
            : 0;
          leadingDuplicateSimilarity = previousSceneContent
            ? estimateLeadingSceneReplaySimilarity(sceneRun.polishedSceneText, previousSceneContent)
            : 0;
          replaySimilarity = priorChapterContent
            ? estimateSceneDuplicateSimilarity(sceneRun.polishedSceneText, priorChapterContent)
            : 0;
          leadingReplaySimilarity = priorChapterContent
            ? estimateLeadingSceneReplaySimilarity(sceneRun.polishedSceneText, priorChapterContent)
            : 0;
          fullContextReplaySimilarity = priorChapterContent
            ? estimateLeadingSceneReplayAgainstFullContext(sceneRun.polishedSceneText, priorChapterContent)
            : 0;
          distributedReplayReport = priorChapterContent
            ? analyzeDistributedSceneReplay(sceneRun.polishedSceneText, priorChapterContent)
            : undefined;
          boundaryIssues = detectStartupSceneBoundaryIssues({
            genreFocus: chapterPromiseCard.genreFocus,
            sceneIndex: index,
            sceneText: sceneRun.polishedSceneText,
            priorChapterContent,
          });

          if (
            duplicateSimilarity >= 0.55
            || leadingDuplicateSimilarity >= 0.42
            || replaySimilarity >= 0.38
            || leadingReplaySimilarity >= 0.42
            || fullContextReplaySimilarity >= 0.46
            || Boolean(distributedReplayReport?.shouldRetry)
            || boundaryIssues.length > 0
          ) {
            pipelineLog.warn('[startup-scene-guard] replay/boundary issues remain after single-scene retry', {
              novelId,
              chapterNumber,
              sceneNumber: scene.sceneNumber,
              duplicateSimilarity: Number(duplicateSimilarity.toFixed(3)),
              leadingDuplicateSimilarity: Number(leadingDuplicateSimilarity.toFixed(3)),
              replaySimilarity: Number(replaySimilarity.toFixed(3)),
              leadingReplaySimilarity: Number(leadingReplaySimilarity.toFixed(3)),
              fullContextReplaySimilarity: Number(fullContextReplaySimilarity.toFixed(3)),
              distributedReplayMatches: distributedReplayReport?.matchedParagraphCount ?? 0,
              distributedReplayEligible: distributedReplayReport?.eligibleParagraphCount ?? 0,
              boundaryIssues: boundaryIssues.map(item => item.code),
            });
          }
        }

        if (priorChapterContent) {
          const distributedReplayTrim = stripDistributedReplayedParagraphs(
            sceneRun.polishedSceneText,
            priorChapterContent,
          );
          if (distributedReplayTrim.removedParagraphs.length > 0) {
            pipelineLog.warn('[startup-scene-guard] stripped distributed replay paragraphs from current scene', {
              novelId,
              chapterNumber,
              sceneNumber: scene.sceneNumber,
              removedParagraphs: distributedReplayTrim.removedParagraphs.length,
              matchedRatio: Number(distributedReplayTrim.report.matchedRatio.toFixed(3)),
            });
            sceneRun = {
              ...sceneRun,
              polishedSceneText: distributedReplayTrim.sanitizedText,
            };
          }

          const replayTrim = stripLeadingReplayedParagraphs(sceneRun.polishedSceneText, priorChapterContent);
          if (replayTrim.removedParagraphs.length > 0) {
            pipelineLog.warn('[startup-scene-guard] stripped replayed leading paragraphs from current scene', {
              novelId,
              chapterNumber,
              sceneNumber: scene.sceneNumber,
              removedParagraphs: replayTrim.removedParagraphs.length,
            });
            sceneRun = {
              ...sceneRun,
              polishedSceneText: replayTrim.sanitizedText,
            };
          }
        }

        sceneDrafts.push(sceneRun.draftText);
        sceneEditedOutputs.push(sceneRun.editorOutputText);

        const updatedAt = new Date().toISOString();
        generatedScenes[index] = {
          ...scene,
          content: sceneRun.polishedSceneText,
          wordCount: sceneRun.polishedSceneText.length,
          status: 'edited',
          updatedAt,
        };
        previousSceneContent = sceneRun.polishedSceneText;
        chapterDraftText = sceneDrafts.join('\n\n');
        polishedText = assembleSceneContents(generatedScenes);
        finalEditedContent = sceneEditedOutputs.join('\n\n');

        if (onDraftReady && polishedText.trim()) {
          await onDraftReady({
            chapterContent: polishedText,
            outline: outlineOutput.content,
            worldNotes: worldOutput.content,
            characterNotes: charOutput.content,
            draft: chapterDraftText,
            editedContent: finalEditedContent,
            readerFeedback: '',
            agentOutputs: [...allOutputs],
            scenePlan,
            scenes: generatedScenes.map(item => ({ ...item })),
            sceneMode: true,
            stylePreset: styleProfile.resolvedPreset,
            worldContract,
            outlineContract,
            collaborationLog: collaborationLog.getEntries(),
            superLongDiagnostics,
          });
        }
      }
    } else {
      const draftResult = await generateDraft({
        runAgent,
        writerContext,
        editorContext,
        onOutput: (role, _output, traceContent) => {
          traceStage(`${role}.initial`, traceContent);
        },
      });
      chapterDraftText = draftResult.chapterDraftText;
      polishedText = draftResult.polishedText;
      finalEditedContent = draftResult.finalEditedContent;
      editorSuggestedTitle = draftResult.suggestedTitle;

      if (onDraftReady && polishedText.trim()) {
        await onDraftReady({
          chapterContent: polishedText,
          outline: outlineOutput.content,
          worldNotes: worldOutput.content,
          characterNotes: charOutput.content,
          draft: chapterDraftText,
          editedContent: finalEditedContent,
          readerFeedback: '',
          agentOutputs: [...allOutputs],
          scenePlan,
          stylePreset: styleProfile.resolvedPreset,
          worldContract,
          outlineContract,
          collaborationLog: collaborationLog.getEntries(),
          superLongDiagnostics,
        });
      }
    }

    if (this.qualityFeatures.enableLocalizedAntiAiRewrite) {
      const rewriteReport = rewriteLocalizedAntiAiTells(polishedText, {
        maxWindows: this.qualityFeatures.localRewriteMaxWindows,
      });
      if (rewriteReport.applied) {
        const candidate = rewriteReport.rewrittenText;
        if (this.qualityFeatures.enableRegressionGuard) {
          const guard = verifyRewriteRegression({
            beforeText: polishedText,
            afterText: candidate,
            characters,
            worldEntries,
          });
          if (guard.passed) {
            polishedText = candidate;
            qualityGateLog.info(`[localized-anti-ai] novel=${novelId} chapter=${chapterNumber} ${rewriteReport.summary}`);
          } else {
            qualityGateLog.warn(`[localized-anti-ai] novel=${novelId} chapter=${chapterNumber} ${guard.summary}`);
          }
        } else {
          polishedText = candidate;
          qualityGateLog.info(`[localized-anti-ai] novel=${novelId} chapter=${chapterNumber} ${rewriteReport.summary}`);
        }
      }
    }

    // 记录 Editor 对 Writer 初稿的风格调整
    collaborationLog.add({
      round: 0,
      fromAgent: 'editor',
      toAgent: 'writer',
      feedbackType: 'style-adjustment',
      summary: '编辑对初稿进行润色与风格调整',
    });

    let worldFulfillment: ChapterGenerationResult['worldFulfillment'];
    let worldGateRewrite: ChapterGenerationResult['worldGateRewrite'];
    let outlineFulfillment: ChapterGenerationResult['outlineFulfillment'];
    let outlineGateRewrite: ChapterGenerationResult['outlineGateRewrite'];
    let qualityReport: ChapterGenerationResult['qualityReport'];
    let qualityGateRewrite: ChapterGenerationResult['qualityGateRewrite'];
    let chapterPromiseReport: ChapterGenerationResult['chapterPromiseReport'];
    let chapterPromiseGateRewrite: ChapterGenerationResult['chapterPromiseGateRewrite'];
    let commercialReport: ChapterGenerationResult['commercialReport'];
    let commercialGateRewrite: ChapterGenerationResult['commercialGateRewrite'];
    let startupOpeningReport: ChapterGenerationResult['startupOpeningReport'];
    let startupOpeningGateRewrite: ChapterGenerationResult['startupOpeningGateRewrite'];
    let chapterLengthGuard: ChapterGenerationResult['chapterLengthGuard'];
    let speakerWhitelistReport: ChapterGenerationResult['speakerWhitelistReport'];
    let powerRuleReport: ChapterGenerationResult['powerRuleReport'];
    let settingDriftReport: ChapterGenerationResult['settingDriftReport'];
    let continuityReport: ChapterGenerationResult['continuityReport'];
    let knownCharacterNames: string[] = [];
    if (worldContract && this.worldFeatures.gateMode !== 'off') {
      const knownCharacters = await this.getCharactersCached(novelId);
      knownCharacterNames = knownCharacters.flatMap(item => [item.name, ...(item.aliases ?? [])]);

      worldFulfillment = evaluateWorldContractFulfillment({
        contract: worldContract,
        chapterContent: polishedText,
        gateMode: this.worldFeatures.gateMode,
        knownWorldEntries: reusableWorldEntries,
        knownCharacterNames,
      });

      const shouldAttemptFix = shouldAttemptWorldGateFix({
        fulfillment: worldFulfillment,
        contract: worldContract,
        gateMode: this.worldFeatures.gateMode,
        skipStrictGate: Boolean(skipStrictGate),
      });
      if (shouldAttemptFix) {
        const fixHints = buildWorldGateFixHints(worldFulfillment, worldContract);
        const strictFixEditorContext: AgentContext = {
          ...editorContext,
          inputText: polishedText,
          worldGateFixHints: fixHints,
        };
        const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
        const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
        if (strictFixParsed.polishedText) {
          polishedText = strictFixParsed.polishedText;
          finalEditedContent = strictFixEditorOutput.content;
          traceStage('world-gate.rewrite', polishedText);
        }

        const repairedFulfillment = evaluateWorldContractFulfillment({
          contract: worldContract,
          chapterContent: polishedText,
          gateMode: this.worldFeatures.gateMode,
          knownWorldEntries: reusableWorldEntries,
          knownCharacterNames,
        });

        worldGateRewrite = {
          attempted: true,
          applied: repairedFulfillment.findings.length < worldFulfillment.findings.length
            || repairedFulfillment.requiredHit > worldFulfillment.requiredHit
            || repairedFulfillment.unsourcedTerms.length < worldFulfillment.unsourcedTerms.length,
          reason: fixHints,
          before: worldFulfillment,
          after: repairedFulfillment,
        };
        worldFulfillment = repairedFulfillment;
      }

      if (this.worldFeatures.gateMode === 'strict' && !worldFulfillment.passed && !skipStrictGate) {
        if (!worldFulfillment.passed && !this.worldFeatures.strictFallbackToWarn) {
          throw new Error(`世界观门禁未通过（strict）：${worldFulfillment.summary}`);
        }

        if (!worldFulfillment.passed && this.worldFeatures.strictFallbackToWarn) {
          worldGateLog.warn(
            `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${worldFulfillment.summary}`,
          );
        }
      }

      logGateFindings({
        report: worldFulfillment,
        mode: this.worldFeatures.gateMode,
        strictFallbackToWarn: this.worldFeatures.strictFallbackToWarn,
        logger: worldGateLog,
        novelId,
        chapterNumber,
      });
    }

    if (outlineContract.required.length > 0 && this.outlineFeatures.gateMode !== 'off') {
      outlineFulfillment = evaluateOutlineContractFulfillment({
        contract: outlineContract,
        chapterContent: polishedText,
        gateMode: this.outlineFeatures.gateMode,
      });

      if (this.outlineFeatures.gateMode === 'strict' && !outlineFulfillment.passed && !skipStrictGate) {
        const shouldAttemptFix = outlineFulfillment.requiredHit < outlineFulfillment.requiredTotal - 1;
        if (shouldAttemptFix) {
          const fixHints = buildOutlineGateFixHints(outlineFulfillment, outlineContract);
          const strictFixEditorContext: AgentContext = {
            ...editorContext,
            inputText: polishedText,
            outlineContract: outlineContract.prompt || undefined,
            outlineGateFixHints: fixHints,
          };
          const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
          const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
          if (strictFixParsed.polishedText) {
            polishedText = strictFixParsed.polishedText;
            finalEditedContent = strictFixEditorOutput.content;
            traceStage('outline-gate.rewrite', polishedText);
          }

          const repairedFulfillment = evaluateOutlineContractFulfillment({
            contract: outlineContract,
            chapterContent: polishedText,
            gateMode: this.outlineFeatures.gateMode,
          });

          outlineGateRewrite = {
            attempted: true,
            applied: repairedFulfillment.passed
              || repairedFulfillment.requiredHit > outlineFulfillment.requiredHit,
            reason: fixHints,
            before: outlineFulfillment,
            after: repairedFulfillment,
          };
          outlineFulfillment = repairedFulfillment;
        }

        if (!outlineFulfillment.passed && !this.outlineFeatures.strictFallbackToWarn) {
          throw new Error(`大纲门禁未通过（strict）：${outlineFulfillment.summary}`);
        }

        if (!outlineFulfillment.passed && this.outlineFeatures.strictFallbackToWarn) {
          outlineGateLog.warn(
            `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${outlineFulfillment.summary}`,
          );
        }
      }

      logGateFindings({
        report: outlineFulfillment,
        mode: this.outlineFeatures.gateMode,
        strictFallbackToWarn: this.outlineFeatures.strictFallbackToWarn,
        logger: outlineGateLog,
        novelId,
        chapterNumber,
      });
    }

    const effectiveQualityGateMode = this.qualityFeatures.shadowMode && this.qualityFeatures.gateMode === 'strict'
      ? 'warn'
      : this.qualityFeatures.gateMode;
    const effectiveChapterPromiseGateMode = chapterPromiseCard.startupMustLandResult
      || chapterPromiseDelayPressure.active
      || chapterPromiseCard.genreFocus === 'war-statecraft'
      ? 'strict'
      : effectiveQualityGateMode;
    const effectiveCommercialGateMode = chapterPromiseCard.startupMustLandResult
      ? 'strict'
      : effectiveQualityGateMode;
    const effectiveContinuityGateMode = this.continuityFeatures.shadowMode && this.continuityFeatures.gateMode === 'strict'
      ? 'warn'
      : this.continuityFeatures.gateMode;
    const chapterPromiseRepairableHardBlockCodes = ['off-domain-ritual-mechanic'];
    const chapterPromiseNonDowngradableHardBlockCodes = ['off-domain-ritual-mechanic'];
    const chapterPromiseHardBlockCodes = [
      'system-evidence-substitution',
      'private-deal-dominant',
      ...chapterPromiseRepairableHardBlockCodes,
    ];
    const commercialHardBlockCodes = ['unsupported-information-leap'];
    if (this.qualityFeatures.shadowMode && this.qualityFeatures.gateMode === 'strict') {
      qualityGateLog.warn(`[quality-gate] shadow mode active, strict findings will not block (novel=${novelId} chapter=${chapterNumber})`);
    }
    if (this.continuityFeatures.shadowMode && this.continuityFeatures.gateMode === 'strict') {
      console.warn(`[continuity-gate] shadow mode active, strict findings will not block (novel=${novelId} chapter=${chapterNumber})`);
    }

    if (this.qualityFeatures.gateMode !== 'off') {
      qualityReport = evaluateChapterQualityGate({
        chapterContent: polishedText,
        scenePlan,
        stylePreset: styleProfile.resolvedPreset,
        antiAiStructure: this.enhancementThresholds.antiAiStructure,
        gateMode: effectiveQualityGateMode,
        thresholds: this.qualityFeatures,
        genre: novel.genre,
        enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
        enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
        domainStructureKeywords,
      });

      if (effectiveQualityGateMode === 'strict' && !qualityReport.passed && !skipStrictGate) {
        const scoreGap = this.qualityFeatures.passScore - (qualityReport.overallScore ?? 0);
        const shouldAttemptFix = scoreGap < 10 && qualityReport.findings.length <= 3;
        if (shouldAttemptFix) {
          const fixHints = buildQualityGateFixHints(qualityReport, styleProfile.resolvedPreset, scenePlan);
          const strictFixEditorContext: AgentContext = {
            ...editorContext,
            inputText: polishedText,
            outlineContract: outlineContract.prompt || undefined,
            worldContract: worldContract?.prompt,
            qualityGateFixHints: fixHints,
          };
          const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
          const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
          if (strictFixParsed.polishedText) {
            polishedText = strictFixParsed.polishedText;
            finalEditedContent = strictFixEditorOutput.content;
            traceStage('quality-gate.rewrite', polishedText);
          }

          const repairedReport = evaluateChapterQualityGate({
            chapterContent: polishedText,
            scenePlan,
            stylePreset: styleProfile.resolvedPreset,
            antiAiStructure: this.enhancementThresholds.antiAiStructure,
            gateMode: effectiveQualityGateMode,
            thresholds: this.qualityFeatures,
            genre: novel.genre,
            enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
            enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
            domainStructureKeywords,
          });

          qualityGateRewrite = {
            attempted: true,
            applied: repairedReport.passed
              || repairedReport.overallScore > qualityReport.overallScore
              || repairedReport.findings.length < qualityReport.findings.length,
            reason: fixHints,
            before: qualityReport,
            after: repairedReport,
          };
          qualityReport = repairedReport;
        }

        if (!qualityReport.passed && !this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(`章节质量门禁未通过（strict）：${qualityReport.summary}`);
        }

        if (!qualityReport.passed && this.qualityFeatures.strictFallbackToWarn) {
          qualityGateLog.warn(
            `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${qualityReport.summary}`,
          );
        }
      }

      logGateFindings({
        report: qualityReport,
        mode: effectiveQualityGateMode,
        strictFallbackToWarn: this.qualityFeatures.strictFallbackToWarn,
        logger: qualityGateLog,
        novelId,
        chapterNumber,
      });
    }

    const speakerMarkersBeforeGateClean = countInlineSpeakerMarkers(polishedText);
    if (speakerMarkersBeforeGateClean > 0) {
      polishedText = cleanPublicFacingContent(polishedText);
      traceStage('final.pre-gate-public-facing-clean', polishedText, {
        speakerMarkersRemoved: speakerMarkersBeforeGateClean,
      });
    }

    // 最终联动复检：避免后续修复动作破坏前置门禁达成。仅在发生过修复时执行
    const hadAnyRewrite = worldGateRewrite?.attempted || outlineGateRewrite?.attempted || qualityGateRewrite?.attempted;
    if (hadAnyRewrite && worldContract && this.worldFeatures.gateMode !== 'off') {
      const finalWorldFulfillment = evaluateWorldContractFulfillment({
        contract: worldContract,
        chapterContent: polishedText,
        gateMode: this.worldFeatures.gateMode,
        knownWorldEntries: reusableWorldEntries,
        knownCharacterNames,
      });
      if (
        worldFulfillment
        && (
          finalWorldFulfillment.requiredHit < worldFulfillment.requiredHit
          || finalWorldFulfillment.unsourcedTerms.length > worldFulfillment.unsourcedTerms.length
          || (worldFulfillment.passed && !finalWorldFulfillment.passed)
        )
      ) {
        worldGateLog.warn(
          `final recheck detected regression, novel=${novelId} chapter=${chapterNumber} before=${worldFulfillment.summary} after=${finalWorldFulfillment.summary}`,
        );
      }
      worldFulfillment = finalWorldFulfillment;
      if (!worldFulfillment.passed && this.worldFeatures.gateMode === 'strict') {
        if (!this.worldFeatures.strictFallbackToWarn) {
          throw new Error(`世界观门禁最终复检未通过（strict）：${worldFulfillment.summary}`);
        }
        worldGateLog.warn(
          `final recheck strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${worldFulfillment.summary}`,
        );
      }
    }

    if (hadAnyRewrite && outlineContract.required.length > 0 && this.outlineFeatures.gateMode !== 'off') {
      const finalOutlineFulfillment = evaluateOutlineContractFulfillment({
        contract: outlineContract,
        chapterContent: polishedText,
        gateMode: this.outlineFeatures.gateMode,
      });
      if (
        outlineFulfillment
        && (
          finalOutlineFulfillment.requiredHit < outlineFulfillment.requiredHit
          || (outlineFulfillment.passed && !finalOutlineFulfillment.passed)
        )
      ) {
        outlineGateLog.warn(
          `final recheck detected regression, novel=${novelId} chapter=${chapterNumber} before=${outlineFulfillment.summary} after=${finalOutlineFulfillment.summary}`,
        );
      }
      outlineFulfillment = finalOutlineFulfillment;
      if (!outlineFulfillment.passed && this.outlineFeatures.gateMode === 'strict') {
        if (!this.outlineFeatures.strictFallbackToWarn) {
          throw new Error(`大纲门禁最终复检未通过（strict）：${outlineFulfillment.summary}`);
        }
        outlineGateLog.warn(
          `final recheck strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${outlineFulfillment.summary}`,
        );
      }
    }

    if (hadAnyRewrite && this.qualityFeatures.gateMode !== 'off') {
      const finalQualityReport = evaluateChapterQualityGate({
        chapterContent: polishedText,
        scenePlan,
        stylePreset: styleProfile.resolvedPreset,
        antiAiStructure: this.enhancementThresholds.antiAiStructure,
        gateMode: effectiveQualityGateMode,
        thresholds: this.qualityFeatures,
        genre: novel.genre,
        enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
        enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
        domainStructureKeywords,
      });
      if (
        qualityReport
        && (
          finalQualityReport.overallScore < qualityReport.overallScore
          || (qualityReport.passed && !finalQualityReport.passed)
        )
      ) {
        console.warn(
          `[quality-gate] final recheck detected regression, novel=${novelId} chapter=${chapterNumber} before=${qualityReport.summary} after=${finalQualityReport.summary}`,
        );
      }
      qualityReport = finalQualityReport;
      if (!qualityReport.passed && effectiveQualityGateMode === 'strict') {
        if (!this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(`章节质量门禁最终复检未通过（strict）：${qualityReport.summary}`);
        }
        console.warn(
          `[quality-gate] final recheck strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${qualityReport.summary}`,
        );
      }
    }

    if (this.characterWhitelistFeatures.gateMode !== 'off') {
      speakerWhitelistReport = await evaluateSpeakerWhitelist({
        novelManager: this.novelManager,
        characters: await this.getCharactersCached(novelId),
        novelId,
        chapterNumber,
        chapterContent: polishedText,
        mode: this.characterWhitelistFeatures.gateMode,
      });

      if (!speakerWhitelistReport.passed) {
        const logLine = `[speaker-whitelist] novel=${novelId} chapter=${chapterNumber} mode=${this.characterWhitelistFeatures.gateMode} ${speakerWhitelistReport.summary}`;
        if (this.characterWhitelistFeatures.gateMode === 'strict') {
          if (!this.characterWhitelistFeatures.strictFallbackToWarn) {
            console.error(logLine);
            throw new Error(`角色白名单门禁未通过（strict）：${speakerWhitelistReport.summary}`);
          }
          console.warn(`${logLine} (downgraded-to-warn)`);
        } else {
          console.warn(logLine);
        }
      }
    }

    // === 连贯性门禁 ===
    if (this.continuityFeatures.gateMode !== 'off' && chapterNumber > 1) {
      try {
        const prevFact = await this.novelManager.getChapterFact(novelId, chapterNumber - 1);
        if (prevFact) {
          const charsForFact = await this.getCharactersCached(novelId);
          const worldEntriesForFact = await this.novelManager.getWorldEntries(novelId);
          const currentFact = extractChapterFacts({
            chapterContent: polishedText,
            characters: charsForFact,
            worldEntries: worldEntriesForFact,
          });

          continuityReport = evaluateContinuityGate({
            prevFact,
            currentContent: polishedText,
            currentFact,
            gateMode: effectiveContinuityGateMode,
            characters: charsForFact,
            enableIdentitySelfAddress: this.continuityFeatures.enableIdentitySelfAddress,
            enableIdentityAddress: this.continuityFeatures.enableIdentityAddress,
            resourceLedger: await this.storyStateManager?.getResourceLedger(novelId),
            currentChapter: chapterNumber,
            characterMatrix: await this.storyStateManager?.getCharacterMatrix(novelId),
          });

          if (effectiveContinuityGateMode === 'strict' && !continuityReport.passed) {
            const fixHints = buildContinuityGateFixHints(continuityReport);
            const strictFixEditorContext: AgentContext = {
              ...editorContext,
              inputText: polishedText,
              continuityGateFixHints: fixHints,
            };
            const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
            const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
            if (strictFixParsed.polishedText) {
              polishedText = strictFixParsed.polishedText;
              finalEditedContent = strictFixEditorOutput.content;
              traceStage('continuity-gate.rewrite', polishedText);
            }

            if (!this.continuityFeatures.strictFallbackToWarn) {
              // 重新检查
              const repairedFact = extractChapterFacts({
                chapterContent: polishedText,
                characters: charsForFact,
                worldEntries: worldEntriesForFact,
              });
              const repairedReport = evaluateContinuityGate({
                prevFact,
                currentContent: polishedText,
                currentFact: repairedFact,
                gateMode: effectiveContinuityGateMode,
                characters: charsForFact,
                enableIdentitySelfAddress: this.continuityFeatures.enableIdentitySelfAddress,
                enableIdentityAddress: this.continuityFeatures.enableIdentityAddress,
                resourceLedger: await this.storyStateManager?.getResourceLedger(novelId),
                currentChapter: chapterNumber,
                characterMatrix: await this.storyStateManager?.getCharacterMatrix(novelId),
              });
              continuityReport = repairedReport;
              if (!repairedReport.passed) {
                throw new Error(`连贯性门禁未通过（strict）：${repairedReport.summary}`);
              }
            }
          }

          if (continuityReport.findings.length > 0) {
            const logLine = `[continuity-gate] novel=${novelId} chapter=${chapterNumber} mode=${effectiveContinuityGateMode} ${continuityReport.summary}`;
            console.warn(logLine);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('连贯性门禁未通过')) throw err;
        console.warn('[continuity-gate] 连贯性检查失败:', err instanceof Error ? err.message : err);
      }
    }

    if (this.powerRuleFeatures.gateMode !== 'off') {
      powerRuleReport = evaluatePowerRuleGate({
        chapterContent: polishedText,
        worldEntries: reusableWorldEntries,
        gateMode: this.powerRuleFeatures.gateMode,
      });

      if (!powerRuleReport.passed) {
        const logLine = `[power-rule-gate] novel=${novelId} chapter=${chapterNumber} mode=${this.powerRuleFeatures.gateMode} ${powerRuleReport.summary}`;
        if (this.powerRuleFeatures.gateMode === 'strict') {
          if (!this.powerRuleFeatures.strictFallbackToWarn) {
            console.error(logLine);
            throw new Error(`力量规则门禁未通过（strict）：${powerRuleReport.summary}`);
          }
          console.warn(`${logLine} (downgraded-to-warn)`);
        } else {
          console.warn(logLine);
        }
      }
    }

    // ====== 设定漂移门禁 ======
    if (this.settingDriftFeatures.gateMode !== 'off') {
      settingDriftReport = evaluateSettingDriftGate({
        chapterContent: polishedText,
        baseline: settingBaselineForGate,
        chapterNumber,
        gateMode: this.settingDriftFeatures.gateMode,
      });

      if (!settingDriftReport.passed || settingDriftReport.findings.length > 0) {
        const logLine = `[setting-drift-gate] novel=${novelId} chapter=${chapterNumber} mode=${this.settingDriftFeatures.gateMode} ${settingDriftReport.summary}`;
        if (!settingDriftReport.passed && this.settingDriftFeatures.gateMode === 'strict') {
          if (!this.settingDriftFeatures.strictFallbackToWarn) {
            console.error(logLine);
            throw new Error(`设定漂移门禁未通过（strict）：${settingDriftReport.summary}`);
          }
          console.warn(`${logLine} (downgraded-to-warn)`);
        } else {
          console.warn(logLine);
        }
      }
    }

    // ====== AI 痕迹门禁 ======
    let aiTraceReport: ChapterGenerationResult['aiTraceReport'];
    if (this.aiTraceFeatures.gateMode !== 'off') {
      // 从题材模板获取类型特定规则
      let genreOverrides: GenreTraceOverrides | undefined;
      const tmpl = getTemplate(novel.genre);
      if (tmpl?.writingRules) {
        genreOverrides = {
          prohibitions: tmpl.writingRules.prohibitions,
          fatigueWords: tmpl.writingRules.fatigueWords,
        };
      }

      // 加载自学习模式（fire-and-forget 降级，加载失败不阻断）
      let learnedPatterns: RegExp[] | undefined;
      try {
        learnedPatterns = await loadLearnedPatterns({ novelId, novelsDir: getNovelsDir() });
      } catch (err) {
        pipelineLog.debug('自学习模式加载失败', { reason: err instanceof Error ? err.message : String(err) });
      }

      aiTraceReport = evaluateAiTraceGate({
        text: polishedText,
        gateMode: skipStrictGate ? 'warn' : this.aiTraceFeatures.gateMode,
        passThreshold: this.aiTraceFeatures.passThreshold,
        genreOverrides,
        learnedPatterns,
      });

      if (!aiTraceReport.passed) {
        const logLine = `[ai-trace-gate] novel=${novelId} chapter=${chapterNumber} mode=${this.aiTraceFeatures.gateMode} ${aiTraceReport.summary}`;
        if (this.aiTraceFeatures.gateMode === 'strict' && !skipStrictGate) {
          // strict 模式下触发 Editor 重写修复
          const fixHints = buildAiTraceFixHints(aiTraceReport);
          const strictFixEditorContext: AgentContext = {
            ...editorContext,
            inputText: polishedText,
            outlineContract: outlineContract.prompt || undefined,
            worldContract: worldContract?.prompt,
            aiTraceFixHints: fixHints,
          };
          const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
          const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
          if (strictFixParsed.polishedText) {
            polishedText = strictFixParsed.polishedText;
            finalEditedContent = strictFixEditorOutput.content;
            traceStage('ai-trace-gate.rewrite', polishedText);
          }

          // 重新检测
          aiTraceReport = evaluateAiTraceGate({
            text: polishedText,
            gateMode: this.aiTraceFeatures.gateMode,
            passThreshold: this.aiTraceFeatures.passThreshold,
            genreOverrides,
          });

          if (!aiTraceReport.passed && !this.aiTraceFeatures.strictFallbackToWarn) {
            console.error(logLine);
            throw new Error(`AI 痕迹门禁未通过（strict）：${aiTraceReport.summary}`);
          }
          if (!aiTraceReport.passed) {
            console.warn(`${logLine} (downgraded-to-warn)`);
          }
        } else {
          console.warn(logLine);
        }
      }
    }

    if (effectiveQualityGateMode !== 'off') {
      chapterPromiseReport = evaluateChapterPromiseGate({
        chapterContent: polishedText,
        chapterNumber,
        gateMode: effectiveChapterPromiseGateMode,
        card: chapterPromiseCard,
        recentChapterContents: recentChapterContentsForVoice,
      });

      if (effectiveChapterPromiseGateMode === 'strict' && !chapterPromiseReport.passed && !skipStrictGate) {
        const hasHardBlock = reportHasFindingCodes(chapterPromiseReport, chapterPromiseHardBlockCodes);
        const hasRepairableHardBlock = reportHasFindingCodes(
          chapterPromiseReport,
          chapterPromiseRepairableHardBlockCodes,
        );
        const shouldAttemptFix = (!hasHardBlock || hasRepairableHardBlock) && chapterPromiseReport.findings.length <= 4;
        if (shouldAttemptFix) {
          const fixHints = buildChapterPromiseGateFixHints(chapterPromiseCard, chapterPromiseReport);
          const strictFixEditorContext: AgentContext = {
            ...editorContext,
            inputText: polishedText,
            chapterPromiseGateFixHints: fixHints,
          };
          const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
          const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
          if (strictFixParsed.polishedText) {
            polishedText = strictFixParsed.polishedText;
            finalEditedContent = strictFixEditorOutput.content;
            traceStage('chapter-promise-gate.rewrite', polishedText);
          }

          const repairedReport = evaluateChapterPromiseGate({
            chapterContent: polishedText,
            chapterNumber,
            gateMode: effectiveChapterPromiseGateMode,
            card: chapterPromiseCard,
            recentChapterContents: recentChapterContentsForVoice,
          });

          chapterPromiseGateRewrite = {
            attempted: true,
            applied: repairedReport.passed || repairedReport.findings.length < chapterPromiseReport.findings.length,
            reason: fixHints,
            before: chapterPromiseReport,
            after: repairedReport,
          };
          chapterPromiseReport = repairedReport;
        }

        if (!chapterPromiseReport.passed && !this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(`章节承诺门禁未通过（strict）：${chapterPromiseReport.summary}`);
        }
        if (reportHasFindingCodes(chapterPromiseReport, chapterPromiseNonDowngradableHardBlockCodes)) {
          throw new Error(buildHardBlockMessage('章节承诺门禁', chapterPromiseNonDowngradableHardBlockCodes, chapterPromiseReport));
        }
        if (reportHasFindingCodes(chapterPromiseReport, chapterPromiseHardBlockCodes) && !this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(buildHardBlockMessage('章节承诺门禁', chapterPromiseHardBlockCodes, chapterPromiseReport));
        }
        if (reportHasFindingCodes(chapterPromiseReport, chapterPromiseHardBlockCodes) && this.qualityFeatures.strictFallbackToWarn) {
          chapterPromiseGateLog.warn(
            `hard block downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${buildHardBlockMessage('章节承诺门禁', chapterPromiseHardBlockCodes, chapterPromiseReport)}`,
          );
        }
        if (!chapterPromiseReport.passed && this.qualityFeatures.strictFallbackToWarn) {
          chapterPromiseGateLog.warn(
            `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${chapterPromiseReport.summary}`,
          );
        }
      }

      logGateFindings({
        report: chapterPromiseReport,
        mode: effectiveChapterPromiseGateMode,
        strictFallbackToWarn: this.qualityFeatures.strictFallbackToWarn,
        logger: chapterPromiseGateLog,
        novelId,
        chapterNumber,
      });
    }

    if (effectiveQualityGateMode !== 'off') {
      commercialReport = evaluateCommercialGate({
        chapterContent: polishedText,
        chapterNumber,
        plotThreads: outline.plotThreads,
        protagonistNames,
        promiseContract,
        gateMode: effectiveCommercialGateMode,
      });

      if (effectiveCommercialGateMode === 'strict' && !commercialReport.passed && !skipStrictGate) {
        const hasHardBlock = reportHasFindingCodes(commercialReport, commercialHardBlockCodes);
        const shouldAttemptFix = !hasHardBlock && commercialReport.findings.length <= 3;
        if (shouldAttemptFix) {
          const fixHints = buildCommercialGateFixHints(commercialReport);
          const strictFixEditorContext: AgentContext = {
            ...editorContext,
            inputText: polishedText,
            outlineContract: outlineContract.prompt || undefined,
            worldContract: worldContract?.prompt,
            commercialGateFixHints: fixHints,
          };
          const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
          const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
          if (strictFixParsed.polishedText) {
            polishedText = strictFixParsed.polishedText;
            finalEditedContent = strictFixEditorOutput.content;
            traceStage('commercial-gate.rewrite', polishedText);
          }

          const repairedReport = evaluateCommercialGate({
            chapterContent: polishedText,
            chapterNumber,
            plotThreads: outline.plotThreads,
            protagonistNames,
            promiseContract,
            gateMode: effectiveCommercialGateMode,
          });

          commercialGateRewrite = {
            attempted: true,
            applied: repairedReport.passed
              || repairedReport.findings.length < commercialReport.findings.length,
            reason: fixHints,
            before: commercialReport,
            after: repairedReport,
          };
          commercialReport = repairedReport;
        }

        if (!commercialReport.passed && !this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(`商业化门禁未通过（strict）：${commercialReport.summary}`);
        }
        if (reportHasFindingCodes(commercialReport, commercialHardBlockCodes) && !this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(buildHardBlockMessage('商业化门禁', commercialHardBlockCodes, commercialReport));
        }
        if (reportHasFindingCodes(commercialReport, commercialHardBlockCodes) && this.qualityFeatures.strictFallbackToWarn) {
          commercialGateLog.warn(
            `hard block downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${buildHardBlockMessage('商业化门禁', commercialHardBlockCodes, commercialReport)}`,
          );
        }
        if (!commercialReport.passed && this.qualityFeatures.strictFallbackToWarn) {
          commercialGateLog.warn(
            `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${commercialReport.summary}`,
          );
        }
      }

      logGateFindings({
        report: commercialReport,
        mode: effectiveCommercialGateMode,
        strictFallbackToWarn: this.qualityFeatures.strictFallbackToWarn,
        logger: commercialGateLog,
        novelId,
        chapterNumber,
      });
    }

    if (chapterNumber <= 3) {
      startupOpeningReport = evaluateStartupOpeningGate({
        chapterContent: polishedText,
        chapterNumber,
        gateMode: 'warn',
        platformProfile: resolvedStartupPlatformProfile,
        promiseContract,
        targetWordCount: maxWordCount,
      });

      if (!startupOpeningReport.passed && !skipStrictGate) {
        const severeFindingCount = startupOpeningReport.findings.filter(item =>
          item.code !== 'word-count-overrun',
        ).length;
        const shouldAttemptFix = severeFindingCount >= 2
          || startupOpeningReport.findings.some(item =>
            item.code === 'word-count-overrun' || item.code === 'overloaded-opening',
          );

        if (shouldAttemptFix) {
          const fixHints = buildStartupOpeningFixHints(startupOpeningReport);
          const fixEditorContext: AgentContext = {
            ...editorContext,
            inputText: polishedText,
            startupOpeningGateFixHints: fixHints,
          };
          const fixEditorOutput = await runAgent('editor', fixEditorContext);
          const fixParsed = parseEditorOutput(fixEditorOutput.content);
          if (fixParsed.polishedText) {
            polishedText = fixParsed.polishedText;
            finalEditedContent = fixEditorOutput.content;
            traceStage('startup-opening.rewrite', polishedText);
          }

          const repairedReport = evaluateStartupOpeningGate({
            chapterContent: polishedText,
            chapterNumber,
            gateMode: 'warn',
            platformProfile: resolvedStartupPlatformProfile,
            promiseContract,
            targetWordCount: maxWordCount,
          });
          startupOpeningGateRewrite = {
            attempted: true,
            applied: repairedReport.overallScore > startupOpeningReport.overallScore,
            reason: fixHints,
            before: startupOpeningReport,
            after: repairedReport,
          };
          startupOpeningReport = repairedReport;
        }
      }

      if (startupOpeningReport.findings.length > 0) {
        pipelineLog.warn(`[startup-opening-gate] novel=${novelId} chapter=${chapterNumber} ${startupOpeningReport.summary}`);
      }
    }

    const effectiveSkipLengthGuard = resolveChapterLengthGuardSkip(skipLengthGuard);

    if (shouldTriggerChapterUnderLengthGuard(polishedText.length, maxWordCount) && !effectiveSkipLengthGuard) {
      const lengthGuard = buildChapterLengthGuardSummary(polishedText.length, maxWordCount);
      pipelineLog.warn(`[chapter-length-guard] novel=${novelId} chapter=${chapterNumber} ${lengthGuard.summary}`);
      let attemptedExpansion = false;

      const guardFeedback = buildChapterUnderLengthGuardFeedback({
        targetWordCount: maxWordCount!,
        actualWordCount: polishedText.length,
      });

      try {
        attemptedExpansion = true;
        const preExpandText = polishedText;
        const resizerContext: AgentContext = {
          ...baseContext,
          worldContext: undefined,
          characterContext: undefined,
          previousChapterSummary: undefined,
          outlineContext: undefined,
          scenePlan: undefined,
          outlineContract: undefined,
          worldContract: undefined,
          consistencyGuardrails: undefined,
          characterEventContext: undefined,
          inputText: polishedText,
          resizeMode: 'expand',
          originalWordCount: polishedText.length,
          maxWordCount,
          userDirection: [editorContext.userDirection, guardFeedback].filter(Boolean).join('\n\n'),
          temperatureOverride: 0.25,
        };
        const resizerOutput = await runAgent('resizer', resizerContext);
        let expandedText = resizerOutput.content.trim();

        const resizerRegressionGuard = verifyRewriteRegression({
          beforeText: preExpandText,
          afterText: expandedText,
          characters,
          worldEntries,
        });
        if (!resizerRegressionGuard.passed) {
          pipelineLog.warn(
            `[chapter-length-guard] resizer expansion regression guard triggered, keep original text: ${resizerRegressionGuard.summary}`,
          );
        } else {
          const expansionEditorOutput = await runAgent('editor', {
            ...editorContext,
            inputText: expandedText,
            resizeMode: 'expand',
            originalWordCount: preExpandText.length,
            maxWordCount,
            startupOpeningGateFixHints: startupOpeningGateRewrite?.reason,
            temperatureOverride: 0.25,
          });
          const expansionParsed = parseEditorOutput(expansionEditorOutput.content);
          let expansionEditedContent: string | undefined;
          if (expansionParsed.polishedText) {
            expandedText = expansionParsed.polishedText;
            expansionEditedContent = expansionEditorOutput.content;
          }

          const surfaceRegressionGuard = evaluateSurfaceRegression({
            beforeText: preExpandText,
            afterText: expandedText,
          });
          if (!surfaceRegressionGuard.passed) {
            pipelineLog.warn(
              `[chapter-length-guard] resizer surface regression guard triggered, keep original text: ${surfaceRegressionGuard.summary}`,
            );
          } else if (expandedText.length > polishedText.length) {
            polishedText = trimChapterToSentenceBoundary(expandedText, maxWordCount!);
            if (expansionEditedContent) {
              finalEditedContent = expansionEditedContent;
            }
            traceStage('chapter-length-guard.expand', polishedText);
          }
        }
      } catch (err) {
        pipelineLog.warn(`[chapter-length-guard] auto-expand failed, original text kept: ${err instanceof Error ? err.message : String(err)}`);
      }

      chapterLengthGuard = {
        ...lengthGuard,
        attemptedCompression: false,
        attemptedExpansion,
        usedFallbackTrim: false,
        finalWordCount: polishedText.length,
      };

      if (chapterNumber <= 3) {
        startupOpeningReport = evaluateStartupOpeningGate({
          chapterContent: polishedText,
          chapterNumber,
          gateMode: 'warn',
          platformProfile: resolvedStartupPlatformProfile,
          promiseContract,
          targetWordCount: maxWordCount,
        });
      }
    }

    if (shouldTriggerChapterLengthGuard(polishedText.length, maxWordCount) && !effectiveSkipLengthGuard) {
      const lengthGuard = buildChapterLengthGuardSummary(polishedText.length, maxWordCount);
      pipelineLog.warn(`[chapter-length-guard] novel=${novelId} chapter=${chapterNumber} ${lengthGuard.summary}`);
      let attemptedCompression = false;
      let usedFallbackTrim = false;

      const guardFeedback = buildChapterLengthGuardFeedback({
        targetWordCount: maxWordCount!,
        actualWordCount: polishedText.length,
      });

      const preCompressionGuardText = polishedText;
      const preCompressionEditedContent = finalEditedContent;
      const applyFallbackTrim = (stage: string, metadata?: Record<string, unknown>): void => {
        const fallback = buildChapterLengthFallbackTrim(preCompressionGuardText, maxWordCount!);
        polishedText = fallback.content;
        usedFallbackTrim = fallback.applied;
        finalEditedContent = preCompressionEditedContent;
        traceStage(stage, polishedText, metadata);
      };
      try {
        attemptedCompression = true;
        const preCompressText = preCompressionGuardText;
        // 精简 resizer 上下文：只保留必需字段，清空诱导性的世界观/角色/前文上下文
        // 避免海量背景素材诱导模型"另起炉灶"重新创作
        const resizerContext: AgentContext = {
          ...baseContext,
          worldContext: undefined,
          characterContext: undefined,
          previousChapterSummary: undefined,
          outlineContext: undefined,
          scenePlan: undefined,
          outlineContract: undefined,
          worldContract: undefined,
          consistencyGuardrails: undefined,
          characterEventContext: undefined,
          inputText: polishedText,
          resizeMode: 'compress',
          originalWordCount: polishedText.length,
          maxWordCount,
          userDirection: [editorContext.userDirection, guardFeedback].filter(Boolean).join('\n\n'),
          temperatureOverride: 0.3,
        };
        const resizerOutput = await runAgent('resizer', resizerContext);
        let compressedText = resizerOutput.content.trim();

        // 回归保护：检测 resizer 是否"另起炉灶"生成了完全不同的内容
        const resizerRegressionGuard = verifyRewriteRegression({
          beforeText: preCompressText,
          afterText: compressedText,
          characters,
          worldEntries,
        });
        if (!resizerRegressionGuard.passed) {
          pipelineLog.warn(
            `[chapter-length-guard] resizer 回归保护触发，保留压缩前文本并交由最终长度审计记录：${resizerRegressionGuard.summary}`,
          );
          applyFallbackTrim('chapter-length-guard.compress-rejected-fallback', {
            resizerRegression: resizerRegressionGuard.summary,
          });
        } else {
          const compressionEditorOutput = await runAgent('editor', {
            ...editorContext,
            inputText: compressedText,
            resizeMode: 'compress',
            originalWordCount: preCompressText.length,
            maxWordCount,
            startupOpeningGateFixHints: startupOpeningGateRewrite?.reason,
            temperatureOverride: 0.25,
          });
          const compressionParsed = parseEditorOutput(compressionEditorOutput.content);
          if (compressionParsed.polishedText) {
            compressedText = compressionParsed.polishedText;
            finalEditedContent = compressionEditorOutput.content;
          }

          const candidateCompressedText = trimChapterToSentenceBoundary(compressedText, maxWordCount!);
          const preCompressionQuality = evaluateChapterQualityGate({
            chapterContent: preCompressText,
            scenePlan,
            stylePreset: styleProfile.resolvedPreset,
            antiAiStructure: this.enhancementThresholds.antiAiStructure,
            gateMode: effectiveQualityGateMode,
            thresholds: this.qualityFeatures,
            genre: novel.genre,
            enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
            enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
            domainStructureKeywords,
          });
          const compressedQuality = evaluateChapterQualityGate({
            chapterContent: candidateCompressedText,
            scenePlan,
            stylePreset: styleProfile.resolvedPreset,
            antiAiStructure: this.enhancementThresholds.antiAiStructure,
            gateMode: effectiveQualityGateMode,
            thresholds: this.qualityFeatures,
            genre: novel.genre,
            enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
            enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
            domainStructureKeywords,
          });
          const preCompressionReadability = auditChapterReadability({
            chapterContent: preCompressText,
            readerScore: previousReaderScoreForRepair,
            previousReaderScore: previousReaderScoreForRepair,
            qualityGate: preCompressionQuality,
          });
          const compressedReadability = auditChapterReadability({
            chapterContent: candidateCompressedText,
            readerScore: previousReaderScoreForRepair,
            previousReaderScore: previousReaderScoreForRepair,
            qualityGate: compressedQuality,
          });
          const compressionQualityRegression = compressedQuality.emotionScore < preCompressionQuality.emotionScore - 4
            || compressedQuality.structureScore < preCompressionQuality.structureScore - 6
            || compressedReadability.issues.length > preCompressionReadability.issues.length + 1;
          if (compressionQualityRegression) {
            pipelineLog.warn(`[chapter-length-guard] compression rejected by reader-quality guard; preserving pre-compression text for final length audit`);
            applyFallbackTrim('chapter-length-guard.compress-quality-rejected-fallback', {
              beforeEmotion: preCompressionQuality.emotionScore,
              afterEmotion: compressedQuality.emotionScore,
              beforeStructure: preCompressionQuality.structureScore,
              afterStructure: compressedQuality.structureScore,
              beforeReadabilityIssues: preCompressionReadability.issues.length,
              afterReadabilityIssues: compressedReadability.issues.length,
            });
          } else {
            polishedText = candidateCompressedText;
            traceStage('chapter-length-guard.compress', polishedText);
          }
        }
      } catch (err) {
        pipelineLog.warn(`[chapter-length-guard] auto-compress failed, keeping pre-compression text for reader quality: ${err instanceof Error ? err.message : String(err)}`);
        applyFallbackTrim('chapter-length-guard.compress-failed-fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      chapterLengthGuard = {
        ...lengthGuard,
        attemptedCompression,
        attemptedExpansion: false,
        usedFallbackTrim,
        finalWordCount: polishedText.length,
      };

      if (chapterNumber <= 3) {
        startupOpeningReport = evaluateStartupOpeningGate({
          chapterContent: polishedText,
          chapterNumber,
          gateMode: 'warn',
          platformProfile: resolvedStartupPlatformProfile,
          promiseContract,
          targetWordCount: maxWordCount,
        });
      }
    }

    const hadPromiseRewrite = chapterPromiseGateRewrite?.attempted || commercialGateRewrite?.attempted;
    if (effectiveQualityGateMode !== 'off' && (hadAnyRewrite || hadPromiseRewrite)) {
      const finalChapterPromiseReport = evaluateChapterPromiseGate({
        chapterContent: polishedText,
        chapterNumber,
        gateMode: effectiveChapterPromiseGateMode,
        card: chapterPromiseCard,
        recentChapterContents: recentChapterContentsForVoice,
      });
      if (
        chapterPromiseReport
        && (
          finalChapterPromiseReport.payoffHits < chapterPromiseReport.payoffHits
          || finalChapterPromiseReport.sceneHits < chapterPromiseReport.sceneHits
          || (chapterPromiseReport.passed && !finalChapterPromiseReport.passed)
        )
      ) {
        chapterPromiseGateLog.warn(
          `final recheck detected regression, novel=${novelId} chapter=${chapterNumber} before=${chapterPromiseReport.summary} after=${finalChapterPromiseReport.summary}`,
        );
      }
      chapterPromiseReport = finalChapterPromiseReport;
      if (!chapterPromiseReport.passed && effectiveChapterPromiseGateMode === 'strict') {
        if (reportHasFindingCodes(chapterPromiseReport, chapterPromiseNonDowngradableHardBlockCodes)) {
          throw new Error(buildHardBlockMessage('章节承诺门禁最终复检', chapterPromiseNonDowngradableHardBlockCodes, chapterPromiseReport));
        }
        if (!this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(`章节承诺门禁最终复检未通过（strict）：${chapterPromiseReport.summary}`);
        }
        if (reportHasFindingCodes(chapterPromiseReport, chapterPromiseHardBlockCodes) && !this.qualityFeatures.strictFallbackToWarn) {
          throw new Error(buildHardBlockMessage('章节承诺门禁最终复检', chapterPromiseHardBlockCodes, chapterPromiseReport));
        }
        chapterPromiseGateLog.warn(
          `final recheck strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${chapterPromiseReport.summary}`,
        );
        if (reportHasFindingCodes(chapterPromiseReport, chapterPromiseHardBlockCodes)) {
          chapterPromiseGateLog.warn(
            `final recheck hard block downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${buildHardBlockMessage('章节承诺门禁最终复检', chapterPromiseHardBlockCodes, chapterPromiseReport)}`,
          );
        }
      }

      const finalCommercialReport = evaluateCommercialGate({
        chapterContent: polishedText,
        chapterNumber,
        plotThreads: outline.plotThreads,
        protagonistNames,
        promiseContract,
        gateMode: effectiveCommercialGateMode,
      });
      commercialReport = finalCommercialReport;
      if (
        effectiveCommercialGateMode === 'strict'
        && reportHasFindingCodes(commercialReport, commercialHardBlockCodes)
        && !this.qualityFeatures.strictFallbackToWarn
      ) {
        throw new Error(buildHardBlockMessage('商业化门禁最终复检', commercialHardBlockCodes, commercialReport));
      }
      if (
        effectiveCommercialGateMode === 'strict'
        && reportHasFindingCodes(commercialReport, commercialHardBlockCodes)
        && this.qualityFeatures.strictFallbackToWarn
      ) {
        commercialGateLog.warn(
          `final recheck hard block downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${buildHardBlockMessage('商业化门禁最终复检', commercialHardBlockCodes, commercialReport)}`,
        );
      }
    }

    // === Reader 评估（确定性优先，按需升级为 LLM） ===
    const cfg = getConfig();
    const useLlmReader = cfg.autoRevision.enabled;

    const readerEvaluation = await evaluateReader({
      useLlmReader,
      baseContext,
      scenePlan,
      outlineContract: outlineContract.prompt || undefined,
      worldContract: worldContract?.prompt,
      structuredAuditEnabled: this.structuredAuditFeatures.enabled,
      chapterContent: polishedText,
      qualityReport,
      aiTraceReport,
      continuityReport,
      commercialReport,
      worldFulfillment,
      outlineFulfillment,
      speakerWhitelistReport,
      runAgent,
      allOutputs,
      pipelineLog,
    });
    const readerOutput = readerEvaluation.readerOutput;

    // === 自动修订闭环 ===
    let autoRevisionResult: ChapterGenerationResult['autoRevision'];
    let initialScore = parseReaderScore(readerOutput.content);

    const genreDriftBeforeRepair = auditGenreDrift({
      chapterContent: polishedText,
      title: novel.title,
      synopsis: novel.synopsis,
      genre: novel.genre,
      tags: novel.tags,
      constitutionTags: novel.constitutionTags,
      promiseContract,
    });
    const readabilityRepair = buildReadabilityRepairDecision({
      readerScore: initialScore,
      scoreThreshold: cfg.autoRevision.scoreThreshold,
      previousReaderScore: previousReaderScoreForRepair,
      qualityReport,
      genreDrift: genreDriftBeforeRepair,
    });
    // 可读性修复默认跟随质量地板修订开关：关闭强制修订时同时跳过这一额外 editor 调用
    const readabilityRepairEnabled = readBoolEnv(
      process.env.READABILITY_REPAIR_ENABLED,
      cfg.autoRevision.enabled || cfg.autoRevision.qualityFloorRevisionEnabled,
    );
    if (readabilityRepairEnabled && readabilityRepair.shouldRepair) {
      const repairEditorCtx: AgentContext = {
        ...editorContext,
        inputText: polishedText,
        outlineContract: outlineContract.prompt || undefined,
        worldContract: worldContract?.prompt,
        qualityGateFixHints: readabilityRepair.hints,
        temperatureOverride: getAdaptiveTemperature('editor', false),
      };
      const repairEditorOutput = await runAgent('editor', repairEditorCtx);
      const repairParsed = parseEditorOutput(repairEditorOutput.content);
      if (repairParsed.polishedText) {
        const beforeRepairText = polishedText;
        const beforeRepairEditedContent = finalEditedContent;
        const beforeRepairReaderContent = readerOutput.content;
        const beforeRepairQualityReport = qualityReport;
        const beforeSpeakerMarkers = countInlineSpeakerMarkers(polishedText);
        polishedText = repairParsed.polishedText;
        finalEditedContent = repairEditorOutput.content;
        traceStage('readability-repair.editor', polishedText, {
          reasons: readabilityRepair.reasons,
        });

        const repairedQualityReport = evaluateChapterQualityGate({
          chapterContent: polishedText,
          scenePlan,
          stylePreset: styleProfile.resolvedPreset,
          antiAiStructure: this.enhancementThresholds.antiAiStructure,
          gateMode: effectiveQualityGateMode,
          thresholds: this.qualityFeatures,
          genre: novel.genre,
          enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
          enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
          domainStructureKeywords,
        });
        const repairedGenreDrift = auditGenreDrift({
          chapterContent: polishedText,
          title: novel.title,
          synopsis: novel.synopsis,
          genre: novel.genre,
          tags: novel.tags,
          constitutionTags: novel.constitutionTags,
          promiseContract,
        });
        const afterSpeakerMarkers = countInlineSpeakerMarkers(polishedText);
        let repairAccepted = false;
        let repairedReaderContent = beforeRepairReaderContent;
        let repairedReaderScore = initialScore;
        const beforeReadabilityAudit = auditChapterReadability({
          chapterContent: beforeRepairText,
          readerScore: initialScore,
          previousReaderScore: previousReaderScoreForRepair,
          qualityGate: beforeRepairQualityReport,
          genreDrift: genreDriftBeforeRepair,
        });
        const repairedReadabilityAudit = auditChapterReadability({
          chapterContent: polishedText,
          readerScore: initialScore,
          previousReaderScore: previousReaderScoreForRepair,
          qualityGate: repairedQualityReport,
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
        const qualityDropWithinRepairTolerance = repairedQualityReport.overallScore >= (qualityReport?.overallScore ?? 0) - 1
          && repairedQualityReport.emotionScore >= (qualityReport?.emotionScore ?? 0) - 2
          && repairedQualityReport.structureScore >= (qualityReport?.structureScore ?? 0) - 5;
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
        const repairedStillStalled = repairedQualityReport.findings.some(finding => finding.code === 'stalled-momentum');
        if (afterSpeakerMarkers > beforeSpeakerMarkers) {
          polishedText = beforeRepairText;
          finalEditedContent = beforeRepairEditedContent;
          qualityReport = beforeRepairQualityReport;
          traceStage('readability-repair.reverted', polishedText, {
            beforeSpeakerMarkers,
            afterSpeakerMarkers,
            reason: 'speaker-marker-regression',
          });
        } else if (
          !qualityReport
          || (
            repairedQualityReport.overallScore >= qualityReport.overallScore
            && repairedQualityReport.emotionScore >= qualityReport.emotionScore
            && (!structureNeedsImprovement || repairedQualityReport.structureScore > qualityReport.structureScore)
            && (!emotionNeedsImprovement || repairedQualityReport.emotionScore > qualityReport.emotionScore)
            && (!stalledNeedsImprovement || !repairedStillStalled || repairedQualityReport.emotionScore >= qualityReport.emotionScore + 3)
          )
          || readabilityImproved
        ) {
          if (useLlmReader) {
            const repairReaderCtx: AgentContext = {
              ...baseContext,
              scenePlan,
              outlineContract: outlineContract.prompt || undefined,
              worldContract: worldContract?.prompt,
              inputText: polishedText,
              temperatureOverride: getAdaptiveTemperature('reader', false),
              useStructuredAudit: this.structuredAuditFeatures.enabled,
            };
            const repairedReaderOutput = await runAgent('reader', repairReaderCtx);
            repairedReaderContent = repairedReaderOutput.content;
          } else {
            repairedReaderContent = synthesizeDeterministicReader({
              chapterContent: polishedText,
              qualityReport: repairedQualityReport,
              aiTraceReport,
              continuityReport,
              commercialReport,
              worldFulfillment,
              outlineFulfillment,
              speakerWhitelistReport,
            });
          }
          repairedReaderScore = parseReaderScore(repairedReaderContent);
          const avoidsPreviousChapterRegression = typeof previousReaderScoreForRepair !== 'number'
            || repairedReaderScore >= previousReaderScoreForRepair - 0.2;
          if (repairedReaderScore >= initialScore && avoidsPreviousChapterRegression) {
            qualityReport = repairedQualityReport;
            repairAccepted = true;
          } else if (readabilityImproved && repairedReaderScore >= initialScore - 0.1 && avoidsPreviousChapterRegression) {
            qualityReport = repairedQualityReport;
            repairAccepted = true;
          } else {
            polishedText = beforeRepairText;
            finalEditedContent = beforeRepairEditedContent;
            qualityReport = beforeRepairQualityReport;
            traceStage('readability-repair.reverted', polishedText, {
              beforeReaderScore: initialScore,
              afterReaderScore: repairedReaderScore,
              previousReaderScore: previousReaderScoreForRepair,
              beforeScore: beforeRepairQualityReport?.overallScore,
              afterScore: repairedQualityReport.overallScore,
              beforeEmotion: beforeRepairQualityReport?.emotionScore,
              afterEmotion: repairedQualityReport.emotionScore,
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
          polishedText = beforeRepairText;
          finalEditedContent = beforeRepairEditedContent;
          qualityReport = beforeRepairQualityReport;
          traceStage('readability-repair.reverted', polishedText, {
            beforeScore: beforeRepairQualityReport?.overallScore,
            afterScore: repairedQualityReport.overallScore,
            beforeEmotion: beforeRepairQualityReport?.emotionScore,
            afterEmotion: repairedQualityReport.emotionScore,
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
          readerOutput.content = repairedReaderContent;
          initialScore = repairedReaderScore;
        } else {
          readerOutput.content = beforeRepairReaderContent;
          initialScore = parseReaderScore(beforeRepairReaderContent);
        }
      }
    }

    const hasMomentumQualityWarning = qualityReport?.findings.some(finding =>
      finding.code === 'stalled-momentum' || finding.code === 'low-scene-coverage',
    ) ?? false;
    const hasReaderQualityRegression = typeof previousReaderScoreForRepair === 'number'
      && previousReaderScoreForRepair - initialScore >= 0.2
      && (hasMomentumQualityWarning || (qualityReport?.emotionScore ?? 100) < 65);
    const hasStalledEmotionWeakness = Boolean(
      qualityReport?.findings.some(finding => finding.code === 'stalled-momentum')
      && (qualityReport?.emotionScore ?? 100) < 65,
    );
    const previousChapterForReaderDeliveryRepair = previousChapterNumber >= 1
      ? await this.chapterCache.get(this.novelManager, novelId, previousChapterNumber).catch(() => null)
      : null;
    const readerDeliveryRepair = buildReaderDeliveryRepairSignal({
      novel,
      promiseContract,
      novelId,
      chapterNumber,
      title: chapterOutline?.title || `Chapter ${chapterNumber}`,
      content: polishedText,
      readerScore: initialScore,
      previousChapter: previousChapterForReaderDeliveryRepair,
      qualityReport,
      startupOpeningReport,
      agentOutputs: allOutputs,
    });
    const directionAnchorAudit = auditUserDirectionAnchors({
      direction: userDirection,
      content: polishedText,
      stage: 'draft',
    });
    // 质量地板强制修订总开关：仅在自动修订启用、或显式开启地板修订时才允许强制重写循环。
    // 两者都关时，命中质量地板不再偷偷触发 writer+editor 重写（这是"关了开关仍变慢"的根因）。
    const qualityFloorRevisionAllowed = cfg.autoRevision.enabled
      || cfg.autoRevision.qualityFloorRevisionEnabled;
    const strictQualityFloorRevisionNeeded = qualityFloorRevisionAllowed && !skipStrictGate && (
      initialScore < 7
      || (typeof previousReaderScoreForRepair === 'number' && previousReaderScoreForRepair - initialScore >= 0.3)
      || hasReaderQualityRegression
      || hasStalledEmotionWeakness
      || Boolean(qualityReport && qualityReport.structureScore < 75 && hasMomentumQualityWarning)
    );
    const readerDeliveryRevisionNeeded = qualityFloorRevisionAllowed
      && (readerDeliveryRepair.shouldRepair || directionAnchorAudit.shouldRepair);
    const qualityFloorRevisionNeeded = strictQualityFloorRevisionNeeded || readerDeliveryRevisionNeeded;
    const shouldRunAutoRevision = !skipStrictGate && (
      (cfg.autoRevision.enabled && (initialScore < cfg.autoRevision.scoreThreshold || qualityFloorRevisionNeeded))
      || (!cfg.autoRevision.enabled && qualityFloorRevisionNeeded)
    ) || readerDeliveryRevisionNeeded;

    if (shouldRunAutoRevision) {
      pipelineTraceLog.warn(`[trace] run=${runId} stage=auto-revision.trigger`, {
        novelId,
        chapterNumber,
        initialScore,
        scoreThreshold: cfg.autoRevision.scoreThreshold,
        forcedByQualityFloor: qualityFloorRevisionNeeded,
        readerDeliveryRepair: readerDeliveryRepair.shouldRepair,
        readerDeliveryScore: readerDeliveryRepair.audit.score,
        readerDeliveryReasons: [
          ...readerDeliveryRepair.reasons,
          ...(directionAnchorAudit.shouldRepair ? [`direction anchors missing: ${directionAnchorAudit.missingAnchors.join(', ')}`] : []),
        ],
      });
      autoRevisionResult = {
        triggered: true,
        rounds: 0,
        initialScore,
        finalScore: initialScore,
      };

      let currentPolished = polishedText;
      let currentReaderContent = readerOutput.content;
      let currentScore = initialScore;
      let currentQualityReport = qualityReport;
      let currentReaderDeliveryRepair = readerDeliveryRepair;
      let currentDirectionAnchorAudit = directionAnchorAudit;
        let bestRevisionCandidate = {
          round: 0,
          polished: currentPolished,
          readerContent: currentReaderContent,
          score: currentScore,
          qualityReport: currentQualityReport,
          readerDeliveryRepair: currentReaderDeliveryRepair,
          directionAnchorAudit: currentDirectionAnchorAudit,
          acceptanceReason: 'initial',
        };
      const maxRevisionRounds = readerDeliveryRevisionNeeded
        ? Math.max(cfg.autoRevision.enabled ? cfg.autoRevision.maxRounds : 1, 3)
        : cfg.autoRevision.enabled ? cfg.autoRevision.maxRounds : 1;

      for (let round = 1; round <= maxRevisionRounds; round++) {
        onEvent?.({
          type: 'revision:start',
          agentRole: 'writer',
          novelId,
          chapterNumber,
          data: `自动修订第 ${round} 轮（当前评分 ${currentScore}）`,
          timestamp: new Date().toISOString(),
        });

        // Writer 重写（带 Reader 反馈）
        const revisionDirection = buildAutoRevisionDirection(
          [userDirection, directionAnchorInstruction].filter(Boolean).join('\n\n'),
          [
            currentReaderContent,
            currentReaderDeliveryRepair.feedback,
            currentDirectionAnchorAudit.feedback,
          ].filter(Boolean).join('\n\n'),
        );
        const revWriterCtx: AgentContext = {
          ...writerContext,
          userDirection: revisionDirection,
          readerFeedback: currentReaderContent,
          temperatureOverride: getAdaptiveTemperature('writer', true),
        };
        const revWriterOutput = await runAgent('writer', revWriterCtx);
        traceStage(`auto-revision.writer.${round}`, revWriterOutput.content, { round });

        // Editor 润色
        const revEditorCtx: AgentContext = {
          ...writerContext,
          inputText: revWriterOutput.content,
          temperatureOverride: getAdaptiveTemperature('editor', false),
        };
        const revEditorOutput = await runAgent('editor', revEditorCtx);
        const revParsed = parseEditorOutput(revEditorOutput.content);
        if (revParsed.polishedText) {
          currentPolished = revParsed.polishedText;
          finalEditedContent = revEditorOutput.content;
          traceStage(`auto-revision.editor.${round}`, currentPolished, { round });
        }

        currentQualityReport = evaluateChapterQualityGate({
          chapterContent: currentPolished,
          scenePlan,
          stylePreset: styleProfile.resolvedPreset,
          antiAiStructure: this.enhancementThresholds.antiAiStructure,
          gateMode: effectiveQualityGateMode,
          thresholds: this.qualityFeatures,
          genre: novel.genre,
          enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
          enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
          domainStructureKeywords,
        });

        // Reader 重新评分
        if (cfg.autoRevision.enabled) {
          const revReaderCtx: AgentContext = {
            ...baseContext,
            scenePlan,
            outlineContract: outlineContract.prompt || undefined,
            worldContract: worldContract?.prompt,
            inputText: currentPolished,
            temperatureOverride: getAdaptiveTemperature('reader', false),
          };
          const revReaderOutput = await runAgent('reader', revReaderCtx);
          currentReaderContent = revReaderOutput.content;
        } else {
          currentReaderContent = synthesizeDeterministicReader({
            chapterContent: currentPolished,
            qualityReport: currentQualityReport,
            aiTraceReport,
            continuityReport,
            commercialReport,
            worldFulfillment,
            outlineFulfillment,
            speakerWhitelistReport,
          });
        }
        currentScore = parseReaderScore(currentReaderContent);
        currentReaderDeliveryRepair = buildReaderDeliveryRepairSignal({
          novel,
          promiseContract,
          novelId,
          chapterNumber,
          title: chapterOutline?.title || `Chapter ${chapterNumber}`,
          content: currentPolished,
          readerScore: currentScore,
          previousChapter: previousChapterForReaderDeliveryRepair,
          qualityReport: currentQualityReport,
          agentOutputs: allOutputs,
        });
        currentDirectionAnchorAudit = auditUserDirectionAnchors({
          direction: userDirection,
          content: currentPolished,
          stage: 'revision',
        });
        const candidateAcceptance = evaluateReadabilityRepairAcceptance({
          initialScore,
          attemptedScore: currentScore,
          previousReaderScore: previousReaderScoreForRepair,
          initialQuality: qualityReport,
          attemptedQuality: currentQualityReport,
        });
        const readerDeliveryCandidateAcceptance = evaluateReaderDeliveryRevisionCandidate({
          candidateAudit: currentReaderDeliveryRepair.audit,
          bestAudit: bestRevisionCandidate.readerDeliveryRepair.audit,
          candidateScore: currentScore,
          bestScore: bestRevisionCandidate.score,
          candidateQuality: currentQualityReport,
          bestQuality: bestRevisionCandidate.qualityReport,
          directionAnchorCoverageGain: currentDirectionAnchorAudit.coverage
            - bestRevisionCandidate.directionAnchorAudit.coverage,
        });
        const candidateReadableEnough = readerDeliveryRevisionNeeded
          ? readerDeliveryCandidateAcceptance.accepted
          : candidateAcceptance.accepted;
        if (candidateReadableEnough && readerDeliveryCandidateAcceptance.accepted && !currentDirectionAnchorAudit.shouldRepair) {
          bestRevisionCandidate = {
            round,
            polished: currentPolished,
            readerContent: currentReaderContent,
            score: currentScore,
              qualityReport: currentQualityReport,
              readerDeliveryRepair: currentReaderDeliveryRepair,
              directionAnchorAudit: currentDirectionAnchorAudit,
              acceptanceReason: `${candidateAcceptance.reason};${readerDeliveryCandidateAcceptance.reason}`,
            };
          }

        autoRevisionResult.rounds = round;
        autoRevisionResult.finalScore = currentScore;

        onEvent?.({
          type: 'revision:complete',
          agentRole: 'reader',
          novelId,
          chapterNumber,
          data: `自动修订第 ${round} 轮完成（评分 ${currentScore}）`,
          timestamp: new Date().toISOString(),
        });

        // 达标则提前退出
        if (
          currentScore >= cfg.autoRevision.scoreThreshold
          && (!readerDeliveryRevisionNeeded || !currentReaderDeliveryRepair.shouldRepair)
          && !currentDirectionAnchorAudit.shouldRepair
        ) {
          break;
        }
      }

      // 更新最终结果
      const repairAcceptance = evaluateReadabilityRepairAcceptance({
        initialScore,
        attemptedScore: currentScore,
        previousReaderScore: previousReaderScoreForRepair,
        initialQuality: qualityReport,
        attemptedQuality: currentQualityReport,
      });
      const selectedReaderDeliveryGain = bestRevisionCandidate.readerDeliveryRepair.audit.score
        - readerDeliveryRepair.audit.score;
      const selectedReaderDeliveryAcceptance = evaluateReaderDeliveryRevisionCandidate({
        candidateAudit: bestRevisionCandidate.readerDeliveryRepair.audit,
        bestAudit: readerDeliveryRepair.audit,
        candidateScore: bestRevisionCandidate.score,
        bestScore: initialScore,
        candidateQuality: bestRevisionCandidate.qualityReport,
        bestQuality: qualityReport,
        directionAnchorCoverageGain: bestRevisionCandidate.directionAnchorAudit.coverage
          - directionAnchorAudit.coverage,
      });
      const selectedCandidateAcceptable = bestRevisionCandidate.round > 0 && (
        (
          !readerDeliveryRevisionNeeded
          || bestRevisionCandidate.readerDeliveryRepair.audit.passed
          || selectedReaderDeliveryAcceptance.accepted
        )
        && !bestRevisionCandidate.directionAnchorAudit.shouldRepair
      );
      autoRevisionResult.readerDeliveryInitialScore = readerDeliveryRepair.audit.score;
      autoRevisionResult.readerDeliveryFinalScore = bestRevisionCandidate.readerDeliveryRepair.audit.score;
      autoRevisionResult.readerDeliveryPassed = bestRevisionCandidate.readerDeliveryRepair.audit.passed;
      autoRevisionResult.selectedRound = bestRevisionCandidate.round;

      if (selectedCandidateAcceptable) {
        polishedText = bestRevisionCandidate.polished;
        readerOutput.content = bestRevisionCandidate.readerContent;
        qualityReport = bestRevisionCandidate.qualityReport;
        autoRevisionResult.finalScore = bestRevisionCandidate.score;
        autoRevisionResult.accepted = true;
        autoRevisionResult.reason = bestRevisionCandidate.readerDeliveryRepair.audit.passed
          ? 'reader-delivery-passed'
          : `best-reader-delivery-candidate:${bestRevisionCandidate.acceptanceReason}`;
      } else {
        autoRevisionResult.finalScore = initialScore;
        autoRevisionResult.accepted = false;
        autoRevisionResult.reason = currentDirectionAnchorAudit.shouldRepair
          ? `direction-anchors-still-missing:${currentDirectionAnchorAudit.coverage}`
          : currentReaderDeliveryRepair.shouldRepair
          ? `reader-delivery-still-failed:${currentReaderDeliveryRepair.audit.score}`
          : repairAcceptance.reason;
        traceStage('auto-revision.reverted', polishedText, {
          attemptedScore: currentScore,
          initialScore,
          previousReaderScore: previousReaderScoreForRepair,
          attemptedQuality: currentQualityReport?.overallScore,
          initialQuality: qualityReport?.overallScore,
          bestRound: bestRevisionCandidate.round,
          bestReaderDeliveryScore: bestRevisionCandidate.readerDeliveryRepair.audit.score,
          bestReaderDeliveryGain: selectedReaderDeliveryGain,
          selectedReaderDeliveryAcceptance: selectedReaderDeliveryAcceptance.reason,
          bestDirectionAnchorCoverage: bestRevisionCandidate.directionAnchorAudit.coverage,
          reason: autoRevisionResult.reason,
        });
      }
    }
    traceStage('final.before-save', polishedText, {
      autoRevisionTriggered: autoRevisionResult?.triggered ?? false,
      autoRevisionRounds: autoRevisionResult?.rounds ?? 0,
    });

    const contrastSanitizeReport = sanitizeContrastPhrasing(polishedText);
    if (contrastSanitizeReport.applied) {
      polishedText = contrastSanitizeReport.rewrittenText;
      qualityGateLog.info(`[contrast-sanitize] novel=${novelId} chapter=${chapterNumber} ${contrastSanitizeReport.summary}`);
      traceStage('final.contrast-sanitize', polishedText, {
        replacements: contrastSanitizeReport.replacementCount,
      });
    }

    const typoCorrectionReport = correctTypos(polishedText);
    if (typoCorrectionReport.applied) {
      polishedText = typoCorrectionReport.correctedText;
      pipelineLog.info(`[typo-correction] novel=${novelId} chapter=${chapterNumber} corrected ${typoCorrectionReport.correctionCount} typos`, {
        details: typoCorrectionReport.corrections.map(c => `${c.corrected}:${c.count}`).join(','),
      });
      traceStage('final.typo-correction', polishedText, {
        correctionCount: typoCorrectionReport.correctionCount,
      });
    }

    const sanitizedExitMarkers = sanitizeSuspiciousExitMarkers(polishedText);
    if (sanitizedExitMarkers.removedMarkers.length > 0) {
      polishedText = sanitizedExitMarkers.sanitizedText;
      pipelineLog.warn('removed suspicious exit markers from chapter output', {
        novelId,
        chapterNumber,
        removed: sanitizedExitMarkers.removedMarkers,
      });
      traceStage('final.exit-marker-sanitize', polishedText, {
        removedMarkers: sanitizedExitMarkers.removedMarkers.length,
      });
    }

    const publicFacingCleanedText = cleanPublicFacingContent(polishedText);
    if (publicFacingCleanedText !== polishedText) {
      const speakerMarkersBeforePublicClean = countInlineSpeakerMarkers(polishedText);
      polishedText = publicFacingCleanedText;
      traceStage('final.public-facing-clean', polishedText, {
        speakerMarkersRemoved: speakerMarkersBeforePublicClean,
      });
    }
    if (worldContract && this.worldFeatures.gateMode !== 'off') {
      const finalWorldGuard = await enforceFinalWorldContract({
        contract: worldContract,
        chapterContent: polishedText,
        finalEditedContent,
        gateMode: this.worldFeatures.gateMode,
        knownWorldEntries: reusableWorldEntries,
        knownCharacterNames,
        skipStrictGate: Boolean(skipStrictGate),
        editorContext,
        runAgent,
        traceStage,
      });
      polishedText = cleanPublicFacingContent(finalWorldGuard.chapterContent);
      finalEditedContent = finalWorldGuard.finalEditedContent;
      worldFulfillment = finalWorldGuard.fulfillment;
      if (finalWorldGuard.rewrite?.attempted) {
        worldGateRewrite = finalWorldGuard.rewrite;
      }
      if (!worldFulfillment.passed && this.worldFeatures.gateMode === 'strict' && !skipStrictGate) {
        if (!this.worldFeatures.strictFallbackToWarn) {
          throw new Error(`世界观门禁保存前复检未通过（strict）：${worldFulfillment.summary}`);
        }
        worldGateLog.warn(
          `pre-save strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${worldFulfillment.summary}`,
        );
      }
    }
    let finalRecoveryQualityReport: ChapterGenerationResult['qualityReport'];
    const finalUnderLengthRecovery = await recoverFinalUnderLengthChapter({
      text: polishedText,
      targetWordCount: maxWordCount,
      skip: effectiveSkipLengthGuard,
      expand: async feedback => {
        const recoveryOutput = await runAgent('resizer', {
          ...baseContext,
          worldContext: undefined,
          characterContext: undefined,
          previousChapterSummary: undefined,
          outlineContext: undefined,
          scenePlan: undefined,
          outlineContract: undefined,
          worldContract: undefined,
          consistencyGuardrails: undefined,
          characterEventContext: undefined,
          inputText: polishedText,
          resizeMode: 'expand',
          originalWordCount: polishedText.length,
          maxWordCount,
          userDirection: [editorContext.userDirection, feedback].filter(Boolean).join('\n\n'),
          temperatureOverride: 0.2,
        });
        return recoveryOutput.content;
      },
      sanitize: cleanPublicFacingContent,
      validateCandidate: candidate => {
        const rewriteRegression = verifyRewriteRegression({
          beforeText: polishedText,
          afterText: candidate,
          characters,
          worldEntries,
        });
        if (!rewriteRegression.passed) {
          return { passed: false, reason: rewriteRegression.summary };
        }
        const surfaceRegression = evaluateSurfaceRegression({
          beforeText: polishedText,
          afterText: candidate,
        });
        if (!surfaceRegression.passed) {
          return { passed: false, reason: surfaceRegression.summary };
        }
        const candidateQuality = evaluateChapterQualityGate({
          chapterContent: candidate,
          scenePlan,
          stylePreset: styleProfile.resolvedPreset,
          antiAiStructure: this.enhancementThresholds.antiAiStructure,
          gateMode: effectiveQualityGateMode,
          thresholds: this.qualityFeatures,
          genre: novel.genre,
          enableGenreAdaptiveThresholds: this.qualityFeatures.enableGenreAdaptiveThresholds,
          enableAiTellClusterGate: this.qualityFeatures.enableAiTellClusterGate,
          domainStructureKeywords,
        });
        if (
          qualityReport
          && (
            candidateQuality.overallScore < qualityReport.overallScore - 3
            || candidateQuality.structureScore < qualityReport.structureScore - 5
          )
        ) {
          return {
            passed: false,
            reason: `expanded candidate quality regressed: ${qualityReport.overallScore} -> ${candidateQuality.overallScore}`,
          };
        }
        finalRecoveryQualityReport = candidateQuality;
        return { passed: true };
      },
    });
    if (finalUnderLengthRecovery.report) {
      const recovery = finalUnderLengthRecovery.report;
      const guardSummary = buildChapterLengthGuardSummary(recovery.beforeChars, maxWordCount);
      chapterLengthGuard = {
        ...guardSummary,
        triggered: true,
        direction: 'under',
        summary: `${recovery.reason}: target ${recovery.targetWordCount}, before ${recovery.beforeChars}, after ${recovery.afterChars}`,
        attemptedCompression: chapterLengthGuard?.attemptedCompression ?? false,
        attemptedExpansion: true,
        usedFallbackTrim: chapterLengthGuard?.usedFallbackTrim ?? false,
        finalWordCount: finalUnderLengthRecovery.content.length,
      };
      if (recovery.applied) {
        polishedText = finalUnderLengthRecovery.content;
        qualityReport = finalRecoveryQualityReport ?? qualityReport;
        traceStage('final.chapter-length-recovery', polishedText, {
          beforeChars: recovery.beforeChars,
          afterChars: recovery.afterChars,
        });
        pipelineLog.info(`[chapter-length-guard] final under-length recovery applied, novel=${novelId} chapter=${chapterNumber} before=${recovery.beforeChars} after=${recovery.afterChars}`);
        if (worldContract && this.worldFeatures.gateMode !== 'off') {
          worldFulfillment = evaluateWorldContractFulfillment({
            contract: worldContract,
            chapterContent: polishedText,
            gateMode: this.worldFeatures.gateMode,
            knownWorldEntries: reusableWorldEntries,
            knownCharacterNames,
          });
        }
        chapterPromiseReport = evaluateChapterPromiseGate({
          chapterContent: polishedText,
          chapterNumber,
          gateMode: effectiveChapterPromiseGateMode,
          card: chapterPromiseCard,
          recentChapterContents: recentChapterContentsForVoice,
        });
        commercialReport = evaluateCommercialGate({
          chapterContent: polishedText,
          chapterNumber,
          plotThreads: outline.plotThreads,
          protagonistNames,
          promiseContract,
          gateMode: effectiveCommercialGateMode,
        });
        if (chapterNumber <= 3) {
          startupOpeningReport = evaluateStartupOpeningGate({
            chapterContent: polishedText,
            chapterNumber,
            gateMode: 'warn',
            platformProfile: resolvedStartupPlatformProfile,
            promiseContract,
            targetWordCount: maxWordCount,
          });
        }
        readerOutput.content = synthesizeDeterministicReader({
          chapterContent: polishedText,
          qualityReport,
          aiTraceReport,
          continuityReport,
          commercialReport,
          worldFulfillment,
          outlineFulfillment,
          speakerWhitelistReport,
        });
      } else {
        pipelineLog.warn(`[chapter-length-guard] ${recovery.reason}, novel=${novelId} chapter=${chapterNumber}`);
      }
    }

    const finalLengthEnforcement = enforceFinalChapterLengthLimit({
      text: polishedText,
      existing: chapterLengthGuard,
      skip: effectiveSkipLengthGuard,
      targetWordCount: maxWordCount,
    });
    if (finalLengthEnforcement.content !== polishedText) {
      const beforeChars = polishedText.length;
      polishedText = finalLengthEnforcement.content;
      traceStage('final.chapter-length-fallback', polishedText, {
        beforeChars,
        afterChars: polishedText.length,
      });
      if (worldContract && this.worldFeatures.gateMode !== 'off') {
        worldFulfillment = evaluateWorldContractFulfillment({
          contract: worldContract,
          chapterContent: polishedText,
          gateMode: this.worldFeatures.gateMode,
          knownWorldEntries: reusableWorldEntries,
          knownCharacterNames,
        });
      }
    }
    chapterLengthGuard = finalLengthEnforcement.audit;
    const finalLengthViolation = getFinalChapterLengthViolation({
      text: polishedText,
      targetWordCount: maxWordCount,
      skip: effectiveSkipLengthGuard,
    });
    if (finalLengthViolation) {
      throw new Error(`章节长度门禁保存前复检未通过：${finalLengthViolation}`);
    }
    const finalDirectionAnchorAudit = auditUserDirectionAnchors({
      direction: userDirection,
      content: polishedText,
      stage: 'final',
    });

    // === 作者有话说（可选，非阻塞） ===
    const AUTHOR_NOTE_INPUT_MAX = 2000;
    let authorNoteContent: string | undefined;
    if (cfg.authorNote?.enabled) {
      try {
        const authorNoteAgent = this.agents.get('author-note-writer');
        if (authorNoteAgent) {
          const truncated = polishedText.length > AUTHOR_NOTE_INPUT_MAX
            ? polishedText.slice(0, AUTHOR_NOTE_INPUT_MAX) + '…'
            : polishedText;

          // 尝试获取下章大纲作为预告素材
          let nextChapterHint = '';
          try {
            const NEXT_OUTLINE_MAX = 200;
            const nextOl = outline.chapters.find(
              (ch: { chapterNumber: number }) => ch.chapterNumber === chapterNumber + 1,
            );
            if (nextOl?.summary) {
              nextChapterHint = nextOl.summary.slice(0, NEXT_OUTLINE_MAX);
            }
          } catch (err) { pipelineLog.debug('获取下章大纲提示失败', { reason: err instanceof Error ? err.message : String(err) }); }

          // 章节重要性评分（用于调整作者有话说策略）
          let chapterKeyType: string | undefined;
          try {
            const { scoreChapterImportance } = await import('./key-chapter-scorer.js');
            const importance = scoreChapterImportance({
              tensionTarget: chapterOutline?.tensionTarget,
              keyEvents: chapterOutline?.keyEvents,
              readerScore: parseReaderScore(readerOutput.content),
              chapterNumber,
              totalChapters: outline.chapters?.length ?? chapterNumber,
            });
            if (importance.keyType !== 'normal') {
              chapterKeyType = importance.keyType;
            }
          } catch (err) { pipelineLog.debug('章节重要性评分失败', { reason: err instanceof Error ? err.message : String(err) }); }

          const noteCtx: AgentContext = {
            ...baseContext,
            inputText: truncated,
            outlineContext: nextChapterHint || undefined,
            chapterKeyType,
            userDirection: readerOutput.content
              ? `参考读者评价：${readerOutput.content.slice(0, 500)}`
              : undefined,
          };
          const noteOutput = await runAgent('author-note-writer', noteCtx);
          authorNoteContent = sanitizeAuthorNote(noteOutput.content);
        }
      } catch (err) { pipelineLog.debug('作者有话说生成失败', { reason: err instanceof Error ? err.message : String(err) }); }
    }

    // 后处理任务（审计 + 大纲修正 + 事实图谱），并行执行，失败不阻塞主流程
    const postChars = await this.getCharactersCached(novelId);
    // fire-and-forget：后处理（跨章审计/大纲修正/事实图谱）失败不阻塞主流程。
    // 三个子任务均为文件 I/O，DMP 等容器环境偶发磁盘卡顿会拖住整个章节生成，
    // 故改为不 await，避免后处理挂起导致 generateChapter 永不返回。
    runAllPostProcessing({
      novelId,
      chapterNumber,
      polishedText,
      characters: postChars,
      novelManager: this.novelManager,
      storyStateManager: this.storyStateManager,
    }).catch(err => {
      pipelineLog.warn('章节后处理失败（已降级，不阻塞主流程）', {
        reason: err instanceof Error ? err.message : String(err),
      });
    });

    if (this.qualityFeatures.enablePatternRotationCache) {
      patternRotationCache.recordChapter(novelId, polishedText);
    }

    if (this.qualityFeatures.enableAntiClicheDetection) {
      try {
        const { updateAndSavePatternDB, syncToGlobalDB } = await import('./pattern-freq-store.js');
        const { detectClichePatterns } = await import('./cliche-pattern-detector.js');
        const { extractPatterns } = await import('./pattern-frequency-extractor.js');
        const { learnFromEditorDiff } = await import('./cliche-diff-learner.js');

        const patterns = extractPatterns(polishedText);
        const patternDB = updateAndSavePatternDB(getNovelsDir(), novelId, chapterNumber, polishedText);
        const clicheReport = detectClichePatterns(polishedText, patternDB);
        if (clicheReport.findings.length > 0) {
          pipelineLog.info(`[anti-cliche] novel=${novelId} chapter=${chapterNumber} score=${clicheReport.score} findings=${clicheReport.findings.length}`, {
            topPatterns: clicheReport.topPatterns.slice(0, 5),
          });
        }

        try {
          syncToGlobalDB(getNovelsDir(), novelId, chapterNumber, patterns.expressiveNgrams, patterns.semanticClusters);
        } catch { /* 全局同步失败不阻塞 */ }

        if (chapterDraftText && chapterDraftText !== polishedText) {
          try {
            const diffResult = learnFromEditorDiff({
              novelId,
              novelsDir: getNovelsDir(),
              chapterNumber,
              draftText: chapterDraftText,
              polishedText,
            });
            if (diffResult.totalLearned > 0) {
              pipelineLog.info(`[anti-cliche] diff-learned novel=${novelId} chapter=${chapterNumber} learned=${diffResult.totalLearned} promoted=${diffResult.promotedPatterns.length}`);
            }
          } catch { /* diff学习失败不阻塞 */ }
        }
      } catch (err) {
        pipelineLog.debug('反套路化检测失败（已降级）', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const startupOpeningStrategy = pickStartupOpeningStrategyDigest(allOutputs);

    // 记录技能效果
    try {
      const tracker = new SkillEffectsTracker(getNovelsDir());
      await tracker.recordSkillEffect({
        novelId,
        chapterNumber,
        appliedSkills: resolvedSkills.selectedSkills.map(s => s.id),
        qualityAfter: {
          overall: qualityReport?.overallScore ?? 0,
          structure: qualityReport?.structureScore ?? 0,
          style: qualityReport?.styleScore ?? 0,
          emotion: qualityReport?.emotionScore ?? 0,
        },
        agentRole: 'writer',
      });
    } catch (err) {
      pipelineLog.warn('技能效果记录失败', { reason: err instanceof Error ? err.message : String(err) });
    }

    const auditReport = buildStructuredAuditReport({
      enabled: this.structuredAuditFeatures.enabled,
      readerContent: readerOutput.content,
      aiTraceReport,
      genre: novel.genre,
      pipelineLog,
    });

    const memoryContextAudit = buildMemoryContextAudit({
      retriever: useOrchestrator ? 'orchestrator' : 'legacy',
      previousChapterContext: prevChapterContext,
      chapterVectorContext: memoryContext,
      enhancedPreviousSummary: mergedPreviousSummary,
      worldVectorContext: memoryWorldCtx,
      characterVectorContext: memoryCharCtx,
      digestVectorContext: memoryAuditParts.digestCtx,
      arcVectorContext: memoryAuditParts.arcCtx,
      factVectorContext: memoryAuditParts.factCtx,
      threadVectorContext: memoryAuditParts.threadCtx,
      characterStateVectorContext: memoryAuditParts.characterStateCtx,
      storyStateContext,
      truthFilesContext,
      truthFilesPresent,
      truthFilesUsedInPrompt,
      truthFilesSections,
    });

    let smartGateReport: ChapterGenerationResult['smartGateReport'];
    const smartGateManager = new SmartGateManager();
    try {
      const previousChaptersForAudit = [];
      for (let i = 1; i < chapterNumber; i++) {
        try {
          const prevChapter = await this.novelManager.getChapter(novelId, i);
          if (prevChapter) {
            previousChaptersForAudit.push({ content: prevChapter.content, chapterNumber: i });
          }
        } catch {
          // 忽略获取失败的章节
        }
      }

      smartGateReport = await smartGateManager.auditChapter({
        novelId,
        content: polishedText,
        chapterNumber,
        outlineText: chapterOutline?.summary,
        previousChapters: previousChaptersForAudit,
        novelsDir: getNovelsDir(),
      });

      if (smartGateReport.totalFindings > 0) {
        const errorCount = smartGateReport.errorCount;
        const warnCount = smartGateReport.warnCount;
        pipelineLog.info(`[smart-gate] novel=${novelId} chapter=${chapterNumber} errors=${errorCount} warnings=${warnCount} ${smartGateReport.summary}`);
      }

      // 持久化门禁提示，供下一章 Writer 读取（fire-and-forget，不阻塞生成）
      try {
        saveSmartGateHints(novelId, getNovelsDir(), chapterNumber, smartGateReport).catch(err => {
          pipelineLog.debug('[smart-gate] 提示持久化失败', { reason: err instanceof Error ? err.message : String(err) });
        });
      } catch {
        // 静默失败，不影响生成
      }
    } catch (err) {
      pipelineLog.warn('[smart-gate] 智能门禁检查失败', { reason: err instanceof Error ? err.message : String(err) });
    }

    const result: ChapterGenerationResult = {
      chapterContent: polishedText,
      outline: outlineOutput.content,
      worldNotes: worldOutput.content,
      characterNotes: charOutput.content,
      draft: chapterDraftText,
      editedContent: finalEditedContent,
      readerFeedback: readerOutput.content,
      agentOutputs: allOutputs,
      scenePlan,
      scenes: generatedScenes,
      sceneMode,
      stylePreset: styleProfile.resolvedPreset,
      outlineContract,
      outlineFulfillment,
      outlineGateRewrite,
      qualityReport,
      qualityGateRewrite,
      chapterPromiseCard,
      chapterPromiseReport,
      chapterPromiseGateRewrite,
      commercialReport,
      commercialGateRewrite,
      startupOpeningStrategy,
      startupOpeningReport,
      startupOpeningGateRewrite,
      chapterLengthGuard,
      speakerWhitelistReport,
      powerRuleReport,
      settingDriftReport,
      continuityReport,
      aiTraceReport,
      worldContract,
      worldFulfillment,
      worldGateRewrite,
      authorNote: authorNoteContent,
      autoRevision: autoRevisionResult,
      auditReport,
      collaborationLog: collaborationLog.getEntries(),
      performanceReport: perfTracker.finish(),
      superLongDiagnostics,
      memoryContextAudit,
      userDirectionAnchorAudit: finalDirectionAnchorAudit,
      smartGateReport,
      suggestedTitle: editorSuggestedTitle,
    };

    // fire-and-forget: 收集并持久化质量度量数据
    try {
      const metrics = collectChapterMetrics(result, chapterNumber, aiTraceReport);
      const novelsDir = getNovelsDir();
      saveChapterMetrics(novelId, metrics, novelsDir).catch(err => {
        pipelineLog.warn('质量度量保存失败', { reason: err instanceof Error ? err.message : String(err) });
      });
    } catch (err) {
      pipelineLog.debug('质量度量收集失败', { reason: err instanceof Error ? err.message : String(err) });
    }

    // fire-and-forget: AI 痕迹自学习（从 Writer→Editor diff 中提取模式）
    try {
      learnFromChapterDiff({
        novelId,
        novelsDir: getNovelsDir(),
        chapterNumber,
        draft: chapterDraftText,
        polished: polishedText,
      }).catch(err => {
        pipelineLog.debug('AI 痕迹学习失败', { reason: err instanceof Error ? err.message : String(err) });
      });
    } catch (err) {
      pipelineLog.debug('AI 痕迹学习启动失败', { reason: err instanceof Error ? err.message : String(err) });
    }

    // fire-and-forget: 更新真相文件（确定性状态视图）
    if (storyStateResult && outline) {
      const latestSnapshot = storyStateResult.snapshots[storyStateResult.snapshots.length - 1];
      if (latestSnapshot && latestSnapshot.chapterNumber === chapterNumber) {
        updateTruthFiles({
          novelId,
          novelsDir: getNovelsDir(),
          chapterNumber,
          snapshot: latestSnapshot,
          characters,
          outline,
        }).catch(err => {
          pipelineLog.warn('truth files 更新失败', { reason: err instanceof Error ? err.message : String(err) });
        });
      }
    }
      traceStage('final.result', result.chapterContent ?? '');
      return result;
    } finally {
      restoreGateState();
      if (releaseGenerationLock) {
        await releaseGenerationLock();
      }
      releaseRunLock();
    }
  }

  // ==================== 委托方法（保持向后兼容） ====================

  /**
   * 推断章节类型（用于上下文智能裁剪）
   */
  inferChapterType(
    direction: string,
    outlineSummary?: string,
  ): 'action' | 'dialogue' | 'worldbuilding' | 'emotional' | 'transition' {
    return inferChapterTypeFn(direction, outlineSummary);
  }

  /**
   * 根据 Agent 角色和是否重试返回自适应温度
   */
  getAdaptiveTemperature(role: AgentRole, isRetry: boolean): number {
    return getAdaptiveTemperature(role, isRetry);
  }

  static parseEditorOutput(raw: string): { polishedText: string; editorNotes: string; statusUpdate: string; suggestedTitle: string } {
    return parseEditorOutput(raw);
  }

  /**
   * 从 description 中提取触发条件（匹配"当…时"/"若…则"/"如果…就"模式）
   */
  private static normalizeName(name: string): string {
    return normalizeName(name);
  }

  private static collectOnStageCharacterIds(params: {
    chapterOutline?: ChapterOutline;
    outlineText: string;
    characters: CharacterProfile[];
  }): Set<string> {
    const ids = new Set<string>();
    for (const beat of params.chapterOutline?.beats ?? []) {
      for (const id of beat.characters ?? []) {
        if (id) ids.add(id);
      }
    }

    const nameToId = new Map<string, string>();
    for (const character of params.characters) {
      nameToId.set(ChapterPipeline.normalizeName(character.name), character.id);
      for (const alias of character.aliases ?? []) {
        nameToId.set(ChapterPipeline.normalizeName(alias), character.id);
      }
    }

    const addByName = (raw: string): void => {
      const normalized = ChapterPipeline.normalizeName(raw.replace(/[“”"'\(\)（）#]/g, '').trim());
      if (!normalized) return;
      const id = nameToId.get(normalized);
      if (id) ids.add(id);
    };

    const lineRe = /(?:^|\n)\s*(?:出场角色|主要角色|在场角色|角色名单)\s*[：:]\s*([^\n]{1,120})/g;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRe.exec(params.outlineText)) !== null) {
      const rawList = lineMatch[1] ?? '';
      for (const item of rawList.split(/[、，,\s/和与及]+/).map(v => v.trim()).filter(Boolean)) {
        addByName(item);
      }
    }

    const markerRe = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09:\n]+?)\s*[\)\uFF09]/g;
    let markerMatch: RegExpExecArray | null;
    while ((markerMatch = markerRe.exec(params.outlineText)) !== null) {
      addByName(markerMatch[1] ?? '');
    }

    return ids;
  }

  /**
   * 从分支树中提取当前章节及后续相关的活跃分支方向，
   * 构建一段简明指令注入到 userDirection，让 Outline/Writer Agent 遵循分支走向。
   */
  private async buildPlotBranchDirective(novelId: string, chapterNumber: number): Promise<string> {
    try {
      if (!this.novelManager.getPlotBranchTree) return '';
      const tree = await this.novelManager.getPlotBranchTree(novelId);
      if (!tree || tree.nodes.length === 0 || tree.activePath.length === 0) return '';

      const nodeMap = new Map(tree.nodes.map(n => [n.id, n]));
      // 沿活跃路径收集与本章及后续相关的已选/已探索节点
      const relevantNodes = tree.activePath
        .map(id => nodeMap.get(id))
        .filter((n): n is NonNullable<typeof n> => n != null)
        .filter(n => n.chapterNumber >= chapterNumber && (n.status === 'selected' || n.status === 'explored'));

      if (relevantNodes.length === 0) return '';

      const lines: string[] = ['## 剧情分支方向（用户已选定，必须遵循）'];
      for (const node of relevantNodes) {
        lines.push(`### 第${node.chapterNumber}章 · ${node.title}`);
        if (node.description) lines.push(node.description);
        if (node.impactPrediction) lines.push(`影响预测：${node.impactPrediction}`);
        if (node.characterImpacts.length > 0) {
          lines.push(`角色影响：${node.characterImpacts.map(ci => `${ci.name}：${ci.impact}`).join('；')}`);
        }
        lines.push('');
      }
      return lines.join('\n');
    } catch {
      return '';
    }
  }
}
