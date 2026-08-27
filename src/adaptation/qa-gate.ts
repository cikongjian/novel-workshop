import { now } from '../utils/text.js';
import type { AdaptationPackage } from '../novel/types.js';

export type AdaptationQAIssueSeverity = 'error' | 'warn' | 'info';

export type AdaptationQAIssue = {
  code: string;
  severity: AdaptationQAIssueSeverity;
  message: string;
};

export type AdaptationQAReport = {
  packageId: string;
  mode: AdaptationPackage['mode'];
  score: number;
  passed: boolean;
  issues: AdaptationQAIssue[];
  metrics: {
    chapterCount: number;
    sceneCoverage: number;
    missingSceneCardChapters: number[];
    hasPayloadPath: boolean;
    chapterRangeValid: boolean;
  };
  checkedAt: string;
};

export type EvaluateAdaptationQAInput = {
  pack: AdaptationPackage;
  sceneCardCountByChapter: Record<number, number>;
};

export class AdaptationQAGate {
  evaluate(input: EvaluateAdaptationQAInput): AdaptationQAReport {
    const { pack, sceneCardCountByChapter } = input;
    const issues: AdaptationQAIssue[] = [];
    let score = 100;

    const chapterNumbers = buildChapterRange(pack.chapterNumberStart, pack.chapterNumberEnd);
    const missingSceneCardChapters = chapterNumbers.filter((num) => (sceneCardCountByChapter[num] ?? 0) <= 0);
    const sceneCoverage = chapterNumbers.length === 0
      ? 0
      : (chapterNumbers.length - missingSceneCardChapters.length) / chapterNumbers.length;

    const hasPayloadPath = pack.payloadPath.trim().length > 0;
    if (!hasPayloadPath) {
      issues.push({
        code: 'PAYLOAD_PATH_EMPTY',
        severity: 'error',
        message: 'payloadPath 为空，无法交付改编产物',
      });
      score -= 40;
    }

    const chapterRangeValid = pack.chapterNumberEnd >= pack.chapterNumberStart;
    if (!chapterRangeValid) {
      issues.push({
        code: 'INVALID_CHAPTER_RANGE',
        severity: 'error',
        message: '章节范围不合法：chapterNumberEnd 小于 chapterNumberStart',
      });
      score -= 40;
    }

    if (missingSceneCardChapters.length > 0) {
      issues.push({
        code: 'SCENE_CARD_MISSING',
        severity: 'error',
        message: `存在未重建场景卡的章节：${missingSceneCardChapters.join(', ')}`,
      });
      score -= Math.min(40, missingSceneCardChapters.length * 10);
    }

    if (pack.mode === 'audio' && sceneCoverage < 1) {
      issues.push({
        code: 'AUDIO_SCENE_COVERAGE_LOW',
        severity: 'warn',
        message: '有声模式建议场景卡覆盖率达到 100%',
      });
      score -= 8;
    }

    if (pack.mode !== 'audio' && sceneCoverage < 0.8) {
      issues.push({
        code: 'VISUAL_SCENE_COVERAGE_LOW',
        severity: 'warn',
        message: '漫画/短剧模式建议场景卡覆盖率至少 80%',
      });
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));
    const hasError = issues.some((issue) => issue.severity === 'error');
    const passed = !hasError && score >= 70;

    return {
      packageId: pack.id,
      mode: pack.mode,
      score,
      passed,
      issues,
      metrics: {
        chapterCount: chapterNumbers.length,
        sceneCoverage: Number(sceneCoverage.toFixed(4)),
        missingSceneCardChapters,
        hasPayloadPath,
        chapterRangeValid,
      },
      checkedAt: now(),
    };
  }
}

function buildChapterRange(start: number, end: number): number[] {
  if (end < start) return [];
  const numbers: number[] = [];
  for (let n = start; n <= end; n++) {
    numbers.push(n);
  }
  return numbers;
}
