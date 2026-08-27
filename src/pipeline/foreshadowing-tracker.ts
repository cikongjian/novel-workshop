import type { Foreshadowing } from '../novel/types.js';

/** 按范围+优先级的逾期阈值（章节数） */
const SCOPE_OVERDUE_THRESHOLDS: Record<string, Record<string, number>> = {
  scene: { high: 1, medium: 2, low: 3 },
  arc: { high: 5, medium: 8, low: 12 },
  saga: { high: 15, medium: 25, low: 40 },
};

const MAX_OVERDUE_ITEMS = 24;

const PRIORITY_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export type ForeshadowingStatus = {
  item: Foreshadowing;
  chaptersElapsed: number;
  isOverdue: boolean;
  urgency: 'critical' | 'warning' | 'normal';
  scope: 'scene' | 'arc' | 'saga';
};

export type ForeshadowingAnalysis = {
  overdue: ForeshadowingStatus[];
  active: ForeshadowingStatus[];
  resolved: Foreshadowing[];
};

function normalizeForeshadowingHint(hint: string): string {
  return hint
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？：；、"""'''（）()《》【】\[\]—\-·,.!?;:]/g, '');
}

function isResolvedAtCurrentChapter(item: Foreshadowing, currentChapter: number): boolean {
  if (item.isResolved) return true;
  if (typeof item.resolvedInChapter === 'number' && item.resolvedInChapter > 0) {
    return item.resolvedInChapter <= currentChapter;
  }
  return false;
}

function pickBetterUnresolved(
  a: Foreshadowing,
  b: Foreshadowing,
  currentChapter: number,
): Foreshadowing {
  const aPriority = PRIORITY_RANK[a.priority];
  const bPriority = PRIORITY_RANK[b.priority];
  if (aPriority !== bPriority) {
    return aPriority > bPriority ? a : b;
  }

  const aElapsed = currentChapter - a.plantedInChapter;
  const bElapsed = currentChapter - b.plantedInChapter;
  if (aElapsed !== bElapsed) {
    return aElapsed > bElapsed ? a : b;
  }

  const aHasResolution = Boolean(a.resolution?.trim());
  const bHasResolution = Boolean(b.resolution?.trim());
  if (aHasResolution !== bHasResolution) {
    return aHasResolution ? a : b;
  }

  return a.id < b.id ? a : b;
}

function getUrgencyRank(urgency: ForeshadowingStatus['urgency']): number {
  if (urgency === 'critical') return 3;
  if (urgency === 'warning') return 2;
  return 1;
}

/**
 * 当伏笔未显式标注 scope 时，根据上下文推断范围
 */
function inferScope(item: Foreshadowing, _currentChapter: number): 'scene' | 'arc' | 'saga' {
  // If related to multiple plot threads, likely saga-level
  if (item.relatedPlotThreads.length >= 2) return 'saga';
  // If high priority and planted early, likely arc-level
  if (item.priority === 'high' && item.plantedInChapter <= 3) return 'arc';
  // Default to arc
  return 'arc';
}

/**
 * 分析伏笔状态，检测逾期伏笔
 */
export function analyzeForeshadowing(params: {
  foreshadowing: Foreshadowing[];
  currentChapter: number;
  thresholds?: Record<string, number>;
}): ForeshadowingAnalysis {
  const { foreshadowing, currentChapter } = params;
  if (currentChapter <= 0) {
    return { overdue: [], active: [], resolved: foreshadowing.filter(f => f.isResolved) };
  }

  const resolved = foreshadowing.filter(f => isResolvedAtCurrentChapter(f, currentChapter));
  const resolvedKeySet = new Set(
    resolved
      .map(item => normalizeForeshadowingHint(item.hint))
      .filter(Boolean),
  );

  const unresolvedByKey = new Map<string, Foreshadowing>();
  for (const item of foreshadowing) {
    if (isResolvedAtCurrentChapter(item, currentChapter)) continue;
    if (item.plantedInChapter <= 0 || item.plantedInChapter > currentChapter) continue;

    const key = normalizeForeshadowingHint(item.hint) || item.id;
    if (resolvedKeySet.has(key)) continue;

    const existing = unresolvedByKey.get(key);
    if (!existing) {
      unresolvedByKey.set(key, item);
      continue;
    }
    unresolvedByKey.set(key, pickBetterUnresolved(existing, item, currentChapter));
  }

  const statuses: ForeshadowingStatus[] = Array.from(unresolvedByKey.values()).map(item => {
    const elapsed = currentChapter - item.plantedInChapter;
    const scope = item.scope ?? inferScope(item, currentChapter);
    const scopeThresholds = SCOPE_OVERDUE_THRESHOLDS[scope] ?? SCOPE_OVERDUE_THRESHOLDS.arc;
    const threshold = scopeThresholds[item.priority] ?? scopeThresholds.medium;
    const isOverdue = elapsed >= threshold;
    const urgency: ForeshadowingStatus['urgency'] =
      elapsed >= threshold + 2 ? 'critical'
      : isOverdue ? 'warning'
      : 'normal';
    return { item, chaptersElapsed: elapsed, isOverdue, urgency, scope };
  });

  const overdue = statuses
    .filter(s => s.isOverdue)
    .sort((a, b) => {
      const urgencyDiff = getUrgencyRank(b.urgency) - getUrgencyRank(a.urgency);
      if (urgencyDiff !== 0) return urgencyDiff;

      const priorityDiff = PRIORITY_RANK[b.item.priority] - PRIORITY_RANK[a.item.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return b.chaptersElapsed - a.chaptersElapsed;
    })
    .slice(0, MAX_OVERDUE_ITEMS);

  const active = statuses
    .filter(s => !s.isOverdue)
    .sort((a, b) => {
      const priorityDiff = PRIORITY_RANK[b.item.priority] - PRIORITY_RANK[a.item.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.chaptersElapsed - a.chaptersElapsed;
    });

  return {
    overdue,
    active,
    resolved,
  };
}

/**
 * 构建逾期伏笔的 Writer 上下文提示
 */
export function buildForeshadowingContextHints(overdue: ForeshadowingStatus[]): string {
  if (overdue.length === 0) return '';
  const scopeLabel: Record<string, string> = { scene: '短线', arc: '中线', saga: '长线' };
  const lines = ['以下伏笔已逾期未回收，请在本章自然推进或回收：'];
  for (const s of overdue) {
    const urgencyLabel = s.urgency === 'critical' ? '[紧急]' : '[逾期]';
    const sl = scopeLabel[s.scope] ?? '中线';
    lines.push(`- ${urgencyLabel}[${sl}]（已过 ${s.chaptersElapsed} 章）：${s.item.hint}`);
    if (s.item.resolution) {
      lines.push(`  预期回收方式：${s.item.resolution}`);
    }
  }
  return lines.join('\n');
}
