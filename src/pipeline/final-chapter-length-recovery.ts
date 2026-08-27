import {
  buildChapterUnderLengthGuardFeedback,
  resolveLengthGuardMax,
  resolveLengthGuardMin,
  trimChapterToSentenceBoundary,
} from './chapter-length-guard.js';

export type FinalChapterLengthRecoveryReport = {
  attempted: boolean;
  applied: boolean;
  targetWordCount: number;
  allowedMin: number;
  allowedMax: number;
  beforeChars: number;
  afterChars: number;
  reason: string;
};

export type FinalChapterLengthRecoveryResult = {
  content: string;
  report?: FinalChapterLengthRecoveryReport;
};

export function getFinalChapterLengthViolation(params: {
  text: string;
  targetWordCount?: number;
  skip?: boolean;
}): string | undefined {
  const target = params.targetWordCount;
  if (params.skip || !target || target <= 0) return undefined;

  const actual = params.text.trim().length;
  const allowedMin = resolveLengthGuardMin(target);
  const allowedMax = resolveLengthGuardMax(target);
  if (actual < allowedMin) {
    return `final chapter length ${actual} is below allowed min ${allowedMin} for target ${target}`;
  }
  if (actual > allowedMax) {
    return `final chapter length ${actual} exceeds allowed max ${allowedMax} for target ${target}`;
  }
  return undefined;
}

export async function recoverFinalUnderLengthChapter(params: {
  text: string;
  targetWordCount?: number;
  skip?: boolean;
  expand: (feedback: string) => Promise<string>;
  sanitize?: (text: string) => string;
  validateCandidate?: (candidate: string) => { passed: boolean; reason?: string };
}): Promise<FinalChapterLengthRecoveryResult> {
  const source = params.text.trim();
  const target = params.targetWordCount;
  if (params.skip || !target || target <= 0) return { content: source };

  const allowedMin = resolveLengthGuardMin(target);
  const allowedMax = resolveLengthGuardMax(target);
  if (source.length >= allowedMin) return { content: source };

  const baseReport = {
    attempted: true,
    applied: false,
    targetWordCount: target,
    allowedMin,
    allowedMax,
    beforeChars: source.length,
  };

  try {
    const feedback = buildChapterUnderLengthGuardFeedback({
      targetWordCount: target,
      actualWordCount: source.length,
    });
    const expanded = await params.expand(feedback);
    const sanitized = (params.sanitize ? params.sanitize(expanded) : expanded).trim();
    const candidate = trimChapterToSentenceBoundary(sanitized, target);

    if (candidate.length < allowedMin) {
      return {
        content: source,
        report: {
          ...baseReport,
          afterChars: candidate.length,
          reason: `expanded candidate remains below allowed min ${allowedMin}`,
        },
      };
    }
    if (candidate.length > allowedMax) {
      return {
        content: source,
        report: {
          ...baseReport,
          afterChars: candidate.length,
          reason: `expanded candidate exceeds allowed max ${allowedMax}`,
        },
      };
    }

    const validation = params.validateCandidate?.(candidate);
    if (validation && !validation.passed) {
      return {
        content: source,
        report: {
          ...baseReport,
          afterChars: candidate.length,
          reason: validation.reason || 'expanded candidate failed regression validation',
        },
      };
    }

    return {
      content: candidate,
      report: {
        ...baseReport,
        applied: true,
        afterChars: candidate.length,
        reason: 'final under-length recovery applied',
      },
    };
  } catch (error) {
    return {
      content: source,
      report: {
        ...baseReport,
        afterChars: source.length,
        reason: `final under-length recovery failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
