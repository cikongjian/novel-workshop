export type GateLogger = {
  warn(message: string): void;
  error(message: string): void;
};

export type GateReportLike = {
  passed: boolean;
  summary: string;
  findings: unknown[];
};

export function logGateFindings(params: {
  report: GateReportLike;
  mode: 'off' | 'warn' | 'strict';
  strictFallbackToWarn: boolean;
  logger: GateLogger;
  novelId: string;
  chapterNumber: number;
}): void {
  const { report, mode, strictFallbackToWarn, logger, novelId, chapterNumber } = params;
  if (report.findings.length === 0) return;
  const logLine = `novel=${novelId} chapter=${chapterNumber} mode=${mode} ${report.summary}`;
  if (mode === 'strict' && !report.passed && !strictFallbackToWarn) {
    logger.error(logLine);
  } else {
    logger.warn(logLine);
  }
}
