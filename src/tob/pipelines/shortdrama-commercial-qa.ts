type ShortDramaScene = {
  sceneNo: number;
  chapterNumber: number;
  title: string;
  durationSec: number;
  hook3s: string;
  conflict15s: string;
  twist45s: string;
  cta: string;
  cast: string[];
  location: string;
  cameraPlan: string[];
  dialogueLines: string[];
};

export type ShortDramaQualityProfile = 'balanced' | 'hook-first';
export type ShortDramaPaidTier = 'premium' | 'standard' | 'test-only';

export type ShortDramaClipScore = {
  sceneNo: number;
  chapterNumber: number;
  title: string;
  score: number;
  hookScore: number;
  conflictScore: number;
  visualScore: number;
  dialogueScore: number;
  retentionScore: number;
  reasons: string[];
  hook3s: string;
  conflict15s: string;
  twist45s: string;
  cta: string;
};

export type ShortDramaCommercialQAReport = {
  overallScore: number;
  verdict: 'ready-for-paid' | 'needs-polish' | 'not-ready';
  paidTier: ShortDramaPaidTier;
  qualityProfile: ShortDramaQualityProfile;
  sceneCount: number;
  chapterCount: number;
  dimensions: {
    averageSceneScore: number;
    coverageScore: number;
    consistencyScore: number;
    hookStrengthScore: number;
    candidateDiversityScore: number;
  };
  strengths: string[];
  risks: string[];
  clipCandidates: ShortDramaClipScore[];
  checkedAt: string;
};

const CONFLICT_KEYWORDS = [
  'betray',
  'threat',
  'chase',
  'fight',
  'secret',
  'escape',
  'deadline',
  'danger',
  'crisis',
  'truth',
  'blackmail',
  'revenge',
  'kill',
  '冲突',
  '反转',
  '危机',
  '秘密',
  '背叛',
  '追杀',
  '真相',
  '失控',
  '倒计时',
  '威胁',
  '生死',
  '复仇',
];

const RETENTION_KEYWORDS = [
  'next',
  'continue',
  'reveal',
  'truth',
  'who',
  'why',
  'how',
  'tonight',
  'tomorrow',
  'wait',
  'again',
  'watch',
  '下一场',
  '继续追更',
  '马上追更',
  '真相',
  '到底',
  '谁',
  '为什么',
  '今晚',
  '明天',
  '揭晓',
  '未完待续',
];

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asText(item)).filter(Boolean);
}

function parseScenes(payload: unknown): ShortDramaScene[] {
  if (!payload || typeof payload !== 'object') return [];
  const scenesRaw = (payload as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenesRaw)) return [];

  return scenesRaw.map((sceneRaw) => {
    const scene = sceneRaw as Record<string, unknown>;
    return {
      sceneNo: asNumber(scene.sceneNo),
      chapterNumber: asNumber(scene.chapterNumber),
      title: asText(scene.title),
      durationSec: asNumber(scene.durationSec),
      hook3s: asText(scene.hook3s),
      conflict15s: asText(scene.conflict15s),
      twist45s: asText(scene.twist45s),
      cta: asText(scene.cta),
      cast: asStringArray(scene.cast),
      location: asText(scene.location),
      cameraPlan: asStringArray(scene.cameraPlan),
      dialogueLines: asStringArray(scene.dialogueLines),
    };
  }).filter((scene) => scene.sceneNo > 0);
}

function textQualityScore(text: string, minLen: number, maxLen: number): number {
  if (!text) return 0;
  const len = text.length;
  if (len < minLen) return 4;
  if (len > maxLen) return 6;
  return 10;
}

function keywordScore(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  const hitCount = keywords.reduce((count, keyword) => (
    normalized.includes(keyword) ? count + 1 : count
  ), 0);
  return Math.min(10, hitCount * 2 + (hitCount > 0 ? 2 : 0));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
}

function fingerprintScene(scene: ShortDramaClipScore): string {
  const hook = normalizeText(scene.hook3s).slice(0, 24);
  const conflict = normalizeText(scene.conflict15s).slice(0, 24);
  return `${hook}|${conflict}`;
}

function scoreScene(scene: ShortDramaScene): ShortDramaClipScore {
  const hookScore = textQualityScore(scene.hook3s, 8, 28) + keywordScore(scene.hook3s, CONFLICT_KEYWORDS);
  const conflictCore = `${scene.conflict15s} ${scene.twist45s}`.trim();
  const conflictScore = textQualityScore(conflictCore, 16, 56) + keywordScore(conflictCore, CONFLICT_KEYWORDS);

  const cameraScore = scene.cameraPlan.length >= 3 ? 10 : scene.cameraPlan.length * 3;
  const locationScore = scene.location ? 6 : 2;
  const castScore = scene.cast.length >= 2 ? 4 : scene.cast.length >= 1 ? 2 : 0;
  const visualScore = Math.min(20, cameraScore + locationScore + castScore);

  const dialogueCountScore = scene.dialogueLines.length >= 3 ? 10 : scene.dialogueLines.length * 3;
  const longLinePenalty = scene.dialogueLines.some((line) => line.length > 34) ? 3 : 0;
  const dialogueScore = Math.max(0, Math.min(20, dialogueCountScore + 10 - longLinePenalty));

  const retentionScore = Math.min(
    20,
    textQualityScore(scene.cta, 8, 28) + keywordScore(scene.cta, RETENTION_KEYWORDS),
  );

  const score = Math.round(hookScore + conflictScore + visualScore + dialogueScore + retentionScore);
  const reasons: string[] = [];
  if (hookScore >= 15) reasons.push('Strong opening hook');
  if (conflictScore >= 15) reasons.push('Conflict and twist are explicit');
  if (visualScore >= 15) reasons.push('Visual execution is production-friendly');
  if (dialogueScore >= 15) reasons.push('Dialogue is shootable');
  if (retentionScore >= 14) reasons.push('CTA supports episodic retention');
  if (reasons.length === 0) reasons.push('Basic structure exists but lacks standout points');

  return {
    sceneNo: scene.sceneNo,
    chapterNumber: scene.chapterNumber,
    title: scene.title || `Scene ${scene.sceneNo}`,
    score: Math.max(0, Math.min(100, score)),
    hookScore,
    conflictScore,
    visualScore,
    dialogueScore,
    retentionScore,
    reasons,
    hook3s: scene.hook3s,
    conflict15s: scene.conflict15s,
    twist45s: scene.twist45s,
    cta: scene.cta,
  };
}

function rankForProfile(clip: ShortDramaClipScore, qualityProfile: ShortDramaQualityProfile): number {
  if (qualityProfile === 'hook-first') {
    return (
      clip.hookScore * 0.4
      + clip.retentionScore * 0.25
      + clip.conflictScore * 0.2
      + clip.visualScore * 0.1
      + clip.dialogueScore * 0.05
    );
  }
  return (
    clip.score * 0.7
    + clip.conflictScore * 0.1
    + clip.hookScore * 0.1
    + clip.retentionScore * 0.1
  );
}

function pickClipCandidates(
  sceneScores: ShortDramaClipScore[],
  candidateCount: number,
  qualityProfile: ShortDramaQualityProfile,
): ShortDramaClipScore[] {
  const sorted = sceneScores
    .slice()
    .sort((a, b) => rankForProfile(b, qualityProfile) - rankForProfile(a, qualityProfile));

  const selected: ShortDramaClipScore[] = [];
  const usedChapter = new Set<number>();
  const usedFingerprint = new Set<string>();

  for (const item of sorted) {
    if (selected.length >= candidateCount) break;
    const fp = fingerprintScene(item);
    if (usedChapter.has(item.chapterNumber) || usedFingerprint.has(fp)) {
      continue;
    }
    selected.push(item);
    usedChapter.add(item.chapterNumber);
    usedFingerprint.add(fp);
  }

  if (selected.length < candidateCount) {
    for (const item of sorted) {
      if (selected.length >= candidateCount) break;
      const fp = fingerprintScene(item);
      if (usedFingerprint.has(fp)) continue;
      if (selected.some((picked) => picked.sceneNo === item.sceneNo && picked.chapterNumber === item.chapterNumber)) {
        continue;
      }
      selected.push(item);
      usedFingerprint.add(fp);
    }
  }

  if (selected.length < candidateCount) {
    for (const item of sorted) {
      if (selected.length >= candidateCount) break;
      if (selected.some((picked) => picked.sceneNo === item.sceneNo && picked.chapterNumber === item.chapterNumber)) {
        continue;
      }
      selected.push(item);
    }
  }

  return selected;
}

function computeCoverageScore(sceneCount: number, chapterCount: number): number {
  if (sceneCount <= 0 || chapterCount <= 0) return 0;
  const target = chapterCount * 2;
  const ratio = Math.min(1, sceneCount / target);
  return Math.round(ratio * 100);
}

function computeConsistencyScore(scores: ShortDramaClipScore[]): number {
  if (scores.length === 0) return 0;
  const values = scores.map((item) => item.score);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  const std = Math.sqrt(variance);
  const stability = Math.max(0, 100 - std * 3);
  return Math.round(stability);
}

function computeHookStrengthScore(scores: ShortDramaClipScore[]): number {
  if (scores.length === 0) return 0;
  const avgHookScore = scores.reduce((sum, item) => sum + item.hookScore, 0) / scores.length;
  return Math.round(Math.max(0, Math.min(100, avgHookScore * 5)));
}

function computeCandidateDiversityScore(candidates: ShortDramaClipScore[]): number {
  if (candidates.length === 0) return 0;
  const uniqueChapterCount = new Set(candidates.map((item) => item.chapterNumber)).size;
  const uniqueFingerprintCount = new Set(candidates.map((item) => fingerprintScene(item))).size;
  const chapterPart = uniqueChapterCount / candidates.length;
  const fingerprintPart = uniqueFingerprintCount / candidates.length;
  return Math.round((chapterPart * 0.6 + fingerprintPart * 0.4) * 100);
}

function verdictByScore(score: number): ShortDramaCommercialQAReport['verdict'] {
  if (score >= 80) return 'ready-for-paid';
  if (score >= 65) return 'needs-polish';
  return 'not-ready';
}

function paidTierByScore(params: {
  overallScore: number;
  averageSceneScore: number;
  consistencyScore: number;
  topClipScore: number;
}): ShortDramaPaidTier {
  if (
    params.overallScore >= 90
    && params.topClipScore >= 95
    && params.consistencyScore >= 72
  ) {
    return 'premium';
  }

  if (
    params.overallScore >= 88
    && params.averageSceneScore >= 84
    && params.consistencyScore >= 78
    && params.topClipScore >= 90
  ) {
    return 'premium';
  }
  if (
    params.overallScore >= 75
    && params.averageSceneScore >= 72
    && params.topClipScore >= 80
  ) {
    return 'standard';
  }
  return 'test-only';
}

export function evaluateShortDramaCommercialQuality(params: {
  payload: unknown;
  chapterCount: number;
  qualityProfile?: ShortDramaQualityProfile;
  candidateCount?: number;
}): ShortDramaCommercialQAReport {
  const qualityProfile = params.qualityProfile ?? 'balanced';
  const scenes = parseScenes(params.payload);
  const sceneScores = scenes.map(scoreScene);
  const candidateCount = Math.max(1, Math.min(5, params.candidateCount ?? 2));
  const clipCandidates = pickClipCandidates(sceneScores, candidateCount, qualityProfile);

  const averageSceneScore = sceneScores.length > 0
    ? Math.round(sceneScores.reduce((sum, item) => sum + item.score, 0) / sceneScores.length)
    : 0;
  const coverageScore = computeCoverageScore(sceneScores.length, params.chapterCount);
  const consistencyScore = computeConsistencyScore(sceneScores);
  const hookStrengthScore = computeHookStrengthScore(sceneScores);
  const candidateDiversityScore = computeCandidateDiversityScore(clipCandidates);

  const overallScore = qualityProfile === 'hook-first'
    ? Math.round(
      averageSceneScore * 0.5
        + coverageScore * 0.15
        + consistencyScore * 0.1
        + hookStrengthScore * 0.15
        + candidateDiversityScore * 0.1,
    )
    : Math.round(
      averageSceneScore * 0.62
        + coverageScore * 0.2
        + consistencyScore * 0.12
        + hookStrengthScore * 0.06,
    );

  const boundedOverallScore = Math.max(0, Math.min(100, overallScore));
  const verdict = verdictByScore(boundedOverallScore);
  const paidTier = paidTierByScore({
    overallScore: boundedOverallScore,
    averageSceneScore,
    consistencyScore,
    topClipScore: clipCandidates[0]?.score ?? 0,
  });

  const strengths: string[] = [];
  const risks: string[] = [];
  if (qualityProfile === 'hook-first') {
    strengths.push('Profile tuned for hook-led clip conversion and retention openings.');
  } else {
    strengths.push('Profile tuned for balanced long-chain production stability.');
  }
  if (averageSceneScore >= 75) strengths.push('Scene-level dramatic beats are commercially competitive.');
  else risks.push('Scene-level dramatic beats need stronger hooks and twists.');
  if (coverageScore >= 80) strengths.push('Scene coverage density is enough for serial clip delivery.');
  else risks.push('Scene density is low; chapter-to-clip conversion may feel thin.');
  if (consistencyScore >= 75) strengths.push('Quality variance across scenes is controlled.');
  else risks.push('Quality variance is high; post-editing effort may increase.');
  if (candidateDiversityScore >= 70) strengths.push('Top clip candidates are diverse enough for A/B testing.');
  else risks.push('Top clip candidates are too similar; add more varied hooks.');

  if (paidTier === 'premium') strengths.push('Package can be pitched as premium paid delivery.');
  if (paidTier === 'standard') strengths.push('Package is ready for standard paid delivery.');
  if (paidTier === 'test-only') risks.push('Keep this package in pilot/testing before paid delivery.');
  if (verdict !== 'ready-for-paid') risks.push('Commercial verdict is below ready-for-paid threshold.');

  return {
    overallScore: boundedOverallScore,
    verdict,
    paidTier,
    qualityProfile,
    sceneCount: sceneScores.length,
    chapterCount: params.chapterCount,
    dimensions: {
      averageSceneScore,
      coverageScore,
      consistencyScore,
      hookStrengthScore,
      candidateDiversityScore,
    },
    strengths,
    risks,
    clipCandidates,
    checkedAt: new Date().toISOString(),
  };
}
