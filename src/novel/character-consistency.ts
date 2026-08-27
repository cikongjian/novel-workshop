import type { CharacterStateSnapshot } from './types.js';

export type StateAlert = {
  chapterNumber: number;
  type: 'abrupt-shift' | 'flat-character';
  reason: string;
};

export type CharacterConsistencyReport = {
  chapterCount: number;
  stabilityScore: number;
  conflictRate: number;
  humanityRate: number;
  emotionDiversity: number;
  dominantEmotions: Array<{ emotion: string; count: number }>;
  alerts: StateAlert[];
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildConsistencyReport(
  snapshots: CharacterStateSnapshot[],
): CharacterConsistencyReport {
  if (snapshots.length === 0) {
    return {
      chapterCount: 0,
      stabilityScore: 0,
      conflictRate: 0,
      humanityRate: 0,
      emotionDiversity: 0,
      dominantEmotions: [],
      alerts: [],
    };
  }

  const emotionCounter = new Map<string, number>();
  let conflictChapters = 0;
  let humanityChapters = 0;
  let shiftAccumulator = 0;
  let shiftCount = 0;
  const alerts: StateAlert[] = [];

  snapshots.forEach((item, idx) => {
    const emotion = item.emotionState.primary || 'neutral';
    emotionCounter.set(emotion, (emotionCounter.get(emotion) ?? 0) + 1);

    const hasConflict = item.stress >= 65
      || item.trustChanges.some(change => Math.abs(change.delta) >= 10);
    if (hasConflict) conflictChapters += 1;

    if (item.beliefShift || item.emotionState.intensity >= 50 || hasConflict) {
      humanityChapters += 1;
    }

    if (idx === 0) return;
    const prev = snapshots[idx - 1];
    const shift = (
      Math.abs(item.emotionState.intensity - prev.emotionState.intensity)
      + Math.abs(item.stress - prev.stress)
      + Math.abs(item.goalProgress - prev.goalProgress)
    ) / 3;
    shiftAccumulator += shift;
    shiftCount += 1;

    if (shift >= 45 && item.evidence.length < 1) {
      alerts.push({
        chapterNumber: item.chapterNumber,
        type: 'abrupt-shift',
        reason: '状态跳变较大但证据不足',
      });
    }

    if (idx >= 2) {
      const prev2 = snapshots[idx - 2];
      const tooFlat = Math.abs(item.goalProgress - prev.goalProgress) <= 3
        && Math.abs(prev.goalProgress - prev2.goalProgress) <= 3
        && Math.abs(item.stress - prev.stress) <= 3
        && Math.abs(prev.stress - prev2.stress) <= 3;
      if (tooFlat) {
        alerts.push({
          chapterNumber: item.chapterNumber,
          type: 'flat-character',
          reason: '连续多章状态变化过小，存在刻板化风险',
        });
      }
    }
  });

  const averageShift = shiftCount === 0 ? 0 : shiftAccumulator / shiftCount;
  const stabilityScore = clampScore(100 - averageShift);
  const conflictRate = clampScore((conflictChapters / snapshots.length) * 100);
  const humanityRate = clampScore((humanityChapters / snapshots.length) * 100);
  const dominantEmotions = [...emotionCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([emotion, count]) => ({ emotion, count }));

  return {
    chapterCount: snapshots.length,
    stabilityScore,
    conflictRate,
    humanityRate,
    emotionDiversity: emotionCounter.size,
    dominantEmotions,
    alerts,
  };
}

