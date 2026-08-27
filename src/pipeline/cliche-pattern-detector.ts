import type { PatternFrequencyDB, PatternFrequencyEntry, ExtractedPatterns } from './pattern-frequency-extractor.js';
import { extractPatterns } from './pattern-frequency-extractor.js';

export type ClicheFinding = {
  type: 'ngram-overuse' | 'metaphor-overuse' | 'structure-overuse' | 'opening-repeat' | 'closing-repeat' | 'emotion-beat-repeat' | 'dialogue-overload' | 'semantic-cluster-overuse' | 'scene-monotony';
  severity: 'high' | 'medium' | 'low';
  pattern: string;
  count: number;
  baseline: number;
  deviation: number;
  message: string;
};

export type ClichePatternReport = {
  score: number;
  findings: ClicheFinding[];
  topPatterns: Array<{ pattern: string; count: number; type: string }>;
  writerHints: string[];
};

const RECENT_WINDOW = 5;
const DEVIATION_THRESHOLD = 2.0;
const HIGH_DEVIATION_THRESHOLD = 3.0;
const WITHIN_CHAPTER_REPEAT_THRESHOLD = 3;
const RECENT_SKELETON_REPEAT_THRESHOLD = 3;
const DIALOGUE_OVERLOAD_THRESHOLD = 0.6;
const SEMANTIC_CLUSTER_DEVIATION_THRESHOLD = 2.0;
const SEMANTIC_CLUSTER_MIN_COUNT = 3;
const SEMANTIC_CLUSTER_HIGH_COUNT = 6;
const SCENE_MONOTONY_MIN_RUN = 3;
const SCENE_MONOTONY_HIGH_RUN = 4;
const EXPRESSIVE_PHRASE_FREQ_THRESHOLD = 5;

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function detectOverusedNGrams(
  currentPatterns: Map<string, number>,
  db: PatternFrequencyDB,
): ClicheFinding[] {
  const findings: ClicheFinding[] = [];
  const totalChapters = Math.max(1, db.totalChapters);

  for (const [text, currentCount] of currentPatterns) {
    if (currentCount < WITHIN_CHAPTER_REPEAT_THRESHOLD) continue;

    const entry = db.ngramFreq[text];
    if (!entry || entry.totalCount < 2) {
      if (currentCount >= WITHIN_CHAPTER_REPEAT_THRESHOLD) {
        findings.push({
          type: 'ngram-overuse',
          severity: 'medium',
          pattern: text,
          count: currentCount,
          baseline: 0,
          deviation: currentCount,
          message: `短语"${text}"在本章出现${currentCount}次，历史未见`,
        });
      }
      continue;
    }

    const historicalAvg = entry.totalCount / totalChapters;
    const recentAvg = entry.recentCounts.length > 0
      ? avg(entry.recentCounts)
      : historicalAvg;
    const baseline = Math.max(historicalAvg, recentAvg);
    const deviation = baseline > 0 ? currentCount / baseline : currentCount;

    if (deviation >= DEVIATION_THRESHOLD && currentCount >= WITHIN_CHAPTER_REPEAT_THRESHOLD) {
      const severity = deviation >= HIGH_DEVIATION_THRESHOLD ? 'high' : 'medium';
      findings.push({
        type: 'ngram-overuse',
        severity,
        pattern: text,
        count: currentCount,
        baseline: Number(baseline.toFixed(2)),
        deviation: Number(deviation.toFixed(2)),
        message: `短语"${text}"在本章出现${currentCount}次，历史平均${baseline.toFixed(1)}次（${deviation.toFixed(1)}倍偏离）`,
      });
    }
  }

  return findings;
}

function detectSemanticClusterOveruse(
  currentPatterns: ExtractedPatterns,
  db: PatternFrequencyDB,
): ClicheFinding[] {
  const findings: ClicheFinding[] = [];
  const totalChapters = Math.max(1, db.totalChapters);

  for (const [, cluster] of currentPatterns.semanticClusters) {
    const { cluster: clusterName, patterns, totalCount } = cluster;
    if (totalCount < SEMANTIC_CLUSTER_MIN_COUNT) continue;

    const entry = db.semanticClusterFreq[clusterName];
    const historicalAvg = entry && entry.totalCount > 0
      ? entry.totalCount / totalChapters
      : 0;
    const recentAvg = entry && entry.recentCounts.length > 0
      ? avg(entry.recentCounts)
      : historicalAvg;
    const baseline = Math.max(historicalAvg, recentAvg);
    const deviation = baseline > 0 ? totalCount / baseline : totalCount;

    if (deviation >= SEMANTIC_CLUSTER_DEVIATION_THRESHOLD && totalCount >= SEMANTIC_CLUSTER_MIN_COUNT) {
      findings.push({
        type: 'semantic-cluster-overuse',
        severity: totalCount >= SEMANTIC_CLUSTER_HIGH_COUNT ? 'high' : 'medium',
        pattern: clusterName,
        count: totalCount,
        baseline: Number(baseline.toFixed(2)),
        deviation: Number(deviation.toFixed(2)),
        message: `语义类别"${clusterName}"在本章出现${totalCount}次（含：${patterns.join('、')}），建议用不同的表达方式`,
      });
    }
  }

  return findings;
}

function detectOverusedMetaphors(
  currentPatterns: Map<string, number>,
  db: PatternFrequencyDB,
): ClicheFinding[] {
  const findings: ClicheFinding[] = [];

  for (const [imagery, currentCount] of currentPatterns) {
    const entry = db.metaphorFreq[imagery];
    const historicalCount = entry?.totalCount || 0;

    if (currentCount >= 2 && historicalCount >= 2) {
      const totalChapters = Math.max(1, db.totalChapters);
      const baseline = historicalCount / totalChapters;
      const deviation = baseline > 0 ? currentCount / baseline : currentCount;

      if (deviation >= DEVIATION_THRESHOLD || (currentCount >= 3 && historicalCount >= 3)) {
        findings.push({
          type: 'metaphor-overuse',
          severity: 'medium',
          pattern: `像${imagery}…`,
          count: currentCount,
          baseline: Number(baseline.toFixed(2)),
          deviation: Number(deviation.toFixed(2)),
          message: `比喻意象"${imagery}"在本章出现${currentCount}次，历史共${historicalCount}次`,
        });
      }
    } else if (currentCount >= 3) {
      findings.push({
        type: 'metaphor-overuse',
        severity: 'medium',
        pattern: `像${imagery}…`,
        count: currentCount,
        baseline: 0,
        deviation: currentCount,
        message: `比喻意象"${imagery}"在本章出现${currentCount}次，密集使用`,
      });
    }
  }

  return findings;
}

function detectOverusedStructures(
  currentPatterns: Map<string, number>,
  db: PatternFrequencyDB,
): ClicheFinding[] {
  const findings: ClicheFinding[] = [];

  for (const [skeleton, currentCount] of currentPatterns) {
    if (currentCount < WITHIN_CHAPTER_REPEAT_THRESHOLD) continue;

    const entry = db.structureFreq[skeleton];
    if (!entry) {
      findings.push({
        type: 'structure-overuse',
        severity: 'medium',
        pattern: skeleton,
        count: currentCount,
        baseline: 0,
        deviation: currentCount,
        message: `句式"${skeleton}"在本章重复${currentCount}次`,
      });
      continue;
    }

    const totalChapters = Math.max(1, db.totalChapters);
    const baseline = entry.totalCount / totalChapters;
    const deviation = baseline > 0 ? currentCount / baseline : currentCount;

    if (deviation >= DEVIATION_THRESHOLD) {
      findings.push({
        type: 'structure-overuse',
        severity: deviation >= HIGH_DEVIATION_THRESHOLD ? 'high' : 'medium',
        pattern: skeleton,
        count: currentCount,
        baseline: Number(baseline.toFixed(2)),
        deviation: Number(deviation.toFixed(2)),
        message: `句式"${skeleton}"在本章出现${currentCount}次，历史平均${baseline.toFixed(1)}次`,
      });
    }
  }

  return findings;
}

function detectSkeletonRepeats(db: PatternFrequencyDB): ClicheFinding[] {
  const findings: ClicheFinding[] = [];
  const recent = db.chapterSkeletons.slice(-RECENT_WINDOW - 1, -1);

  if (recent.length < 2) return findings;

  const openingTypes = recent.map(s => s.openingType);
  const closingTypes = recent.map(s => s.closingType);

  const lastOpening = openingTypes[openingTypes.length - 1];
  let openingRepeat = 0;
  for (let i = openingTypes.length - 2; i >= 0; i--) {
    if (openingTypes[i] === lastOpening) openingRepeat++;
    else break;
  }

  if (openingRepeat >= RECENT_SKELETON_REPEAT_THRESHOLD - 1) {
    findings.push({
      type: 'opening-repeat',
      severity: 'high',
      pattern: lastOpening,
      count: openingRepeat + 1,
      baseline: 1,
      deviation: openingRepeat + 1,
      message: `最近${openingRepeat + 1}章连续使用"${lastOpening}"开头`,
    });
  }

  const lastClosing = closingTypes[closingTypes.length - 1];
  let closingRepeat = 0;
  for (let i = closingTypes.length - 2; i >= 0; i--) {
    if (closingTypes[i] === lastClosing) closingRepeat++;
    else break;
  }

  if (closingRepeat >= RECENT_SKELETON_REPEAT_THRESHOLD - 1) {
    findings.push({
      type: 'closing-repeat',
      severity: 'high',
      pattern: lastClosing,
      count: closingRepeat + 1,
      baseline: 1,
      deviation: closingRepeat + 1,
      message: `最近${closingRepeat + 1}章连续使用"${lastClosing}"结尾`,
    });
  }

  const recentDialogueRatios = recent.map(s => s.dialogueRatio);
  const avgDialogue = avg(recentDialogueRatios);
  if (avgDialogue > DIALOGUE_OVERLOAD_THRESHOLD) {
    findings.push({
      type: 'dialogue-overload',
      severity: 'medium',
      pattern: '对话占比过高',
      count: recent.length,
      baseline: 0.3,
      deviation: Number((avgDialogue / 0.3).toFixed(2)),
      message: `最近${recent.length}章对话平均占比${(avgDialogue * 100).toFixed(0)}%，建议增加动作和环境推进`,
    });
  }

  return findings;
}

function detectSceneMonotony(db: PatternFrequencyDB): ClicheFinding[] {
  const findings: ClicheFinding[] = [];
  const recent = db.chapterSkeletons.slice(-RECENT_WINDOW - 1, -1);

  if (recent.length < SCENE_MONOTONY_MIN_RUN) return findings;

  const scenes = recent.map(s => s.dominantScene);
  const lastScene = scenes[scenes.length - 1];

  let consecutiveCount = 0;
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (scenes[i] === lastScene) consecutiveCount++;
    else break;
  }

  if (consecutiveCount >= SCENE_MONOTONY_MIN_RUN) {
    findings.push({
      type: 'scene-monotony',
      severity: consecutiveCount >= SCENE_MONOTONY_HIGH_RUN ? 'high' : 'medium',
      pattern: lastScene,
      count: consecutiveCount,
      baseline: 1,
      deviation: consecutiveCount,
      message: `最近${consecutiveCount}章连续为"${lastScene}"场景，建议切换场景类型`,
    });
  }

  return findings;
}

function detectEmotionBeatRepeats(db: PatternFrequencyDB): ClicheFinding[] {
  const findings: ClicheFinding[] = [];
  const recentBeats = db.recentEmotionBeats;

  if (recentBeats.length < 3) return findings;

  const beatFreq = new Map<string, number>();
  for (const beats of recentBeats) {
    for (const beat of beats) {
      beatFreq.set(beat, (beatFreq.get(beat) || 0) + 1);
    }
  }

  const sorted = Array.from(beatFreq.entries()).sort((a, b) => b[1] - a[1]);
  for (const [beat, count] of sorted.slice(0, 3)) {
    if (count >= 4) {
      findings.push({
        type: 'emotion-beat-repeat',
        severity: count >= 6 ? 'high' : 'medium',
        pattern: beat,
        count,
        baseline: 1,
        deviation: count,
        message: `情绪节拍"${beat}"在最近${recentBeats.length}章出现${count}次，建议轮换`,
      });
    }
  }

  return findings;
}

function buildWriterHints(findings: ClicheFinding[], db: PatternFrequencyDB): string[] {
  const hints: string[] = [];
  const ngramFindings = findings.filter(f => f.type === 'ngram-overuse' && f.severity === 'high');
  if (ngramFindings.length > 0) {
    const examples = ngramFindings.slice(0, 5).map(f => `"${f.pattern}"(${f.count}次)`).join('、');
    hints.push(`以下短语在本章过度使用，请减少或替换：${examples}`);
  }

  const metaphorFindings = findings.filter(f => f.type === 'metaphor-overuse');
  if (metaphorFindings.length > 0) {
    const examples = metaphorFindings.slice(0, 3).map(f => f.pattern).join('、');
    hints.push(`比喻意象重复：${examples}，请换用新的比喻或直接描写`);
  }

  const structureFindings = findings.filter(f => f.type === 'structure-overuse');
  if (structureFindings.length > 0) {
    const examples = structureFindings.slice(0, 3).map(f => `"${f.pattern}"`).join('、');
    hints.push(`句式结构重复：${examples}，请调整句子节奏和结构`);
  }

  const openingRepeat = findings.find(f => f.type === 'opening-repeat');
  if (openingRepeat) {
    hints.push(`最近章节开头模式重复（${openingRepeat.pattern}），请换一种开场方式`);
  }

  const closingRepeat = findings.find(f => f.type === 'closing-repeat');
  if (closingRepeat) {
    hints.push(`最近章节结尾模式重复（${closingRepeat.pattern}），请换一种收束方式`);
  }

  const emotionRepeat = findings.filter(f => f.type === 'emotion-beat-repeat');
  if (emotionRepeat.length > 0) {
    const examples = emotionRepeat.slice(0, 3).map(f => `"${f.pattern}"`).join('、');
    hints.push(`情绪表达套路化：${examples}频繁出现，请用更具体的动作或身体反应替代`);
  }

  const dialogueOverload = findings.find(f => f.type === 'dialogue-overload');
  if (dialogueOverload) {
    hints.push('最近章节对话占比偏高，建议增加动作推进、环境描写和心理刻画的比例');
  }

  const semanticClusterOveruseFindings = findings.filter(f => f.type === 'semantic-cluster-overuse');
  if (semanticClusterOveruseFindings.length > 0) {
    const clusterExamples = semanticClusterOveruseFindings.slice(0, 3).map(f => {
      const match = f.message.match(/（含：([^）]+)）/);
      const patternsList = match ? match[1] : '';
      return patternsList ? `${f.pattern}（含：${patternsList}）` : f.pattern;
    }).join('、');
    hints.push(`以下表达类型在本章过度使用，请避免或替换：${clusterExamples}`);
  }

  const sceneMonotony = findings.find(f => f.type === 'scene-monotony');
  if (sceneMonotony) {
    hints.push(`最近章节场景单一（连续${sceneMonotony.count}章为${sceneMonotony.pattern}场景），请尝试切换到动作/环境/内心独白等不同场景类型`);
  }

  const expressiveEntries = Object.entries(db.expressiveFreq)
    .filter(([, entry]) => entry.totalCount >= EXPRESSIVE_PHRASE_FREQ_THRESHOLD)
    .sort((a, b) => b[1].totalCount - a[1].totalCount)
    .slice(0, 5);
  if (expressiveEntries.length > 0) {
    const examples = expressiveEntries
      .map(([text, entry]) => `${text}（${entry.totalCount}次）`)
      .join('、');
    hints.push(`以下表达性短语在最近章节频繁出现，本章请避免或换用：${examples}`);
  }

  return hints;
}

export function detectClichePatterns(
  currentContent: string,
  db: PatternFrequencyDB,
): ClichePatternReport {
  const currentPatterns = extractPatterns(currentContent);

  const ngramFindings = detectOverusedNGrams(currentPatterns.ngrams, db);
  const metaphorFindings = detectOverusedMetaphors(currentPatterns.metaphors, db);
  const structureFindings = detectOverusedStructures(currentPatterns.structures, db);
  const skeletonFindings = detectSkeletonRepeats(db);
  const emotionFindings = detectEmotionBeatRepeats(db);
  const semanticClusterFindings = detectSemanticClusterOveruse(currentPatterns, db);
  const sceneMonotonyFindings = detectSceneMonotony(db);

  const allFindings = [
    ...ngramFindings,
    ...metaphorFindings,
    ...structureFindings,
    ...skeletonFindings,
    ...emotionFindings,
    ...semanticClusterFindings,
    ...sceneMonotonyFindings,
  ].sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) {
      return sevOrder[a.severity] - sevOrder[b.severity];
    }
    return b.deviation - a.deviation;
  });

  const ngramOveruseCount = allFindings.filter(f => f.type === 'ngram-overuse').length;
  const structuralFindings = allFindings.filter(f =>
    f.type === 'opening-repeat' || f.type === 'closing-repeat' || f.type === 'emotion-beat-repeat' || f.type === 'dialogue-overload'
  );

  let score = 100;
  score -= Math.min(40, ngramOveruseCount * 3);
  score -= Math.min(30, structuralFindings.length * 12);
  score -= Math.min(15, allFindings.filter(f => f.type === 'metaphor-overuse').length * 6);
  score -= Math.min(15, allFindings.filter(f => f.type === 'structure-overuse').length * 5);
  score -= Math.min(25, allFindings.filter(f => f.type === 'semantic-cluster-overuse').length * 8);
  score -= Math.min(30, allFindings.filter(f => f.type === 'scene-monotony').length * 15);
  score = Math.max(0, Math.round(score));

  const topPatterns = allFindings.slice(0, 10).map(f => ({
    pattern: f.pattern,
    count: f.count,
    type: f.type,
  }));

  const writerHints = buildWriterHints(allFindings, db);

  return {
    score,
    findings: allFindings,
    topPatterns,
    writerHints,
  };
}
