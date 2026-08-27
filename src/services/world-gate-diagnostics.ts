import type { Chapter } from '../novel/types.js';
import type { ChapterGenerationResult } from '../pipeline/types.js';

export function buildWorldGateDigest(
  result: ChapterGenerationResult,
  checkedAt: string,
): NonNullable<Chapter['diagnostics']>['worldGate'] | undefined {
  const report = result.worldFulfillment;
  if (!report) return undefined;

  return {
    gateMode: report.gateMode,
    requiredTotal: report.requiredTotal,
    requiredHit: report.requiredHit,
    missingRequired: report.missingRequired,
    unsourcedTerms: report.unsourcedTerms,
    hasViolations: report.findings.length > 0,
    passed: report.passed,
    summary: report.summary,
    findings: report.findings.map(finding => ({
      code: finding.code,
      level: finding.level,
      message: finding.message,
      entryName: finding.entryName,
      term: finding.term,
    })),
    repairAttempted: result.worldGateRewrite?.attempted ?? false,
    repairApplied: result.worldGateRewrite?.applied ?? false,
    checkedAt,
  };
}
