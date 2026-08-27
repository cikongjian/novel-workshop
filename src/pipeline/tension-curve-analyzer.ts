import type { StoryState } from '../novel/story-state-types.js';

export type TensionPattern =
  | 'flat-low'      // Multiple chapters stuck at low tension (< 4)
  | 'flat-high'     // Multiple chapters stuck at high tension (> 7) — exhausting
  | 'no-climax'     // Long stretch without any tension >= 8
  | 'no-relief'     // Long stretch without any tension <= 3
  | 'healthy';      // Good variation

export type TensionAnalysis = {
  /** Recent tension values (last N chapters) */
  recentTensions: Array<{ chapter: number; tension: number }>;
  /** Detected pattern */
  pattern: TensionPattern;
  /** Average tension over recent chapters */
  averageTension: number;
  /** Suggested tension target for next chapter */
  suggestedTension: number;
  /** Human-readable advice */
  advice: string;
};

const WINDOW_SIZE = 5;

export function analyzeTensionCurve(
  state: StoryState,
  currentChapter: number,
): TensionAnalysis | null {
  const snapshots = state.snapshots
    .filter(s => s.chapterNumber < currentChapter)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (snapshots.length < 3) return null; // Need at least 3 data points

  const recent = snapshots.slice(-WINDOW_SIZE);
  const recentTensions = recent.map(s => ({
    chapter: s.chapterNumber,
    tension: s.plot?.tensionLevel ?? 5,
  }));

  const tensions = recentTensions.map(t => t.tension);
  const avg = tensions.reduce((a, b) => a + b, 0) / tensions.length;
  const max = Math.max(...tensions);
  const min = Math.min(...tensions);
  const range = max - min;

  let pattern: TensionPattern = 'healthy';
  let suggestedTension: number;
  let advice: string;

  // Detect flat-low: average < 4 and range < 2
  if (avg < 4 && range < 2) {
    pattern = 'flat-low';
    suggestedTension = Math.min(10, avg + 3);
    advice = `最近${recent.length}章张力持续偏低（均值${avg.toFixed(1)}），节奏过于平淡。本章建议引入冲突或危机，将张力提升至${suggestedTension}左右。`;
  }
  // Detect flat-high: average > 7 and range < 2
  else if (avg > 7 && range < 2) {
    pattern = 'flat-high';
    suggestedTension = Math.max(0, avg - 3);
    advice = `最近${recent.length}章张力持续偏高（均值${avg.toFixed(1)}），读者可能疲劳。本章建议安排喘息、日常或情感沉淀段落，将张力降至${suggestedTension}左右。`;
  }
  // No climax in last 8+ chapters
  else if (snapshots.length >= 8 && snapshots.slice(-8).every(s => (s.plot?.tensionLevel ?? 5) < 8)) {
    pattern = 'no-climax';
    suggestedTension = 8;
    advice = `已连续${snapshots.slice(-8).length}章未出现高潮（张力≥8）。故事需要一个爆发点，本章建议推向高潮。`;
  }
  // No relief in last 6+ chapters
  else if (snapshots.length >= 6 && snapshots.slice(-6).every(s => (s.plot?.tensionLevel ?? 5) > 3)) {
    pattern = 'no-relief';
    suggestedTension = 3;
    advice = `已连续${snapshots.slice(-6).length}章没有低张力段落（≤3）。持续紧张会削弱高潮效果，本章建议安排一段舒缓。`;
  }
  else {
    // Healthy — suggest based on wave pattern
    const lastTension = tensions[tensions.length - 1];
    // Simple wave: if last was high, suggest lower; if low, suggest higher
    if (lastTension >= 7) {
      suggestedTension = lastTension - 2;
      advice = `上一章张力较高（${lastTension}），本章可适当回落，为下一波高潮蓄力。`;
    } else if (lastTension <= 3) {
      suggestedTension = lastTension + 2;
      advice = `上一章张力较低（${lastTension}），本章可逐步升温，推动情节发展。`;
    } else {
      suggestedTension = lastTension; // maintain
      advice = '';
    }
  }

  return {
    recentTensions,
    pattern,
    averageTension: Math.round(avg * 10) / 10,
    suggestedTension: Math.round(suggestedTension),
    advice,
  };
}

export function buildTensionCurveContext(analysis: TensionAnalysis): string {
  if (!analysis.advice) return '';

  const lines: string[] = [];
  const tensionStr = analysis.recentTensions
    .map(t => `第${t.chapter}章:${t.tension}`)
    .join(' → ');

  lines.push(`近期张力走势：${tensionStr}`);
  lines.push(`建议本章张力目标：${analysis.suggestedTension}/10`);
  lines.push(analysis.advice);

  return lines.join('\n');
}
