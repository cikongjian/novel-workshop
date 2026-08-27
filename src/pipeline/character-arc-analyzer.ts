import type { StoryState, CharacterLiveState } from '../novel/story-state-types.js';

// ==================== 信念演化分析 ====================

type BeliefEvolution = {
  name: string;
  currentBelief: string;
  shifts: Array<{ chapter: number; shift: string }>;
  /** Is belief currently under pressure? */
  underPressure: boolean;
};

export function analyzeBeliefEvolution(
  state: StoryState,
  currentChapter: number,
): BeliefEvolution[] {
  const snapshots = state.snapshots
    .filter(s => s.chapterNumber < currentChapter)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (snapshots.length < 2) return [];

  const charBeliefs = new Map<string, BeliefEvolution>();

  for (const snap of snapshots) {
    for (const char of snap.characters) {
      if (!char.alive) continue;
      if (!char.currentBelief && !char.beliefShift) continue;

      if (!charBeliefs.has(char.name)) {
        charBeliefs.set(char.name, {
          name: char.name,
          currentBelief: char.currentBelief || '',
          shifts: [],
          underPressure: false,
        });
      }

      const entry = charBeliefs.get(char.name)!;
      if (char.currentBelief) entry.currentBelief = char.currentBelief;
      if (char.beliefShift) {
        entry.shifts.push({ chapter: snap.chapterNumber, shift: char.beliefShift });
      }
    }
  }

  // Mark as under pressure if shift happened in last 2 chapters
  for (const entry of charBeliefs.values()) {
    if (entry.shifts.length > 0) {
      const lastShiftChapter = entry.shifts[entry.shifts.length - 1].chapter;
      entry.underPressure = (currentChapter - lastShiftChapter) <= 2;
    }
  }

  return Array.from(charBeliefs.values()).filter(e => e.currentBelief || e.shifts.length > 0);
}

export function buildBeliefEvolutionContext(beliefs: BeliefEvolution[]): string {
  if (beliefs.length === 0) return '';

  const lines: string[] = [];
  for (const b of beliefs) {
    if (b.underPressure) {
      lines.push(`- ${b.name}：信念「${b.currentBelief}」正在动摇`);
      const lastShift = b.shifts[b.shifts.length - 1];
      lines.push(`  最近变化（第${lastShift.chapter}章）：${lastShift.shift}`);
      lines.push(`  建议：继续施压或安排关键事件促成信念转变/坚定`);
    } else if (b.currentBelief && b.shifts.length === 0) {
      // Has belief but never challenged — might need a challenge
      lines.push(`- ${b.name}：信念「${b.currentBelief}」尚未受到挑战，可考虑安排考验`);
    }
  }

  return lines.join('\n');
}

// ==================== 角色弧线停滞检测 ====================

type CharacterStallInfo = {
  name: string;
  characterId: string;
  /** How many consecutive chapters with no meaningful change */
  stallChapters: number;
  /** What aspects are stalled */
  stalledAspects: string[];
  /** Last known state summary */
  lastState: string;
};

type CharacterArcAnalysis = {
  /** Characters that have been static for too long */
  stalledCharacters: CharacterStallInfo[];
  /** Characters with healthy progression */
  activeCharacters: string[];
};

const STALL_THRESHOLD = 3; // chapters without change = stalled

/**
 * Compare two character states and determine if meaningful change occurred.
 */
function hasCharacterChanged(prev: CharacterLiveState, curr: CharacterLiveState): {
  changed: boolean;
  unchangedAspects: string[];
} {
  const unchangedAspects: string[] = [];

  if (prev.emotionalState === curr.emotionalState) {
    unchangedAspects.push('情绪');
  }
  if (prev.currentGoal === curr.currentGoal && Math.abs(prev.goalProgress - curr.goalProgress) < 5) {
    unchangedAspects.push('目标');
  }
  if (curr.relationshipChanges.length === 0) {
    unchangedAspects.push('关系');
  }
  if (prev.location === curr.location) {
    unchangedAspects.push('位置');
  }
  if (!curr.powerChange) {
    unchangedAspects.push('实力');
  }

  // Changed if at least 2 aspects changed
  const changedCount = 5 - unchangedAspects.length;
  return { changed: changedCount >= 2, unchangedAspects };
}

/**
 * Analyze character arcs across recent snapshots to detect stalls.
 */
export function analyzeCharacterArcs(
  state: StoryState,
  currentChapter: number,
): CharacterArcAnalysis {
  const snapshots = state.snapshots
    .filter(s => s.chapterNumber < currentChapter)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (snapshots.length < STALL_THRESHOLD) {
    return { stalledCharacters: [], activeCharacters: [] };
  }

  // Build per-character timeline from recent snapshots
  const recentSnapshots = snapshots.slice(-8); // look at last 8 chapters
  const characterTimelines = new Map<string, Array<{ chapter: number; state: CharacterLiveState }>>();

  for (const snap of recentSnapshots) {
    for (const char of snap.characters) {
      if (!char.alive || !char.present) continue;
      const key = char.name;
      if (!characterTimelines.has(key)) {
        characterTimelines.set(key, []);
      }
      characterTimelines.get(key)!.push({ chapter: snap.chapterNumber, state: char });
    }
  }

  const stalledCharacters: CharacterStallInfo[] = [];
  const activeCharacters: string[] = [];

  for (const [name, timeline] of characterTimelines) {
    if (timeline.length < 2) continue;

    // Count consecutive stall chapters from the end
    let stallCount = 0;
    let stalledAspects: string[] = [];

    for (let i = timeline.length - 1; i >= 1; i--) {
      const result = hasCharacterChanged(timeline[i - 1].state, timeline[i].state);
      if (!result.changed) {
        stallCount++;
        stalledAspects = result.unchangedAspects;
      } else {
        break;
      }
    }

    if (stallCount >= STALL_THRESHOLD) {
      const latest = timeline[timeline.length - 1].state;
      const stateParts: string[] = [];
      if (latest.location) stateParts.push(`在${latest.location}`);
      if (latest.emotionalState && latest.emotionalState !== 'neutral') stateParts.push(`情绪:${latest.emotionalState}`);
      if (latest.currentGoal) stateParts.push(`目标:${latest.currentGoal}(${latest.goalProgress}%)`);

      stalledCharacters.push({
        name,
        characterId: latest.characterId,
        stallChapters: stallCount,
        stalledAspects,
        lastState: stateParts.join('，') || '无明显状态',
      });
    } else {
      activeCharacters.push(name);
    }
  }

  // Sort by stall duration descending
  stalledCharacters.sort((a, b) => b.stallChapters - a.stallChapters);

  return { stalledCharacters, activeCharacters };
}

/**
 * Build Writer-injectable context for stalled characters.
 */
export function buildCharacterStallContext(analysis: CharacterArcAnalysis): string {
  if (analysis.stalledCharacters.length === 0) return '';

  const lines: string[] = [];
  for (const c of analysis.stalledCharacters) {
    lines.push(`- ${c.name}：已${c.stallChapters}章无实质变化（${c.stalledAspects.join('、')}停滞）`);
    if (c.lastState) {
      lines.push(`  当前状态：${c.lastState}`);
    }
    lines.push(`  建议：推动其${c.stalledAspects[0] ?? '弧线'}发展，或安排关键事件触发转变`);
  }

  return lines.join('\n');
}
