import type { AgentContext, AgentOutput } from '../agents/types.js';
import { logGateFindings, type GateLogger } from './gate-policy.js';
import { parseEditorOutput } from './editor-output-parser.js';

export interface GateRunnerOptions {
  gateMode: 'off' | 'warn' | 'strict';
  strictFallbackToWarn: boolean;
  logger: GateLogger;
  novelId: string;
  chapterNumber: number;
  editorContext: AgentContext;
  runAgent: (role: string, ctx: AgentContext) => Promise<AgentOutput>;
  skipStrictGate?: boolean;
}

export interface GateResult<T> {
  passed: boolean;
  report: T;
  rewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: T;
    after: T;
  };
}

export interface GateEvaluator<T> {
  (): T;
}

export interface GateFixHintBuilder<T> {
  (report: T): string;
}

export async function runGate<T extends { passed: boolean; overallScore?: number; findings: unknown[]; summary?: string }>(
  evaluator: GateEvaluator<T>,
  fixHintBuilder: GateFixHintBuilder<T>,
  options: GateRunnerOptions,
  contentRef: { value: string },
): Promise<GateResult<T>> {
  const {
    gateMode,
    strictFallbackToWarn,
    logger,
    novelId,
    chapterNumber,
    editorContext,
    runAgent,
    skipStrictGate = false,
  } = options;

  if (gateMode === 'off') {
    const report = evaluator();
    return { passed: true, report };
  }

  let report = evaluator();

  if (gateMode === 'strict' && !report.passed && !skipStrictGate) {
    const scoreGap = 80 - (report.overallScore ?? 0);
    const shouldAttemptFix = scoreGap < 10 && report.findings.length <= 3;
    let rewrite: GateResult<T>['rewrite'];

    if (shouldAttemptFix) {
      const fixHints = fixHintBuilder(report);
      const strictFixEditorContext: AgentContext = {
        ...editorContext,
        inputText: contentRef.value,
        qualityGateFixHints: fixHints,
      };
      const strictFixEditorOutput = await runAgent('editor', strictFixEditorContext);
      const strictFixParsed = parseEditorOutput(strictFixEditorOutput.content);
      if (strictFixParsed.polishedText) {
        contentRef.value = strictFixParsed.polishedText;
      }

      const repairedReport = evaluator();

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

    if (!report.passed && !strictFallbackToWarn) {
      throw new Error(`门禁未通过（strict）：${report.summary}`);
    }

    if (!report.passed && strictFallbackToWarn) {
      logger.warn(
        `strict failed but downgraded to warn, novel=${novelId} chapter=${chapterNumber} ${report.summary}`,
      );
    }

    return { passed: report.passed, report, rewrite };
  }

  logGateFindings({
    report: {
      passed: report.passed,
      summary: report.summary ?? '',
      findings: report.findings,
    },
    mode: gateMode,
    strictFallbackToWarn,
    logger,
    novelId,
    chapterNumber,
  });

  return { passed: report.passed, report };
}
