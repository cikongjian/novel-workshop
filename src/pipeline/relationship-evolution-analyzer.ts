import type { StoryState } from '../novel/story-state-types.js';
import type { RelationshipVector } from '../novel/relationship-vector.js';
import { classifyVector, vectorDistance, inferVectorFromText } from '../novel/relationship-vector.js';

export type RelationshipTrend = {
  characterA: string;
  characterB: string;
  /** Recent changes across chapters */
  recentChanges: Array<{ chapter: number; change: string }>;
  /** Is this relationship static (no changes in N+ chapters)? */
  isStatic: boolean;
  /** Chapters since last change */
  chaptersSinceChange: number;
  /** Detected trajectory: improving, deteriorating, oscillating, static */
  trajectory: 'improving' | 'deteriorating' | 'oscillating' | 'static';
};

export type RelationshipEvolutionAnalysis = {
  /** Relationships that have been static too long */
  staticRelationships: RelationshipTrend[];
  /** Relationships with active evolution */
  dynamicRelationships: RelationshipTrend[];
  /** Pairs of characters who interact but have no tracked relationship */
  untrackedPairs: Array<{ charA: string; charB: string }>;
};

const STATIC_THRESHOLD = 4; // chapters without relationship change

// Simple sentiment keywords for trajectory detection
const POSITIVE_KEYWORDS = ['信任', '亲近', '好感', '感激', '尊敬', '友好', '合作', '依赖', '爱', '欣赏', '忠诚', '和解'];
const NEGATIVE_KEYWORDS = ['敌意', '怀疑', '疏远', '仇恨', '背叛', '冲突', '不满', '嫉妒', '恐惧', '厌恶', '对立', '决裂'];

function classifyChange(change: string): 'positive' | 'negative' | 'neutral' {
  const posHits = POSITIVE_KEYWORDS.filter(k => change.includes(k)).length;
  const negHits = NEGATIVE_KEYWORDS.filter(k => change.includes(k)).length;
  if (posHits > negHits) return 'positive';
  if (negHits > posHits) return 'negative';
  return 'neutral';
}

/** Minimum net score magnitude to classify as non-static */
const VECTOR_TRAJECTORY_THRESHOLD = 15;

/**
 * Compute trajectory from a sequence of relationship vectors.
 * Uses consecutive vector distances and net delta on the
 * bipolar dimensions (trust + affection + respect) to detect trends.
 */
function computeTrajectoryFromVectors(
  vectors: RelationshipVector[],
): RelationshipTrend['trajectory'] {
  if (vectors.length < 2) return 'static';

  // Compute bipolar score per vector (sum of trust + affection + respect)
  const scores = vectors.map(v => v.trust + v.affection + v.respect);
  const deltas = scores.slice(1).map((s, i) => s - scores[i]);

  const posDeltas = deltas.filter(d => d > 0).length;
  const negDeltas = deltas.filter(d => d < 0).length;
  const netChange = scores[scores.length - 1] - scores[0];

  // Oscillating: both positive and negative deltas with similar frequency
  if (posDeltas > 0 && negDeltas > 0 && Math.abs(posDeltas - negDeltas) <= 1) {
    return 'oscillating';
  }

  if (Math.abs(netChange) < VECTOR_TRAJECTORY_THRESHOLD) return 'static';
  return netChange > 0 ? 'improving' : 'deteriorating';
}

export function analyzeRelationshipEvolution(
  state: StoryState,
  currentChapter: number,
): RelationshipEvolutionAnalysis {
  const snapshots = state.snapshots
    .filter(s => s.chapterNumber < currentChapter)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (snapshots.length < 3) {
    return { staticRelationships: [], dynamicRelationships: [], untrackedPairs: [] };
  }

  // Build relationship timeline: key = "A↔B" (sorted), value = changes
  const relTimeline = new Map<string, Array<{ chapter: number; change: string; from: string; to: string; vector?: RelationshipVector }>>();
  // Track co-appearances
  const coAppearances = new Map<string, number>();

  const recent = snapshots.slice(-10);

  for (const snap of recent) {
    // Track co-appearances
    const presentChars = snap.characters.filter(c => c.alive && c.present).map(c => c.name);
    for (let i = 0; i < presentChars.length; i++) {
      for (let j = i + 1; j < presentChars.length; j++) {
        const key = [presentChars[i], presentChars[j]].sort().join('↔');
        coAppearances.set(key, (coAppearances.get(key) ?? 0) + 1);
      }
    }

    // Track relationship changes
    for (const char of snap.characters) {
      for (const rel of char.relationshipChanges) {
        const key = [char.name, rel.targetName].sort().join('↔');
        if (!relTimeline.has(key)) {
          relTimeline.set(key, []);
        }
        relTimeline.get(key)!.push({
          chapter: snap.chapterNumber,
          change: rel.change,
          from: char.name,
          to: rel.targetName,
          vector: rel.vector as RelationshipVector | undefined,
        });
      }
    }
  }

  const staticRelationships: RelationshipTrend[] = [];
  const dynamicRelationships: RelationshipTrend[] = [];

  // Analyze each tracked relationship
  for (const [key, changes] of relTimeline) {
    const [charA, charB] = key.split('↔');
    const lastChangeChapter = changes[changes.length - 1].chapter;
    const chaptersSinceChange = (currentChapter - 1) - lastChangeChapter;

    const recentChanges = changes.map(c => ({ chapter: c.chapter, change: c.change }));

    // Determine trajectory — dual mode: vector-based when available, keyword fallback
    let trajectory: RelationshipTrend['trajectory'] = 'static';
    if (changes.length >= 2) {
      const recentSlice = changes.slice(-4);
      const vectors = recentSlice.map(c => c.vector).filter((v): v is RelationshipVector => !!v);

      if (vectors.length >= 2) {
        // Vector mode: compute net movement across trust + affection + respect
        trajectory = computeTrajectoryFromVectors(vectors);
      } else {
        // Keyword fallback
        const sentiments = recentSlice.map(c => classifyChange(c.change));
        const posCount = sentiments.filter(s => s === 'positive').length;
        const negCount = sentiments.filter(s => s === 'negative').length;

        if (posCount > 0 && negCount > 0 && Math.abs(posCount - negCount) <= 1) {
          trajectory = 'oscillating';
        } else if (posCount > negCount) {
          trajectory = 'improving';
        } else if (negCount > posCount) {
          trajectory = 'deteriorating';
        }
      }
    }

    const isStatic = chaptersSinceChange >= STATIC_THRESHOLD;

    const trend: RelationshipTrend = {
      characterA: charA,
      characterB: charB,
      recentChanges,
      isStatic,
      chaptersSinceChange,
      trajectory,
    };

    if (isStatic) {
      staticRelationships.push(trend);
    } else {
      dynamicRelationships.push(trend);
    }
  }

  // Find untracked pairs (co-appear 3+ times but no relationship changes)
  const untrackedPairs: Array<{ charA: string; charB: string }> = [];
  for (const [key, count] of coAppearances) {
    if (count >= 3 && !relTimeline.has(key)) {
      const [charA, charB] = key.split('↔');
      untrackedPairs.push({ charA, charB });
    }
  }

  staticRelationships.sort((a, b) => b.chaptersSinceChange - a.chaptersSinceChange);

  return { staticRelationships, dynamicRelationships, untrackedPairs };
}

export function buildRelationshipEvolutionContext(analysis: RelationshipEvolutionAnalysis): string {
  const lines: string[] = [];

  // 动态关系：正在演化中的关系，附向量数据和轨迹
  if (analysis.dynamicRelationships.length > 0) {
    lines.push('【关系热力图（活跃变化中）】');
    const top = analysis.dynamicRelationships.slice(0, 4);
    for (const r of top) {
      const trajectoryLabels: Record<string, string> = {
        improving: '⬆️ 升温',
        deteriorating: '⬇️ 降温',
        oscillating: '〰️ 摇摆',
        static: '➖ 停滞',
      };
      lines.push(`- ${r.characterA}↔${r.characterB}：${trajectoryLabels[r.trajectory] ?? r.trajectory}（已${r.chaptersSinceChange === 0 ? '本章' : r.chaptersSinceChange + '章前'}发生变化）`);
      if (r.recentChanges.length > 0) {
        const last = r.recentChanges[r.recentChanges.length - 1];
        lines.push(`  最近：第${last.chapter}章「${last.change}」`);
      }
    }
    lines.push('');
  }

  if (analysis.staticRelationships.length > 0) {
    const top = analysis.staticRelationships.slice(0, 3);
    for (const r of top) {
      lines.push(`- ${r.characterA}↔${r.characterB}：已${r.chaptersSinceChange}章无互动变化`);
      if (r.recentChanges.length > 0) {
        const lastChange = r.recentChanges[r.recentChanges.length - 1];
        lines.push(`  上次变化（第${lastChange.chapter}章）：${lastChange.change}`);
      }
      lines.push(`  建议：安排新的互动事件推动关系发展`);
    }
  }

  if (analysis.untrackedPairs.length > 0) {
    const top = analysis.untrackedPairs.slice(0, 2);
    for (const p of top) {
      lines.push(`- ${p.charA}↔${p.charB}：频繁同场但关系未展开，可考虑发展互动`);
    }
  }

  return lines.join('\n');
}
