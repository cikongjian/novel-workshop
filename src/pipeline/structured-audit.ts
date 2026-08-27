import type { AuditReport } from './audit-dimension-types.js';
import { parseStructuredReaderOutput } from './audit-report-builder.js';
import { buildAuditReport, dimensionResultFromAiTrace } from './audit-dimensions.js';
import { parseReaderScore } from './context-builders.js';

export interface StructuredAuditOptions {
  enabled: boolean;
  readerContent: string;
  aiTraceReport?: unknown;
  genre: string;
  pipelineLog: { debug: (msg: string, meta?: Record<string, unknown>) => void };
}

export function buildStructuredAuditReport(
  options: StructuredAuditOptions,
): AuditReport | undefined {
  const { enabled, readerContent, aiTraceReport, genre, pipelineLog } = options;

  if (!enabled) return undefined;

  try {
    const dimensionResults = parseStructuredReaderOutput(readerContent);
    if (!dimensionResults) return undefined;

    if (aiTraceReport) {
      const aiTraceDim = dimensionResultFromAiTrace(aiTraceReport as never);
      if (!dimensionResults.find(d => d.dimensionId === 'ai_trace_score')) {
        dimensionResults.push(aiTraceDim);
      }
    }

    const readerScore = parseReaderScore(readerContent);
    return buildAuditReport(dimensionResults, genre, readerScore);
  } catch (err) {
    pipelineLog.debug('审计报告构建失败，降级为传统模式', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
