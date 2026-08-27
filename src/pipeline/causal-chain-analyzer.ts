import type { CausalChainEntry } from '../novel/story-state-types.js';

export type CausalChainPriority = {
  chain: CausalChainEntry;
  /** Urgency score 0-100 (higher = more urgent to resolve) */
  urgencyScore: number;
  /** Chapters since cause occurred */
  chaptersElapsed: number;
  /** Number of pending effects */
  pendingCount: number;
  /** Priority tier */
  tier: 'critical' | 'high' | 'medium' | 'low';
};

/**
 * Score and prioritize pending causal chains.
 * Factors:
 * - chaptersElapsed: longer wait = higher urgency
 * - pendingCount: more pending effects = higher urgency
 * - ratio of resolved vs pending: mostly resolved chains need final closure
 */
export function prioritizeCausalChains(
  chains: CausalChainEntry[],
  currentChapter: number,
): CausalChainPriority[] {
  const pending = chains.filter(c => c.pendingEffects.length > 0);

  return pending.map(chain => {
    const chaptersElapsed = currentChapter - chain.causeChapter;
    const pendingCount = chain.pendingEffects.length;
    const resolvedCount = chain.resolvedEffects.length;
    const totalEffects = pendingCount + resolvedCount;

    // Base score from elapsed time (0-40 points)
    const timeScore = Math.min(40, chaptersElapsed * 4);

    // Pending effects count (0-30 points)
    const countScore = Math.min(30, pendingCount * 10);

    // Completion ratio bonus: if most effects resolved, the remaining ones are urgent (0-30 points)
    const completionRatio = totalEffects > 0 ? resolvedCount / totalEffects : 0;
    const completionScore = Math.round(completionRatio * 30);

    const urgencyScore = Math.min(100, timeScore + countScore + completionScore);

    const tier: CausalChainPriority['tier'] =
      urgencyScore >= 75 ? 'critical' :
      urgencyScore >= 50 ? 'high' :
      urgencyScore >= 25 ? 'medium' : 'low';

    return { chain, urgencyScore, chaptersElapsed, pendingCount, tier };
  }).sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Build Writer-injectable context for top-priority causal chains.
 * Only includes critical and high priority chains to avoid context bloat.
 */
export function buildCausalChainContext(
  priorities: CausalChainPriority[],
  maxItems: number = 5,
): string {
  const actionable = priorities.filter(p => p.tier === 'critical' || p.tier === 'high');
  if (actionable.length === 0) return '';

  const selected = actionable.slice(0, maxItems);
  const lines: string[] = [];

  for (const p of selected) {
    const tierLabel = p.tier === 'critical' ? '[紧急]' : '[重要]';
    lines.push(`- ${tierLabel} 第${p.chain.causeChapter}章「${p.chain.cause}」（已过${p.chaptersElapsed}章）`);
    lines.push(`  待兑现：${p.chain.pendingEffects.join('、')}`);
    if (p.chain.resolvedEffects.length > 0) {
      lines.push(`  已兑现：${p.chain.resolvedEffects.join('、')}`);
    }
  }

  return lines.join('\n');
}
