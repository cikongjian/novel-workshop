import type { AgentOutput, AgentRole, AgentContext } from '../agents/types.js';
import type { WorldEntry } from '../novel/types.js';
import type {
  ChapterGenerationResult,
} from './types.js';
import {
  evaluateWorldContractFulfillment,
  type WorldContract,
  type WorldContractFulfillment,
} from './world-contract.js';
import {
  evaluateOutlineContractFulfillment,
  type OutlineContract,
  type OutlineContractFulfillment,
} from './outline-gate.js';
import {
  evaluateChapterQualityGate,
} from './chapter-quality-gate.js';
import {
  buildQualityGateFixHints,
  type QualityGateReport,
} from './quality-gate.js';
import {
  buildWorldGateFixHints,
  buildOutlineGateFixHints,
  shouldAttemptWorldGateFix,
} from './gate-orchestrator.js';
import { parseEditorOutput } from './editor-output-parser.js';
import { logGateFindings, type GateLogger } from './gate-policy.js';
import type { ChapterEnhancementThresholds, StylePreset } from './chapter-enhancement.js';
import type { QualityFeatureOptions, WorldFeatureOptions, OutlineFeatureOptions } from './pipeline-constants.js';

export interface GateExecutorOptions {
  novelId: string;
  chapterNumber: number;
  worldContract?: WorldContract;
  outlineContract: OutlineContract;
  scenePlan?: string;
  stylePreset: StylePreset;
  genre: string;
  knownCharacterNames: string[];
  knownWorldEntries: WorldEntry[];
  domainStructureKeywords: string[];
  enableGenreAdaptiveThresholds: boolean;
  enableAiTellClusterGate: boolean;
  antiAiStructure: ChapterEnhancementThresholds['antiAiStructure'];
  qualityFeatures: Required<QualityFeatureOptions>;
  worldFeatures: Required<WorldFeatureOptions>;
  outlineFeatures: Required<OutlineFeatureOptions>;
  skipStrictGate?: boolean;
  editorContext: AgentContext;
  runAgent: (role: AgentRole, ctx: AgentContext) => Promise<AgentOutput>;
  traceStage: (stage: string, text: string) => void;
  worldGateLog: GateLogger;
  outlineGateLog: GateLogger;
  qualityGateLog: GateLogger;
}

export interface GateExecutorResult {
  worldFulfillment?: WorldContractFulfillment;
  worldGateRewrite?: ChapterGenerationResult['worldGateRewrite'];
  outlineFulfillment?: OutlineContractFulfillment;
  outlineGateRewrite?: ChapterGenerationResult['outlineGateRewrite'];
  qualityReport?: QualityGateReport;
  qualityGateRewrite?: ChapterGenerationResult['qualityGateRewrite'];
  polishedText: string;
  finalEditedContent: string;
}

export class GateExecutor {
  private options: GateExecutorOptions;

  constructor(options: GateExecutorOptions) {
    this.options = options;
  }

  async runCoreGates(
    polishedText: string,
    finalEditedContent: string,
  ): Promise<GateExecutorResult> {
    let currentPolishedText = polishedText;
    let currentFinalEditedContent = finalEditedContent;

    const result: GateExecutorResult = {
      polishedText: currentPolishedText,
      finalEditedContent: currentFinalEditedContent,
    };

    const worldResult = await this.runWorldGate(currentPolishedText, currentFinalEditedContent);
    if (worldResult) {
      result.worldFulfillment = worldResult.fulfillment;
      result.worldGateRewrite = worldResult.rewrite;
      if (worldResult.polishedText) {
        currentPolishedText = worldResult.polishedText;
        if (worldResult.finalEditedContent) {
          currentFinalEditedContent = worldResult.finalEditedContent;
        }
      }
    }

    const outlineResult = await this.runOutlineGate(currentPolishedText, currentFinalEditedContent);
    if (outlineResult) {
      result.outlineFulfillment = outlineResult.fulfillment;
      result.outlineGateRewrite = outlineResult.rewrite;
      if (outlineResult.polishedText) {
        currentPolishedText = outlineResult.polishedText;
        if (outlineResult.finalEditedContent) {
          currentFinalEditedContent = outlineResult.finalEditedContent;
        }
      }
    }

    const qualityResult = await this.runQualityGate(currentPolishedText, currentFinalEditedContent);
    if (qualityResult) {
      result.qualityReport = qualityResult.report;
      result.qualityGateRewrite = qualityResult.rewrite;
      if (qualityResult.polishedText) {
        currentPolishedText = qualityResult.polishedText;
        if (qualityResult.finalEditedContent) {
          currentFinalEditedContent = qualityResult.finalEditedContent;
        }
      }
    }

    result.polishedText = currentPolishedText;
    result.finalEditedContent = currentFinalEditedContent;

    return result;
  }

  private async runWorldGate(
    polishedText: string,
    finalEditedContent: string,
  ): Promise<{
    fulfillment: WorldContractFulfillment;
    rewrite?: ChapterGenerationResult['worldGateRewrite'];
    polishedText?: string;
    finalEditedContent?: string;
  } | null> {
    const { worldContract, worldFeatures, novelId, chapterNumber, knownWorldEntries, knownCharacterNames, skipStrictGate, editorContext, runAgent, traceStage, worldGateLog } = this.options;

    if (!worldContract || worldFeatures.gateMode === 'off') {
      return null;
    }

    let fulfillment = evaluateWorldContractFulfillment({
      contract: worldContract,
      chapterContent: polishedText,
      gateMode: worldFeatures.gateMode,
      knownWorldEntries,
      knownCharacterNames,
    });

    let rewrite: ChapterGenerationResult['worldGateRewrite'];
    let currentPolishedText = polishedText;
    let currentFinalEditedContent = finalEditedContent;

    const shouldAttemptFix = shouldAttemptWorldGateFix({
      fulfillment,
      contract: worldContract,
      gateMode: worldFeatures.gateMode,
      skipStrictGate: Boolean(skipStrictGate),
    });
    if (shouldAttemptFix) {
      const fixHints = buildWorldGateFixHints(fulfillment, worldContract);
      const strictFixEditorContext: AgentContext = {
        ...editorContext,
        inputText: currentPolishedText,
        worldGateFixHints: fixHints,
      };
      const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
      const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
      if (strictFixParsed.polishedText) {
        currentPolishedText = strictFixParsed.polishedText;
        currentFinalEditedContent = strictFixEditorOutput.content;
        traceStage('world-gate.rewrite', currentPolishedText);
      }

      const repairedFulfillment = evaluateWorldContractFulfillment({
        contract: worldContract,
        chapterContent: currentPolishedText,
        gateMode: worldFeatures.gateMode,
        knownWorldEntries,
        knownCharacterNames,
      });

      rewrite = {
        attempted: true,
        applied: repairedFulfillment.findings.length < fulfillment.findings.length
          || repairedFulfillment.requiredHit > fulfillment.requiredHit
          || repairedFulfillment.unsourcedTerms.length < fulfillment.unsourcedTerms.length,
        reason: fixHints,
        before: fulfillment,
        after: repairedFulfillment,
      };
      fulfillment = repairedFulfillment;
    }

    if (worldFeatures.gateMode === 'strict' && !fulfillment.passed && !skipStrictGate) {
      if (!fulfillment.passed && !worldFeatures.strictFallbackToWarn) {
        throw new Error(`世界观门禁未通过（strict）：${fulfillment.summary}`);
      }

      if (!fulfillment.passed && worldFeatures.strictFallbackToWarn) {
        worldGateLog.warn(
          `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${fulfillment.summary}`,
        );
      }
    }

    logGateFindings({
      report: fulfillment,
      mode: worldFeatures.gateMode,
      strictFallbackToWarn: worldFeatures.strictFallbackToWarn,
      logger: worldGateLog,
      novelId,
      chapterNumber,
    });

    return {
      fulfillment,
      rewrite,
      polishedText: currentPolishedText !== polishedText ? currentPolishedText : undefined,
      finalEditedContent: currentFinalEditedContent !== finalEditedContent ? currentFinalEditedContent : undefined,
    };
  }

  private async runOutlineGate(
    polishedText: string,
    finalEditedContent: string,
  ): Promise<{
    fulfillment: OutlineContractFulfillment;
    rewrite?: ChapterGenerationResult['outlineGateRewrite'];
    polishedText?: string;
    finalEditedContent?: string;
  } | null> {
    const { outlineContract, outlineFeatures, novelId, chapterNumber, skipStrictGate, editorContext, runAgent, traceStage, outlineGateLog } = this.options;

    if (outlineContract.required.length === 0 || outlineFeatures.gateMode === 'off') {
      return null;
    }

    let fulfillment = evaluateOutlineContractFulfillment({
      contract: outlineContract,
      chapterContent: polishedText,
      gateMode: outlineFeatures.gateMode,
    });

    let rewrite: ChapterGenerationResult['outlineGateRewrite'];
    let currentPolishedText = polishedText;
    let currentFinalEditedContent = finalEditedContent;

    if (outlineFeatures.gateMode === 'strict' && !fulfillment.passed && !skipStrictGate) {
      const shouldAttemptFix = fulfillment.requiredHit < fulfillment.requiredTotal - 1;
      if (shouldAttemptFix) {
        const fixHints = buildOutlineGateFixHints(fulfillment, outlineContract);
        const strictFixEditorContext: AgentContext = {
          ...editorContext,
          inputText: currentPolishedText,
          outlineGateFixHints: fixHints,
        };
        const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
        const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
        if (strictFixParsed.polishedText) {
          currentPolishedText = strictFixParsed.polishedText;
          currentFinalEditedContent = strictFixEditorOutput.content;
          traceStage('outline-gate.rewrite', currentPolishedText);
        }

        const repairedFulfillment = evaluateOutlineContractFulfillment({
          contract: outlineContract,
          chapterContent: currentPolishedText,
          gateMode: outlineFeatures.gateMode,
        });

        rewrite = {
          attempted: true,
          applied: repairedFulfillment.passed
            || repairedFulfillment.requiredHit > fulfillment.requiredHit
            || repairedFulfillment.missingRequired.length < fulfillment.missingRequired.length,
          reason: fixHints,
          before: fulfillment,
          after: repairedFulfillment,
        };
        fulfillment = repairedFulfillment;
      }

      if (!fulfillment.passed && !outlineFeatures.strictFallbackToWarn) {
        throw new Error(`大纲门禁未通过（strict）：${fulfillment.summary}`);
      }

      if (!fulfillment.passed && outlineFeatures.strictFallbackToWarn) {
        outlineGateLog.warn(
          `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${fulfillment.summary}`,
        );
      }
    }

    logGateFindings({
      report: fulfillment,
      mode: outlineFeatures.gateMode,
      strictFallbackToWarn: outlineFeatures.strictFallbackToWarn,
      logger: outlineGateLog,
      novelId,
      chapterNumber,
    });

    return {
      fulfillment,
      rewrite,
      polishedText: currentPolishedText !== polishedText ? currentPolishedText : undefined,
      finalEditedContent: currentFinalEditedContent !== finalEditedContent ? currentFinalEditedContent : undefined,
    };
  }

  private async runQualityGate(
    polishedText: string,
    finalEditedContent: string,
  ): Promise<{
    report: QualityGateReport;
    rewrite?: ChapterGenerationResult['qualityGateRewrite'];
    polishedText?: string;
    finalEditedContent?: string;
  } | null> {
    const { qualityFeatures, novelId, chapterNumber, scenePlan, stylePreset, antiAiStructure, genre, enableGenreAdaptiveThresholds, enableAiTellClusterGate, domainStructureKeywords, skipStrictGate, editorContext, runAgent, traceStage, qualityGateLog, worldContract, outlineContract } = this.options;

    if (qualityFeatures.gateMode === 'off') {
      return null;
    }

    let report = evaluateChapterQualityGate({
      chapterContent: polishedText,
      scenePlan,
      stylePreset,
      antiAiStructure,
      gateMode: qualityFeatures.gateMode,
      thresholds: qualityFeatures,
      genre,
      enableGenreAdaptiveThresholds,
      enableAiTellClusterGate,
      domainStructureKeywords,
    });

    let rewrite: ChapterGenerationResult['qualityGateRewrite'];
    let currentPolishedText = polishedText;
    let currentFinalEditedContent = finalEditedContent;

    if (qualityFeatures.gateMode === 'strict' && !report.passed && !skipStrictGate) {
      const scoreGap = qualityFeatures.passScore - (report.overallScore ?? 0);
      const shouldAttemptFix = scoreGap < 10 && report.findings.length <= 3;
      if (shouldAttemptFix) {
        const fixHints = buildQualityGateFixHints(report, stylePreset, scenePlan);
        const strictFixEditorContext: AgentContext = {
          ...editorContext,
          inputText: currentPolishedText,
          outlineContract: outlineContract.prompt || undefined,
          worldContract: worldContract?.prompt,
          qualityGateFixHints: fixHints,
        };
        const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
        const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
        if (strictFixParsed.polishedText) {
          currentPolishedText = strictFixParsed.polishedText;
          currentFinalEditedContent = strictFixEditorOutput.content;
          traceStage('quality-gate.rewrite', currentPolishedText);
        }

        const repairedReport = evaluateChapterQualityGate({
          chapterContent: currentPolishedText,
          scenePlan,
          stylePreset,
          antiAiStructure,
          gateMode: qualityFeatures.gateMode,
          thresholds: qualityFeatures,
          genre,
          enableGenreAdaptiveThresholds,
          enableAiTellClusterGate,
          domainStructureKeywords,
        });

        rewrite = {
          attempted: true,
          applied: repairedReport.passed
            || (repairedReport.overallScore ?? 0) > (report.overallScore ?? 0)
            || repairedReport.findings.length < report.findings.length,
          reason: fixHints,
          before: report,
          after: repairedReport,
        };
        report = repairedReport;
      }

      if (!report.passed && !qualityFeatures.strictFallbackToWarn) {
        throw new Error(`章节质量门禁未通过（strict）：${report.summary}`);
      }

      if (!report.passed && qualityFeatures.strictFallbackToWarn) {
        qualityGateLog.warn(
          `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${report.summary}`,
        );
      }
    }

    logGateFindings({
      report,
      mode: qualityFeatures.gateMode,
      strictFallbackToWarn: qualityFeatures.strictFallbackToWarn,
      logger: qualityGateLog,
      novelId,
      chapterNumber,
    });

    return {
      report,
      rewrite,
      polishedText: currentPolishedText !== polishedText ? currentPolishedText : undefined,
      finalEditedContent: currentFinalEditedContent !== finalEditedContent ? currentFinalEditedContent : undefined,
    };
  }
}
