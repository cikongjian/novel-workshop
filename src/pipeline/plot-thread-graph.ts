import type { PlotThread } from '../novel/types.js';

export type ThreadRelation = {
  threadId: string;
  threadName: string;
  status: string;
  prerequisites: string[];
  parallelThreads: string[];
  mergeTarget?: string;
};

export type ThreadGraphAnalysis = {
  /** Threads whose prerequisites are all resolved — ready to advance */
  readyToAdvance: ThreadRelation[];
  /** Threads blocked by unresolved prerequisites */
  blocked: Array<ThreadRelation & { blockedBy: string[] }>;
  /** Parallel thread groups that should advance together */
  parallelGroups: string[][];
  /** Threads approaching merge point (merge target is in climax/resolved) */
  convergingThreads: Array<{ thread: ThreadRelation; mergeTargetName: string }>;
};

const RESOLVED_STATUSES = new Set(['resolved', 'abandoned']);

function toRelation(t: PlotThread): ThreadRelation {
  return {
    threadId: t.id,
    threadName: t.name,
    status: t.status,
    prerequisites: t.prerequisites ?? [],
    parallelThreads: t.parallelThreads ?? [],
    mergeTarget: t.mergeTarget,
  };
}

/**
 * Analyze dependency graph among plot threads.
 * Only non-resolved threads are considered for readyToAdvance / blocked.
 */
export function analyzeThreadGraph(threads: PlotThread[]): ThreadGraphAnalysis {
  const byId = new Map(threads.map(t => [t.id, t]));

  const readyToAdvance: ThreadRelation[] = [];
  const blocked: Array<ThreadRelation & { blockedBy: string[] }> = [];
  const convergingThreads: Array<{ thread: ThreadRelation; mergeTargetName: string }> = [];

  for (const t of threads) {
    if (RESOLVED_STATUSES.has(t.status)) continue;

    const rel = toRelation(t);
    const prereqs = t.prerequisites ?? [];

    if (prereqs.length > 0) {
      const blockers = prereqs.filter(pid => {
        const dep = byId.get(pid);
        return dep && !RESOLVED_STATUSES.has(dep.status);
      });
      if (blockers.length > 0) {
        const blockedByNames = blockers.map(pid => byId.get(pid)?.name ?? pid);
        blocked.push({ ...rel, blockedBy: blockedByNames });
      } else {
        readyToAdvance.push(rel);
      }
    } else {
      readyToAdvance.push(rel);
    }

    // Detect converging: merge target is in climax or resolved
    if (t.mergeTarget) {
      const target = byId.get(t.mergeTarget);
      if (target && (target.status === 'climax' || target.status === 'resolved')) {
        convergingThreads.push({
          thread: rel,
          mergeTargetName: target.name,
        });
      }
    }
  }

  // Build parallel groups via union-find
  const parallelGroups = buildParallelGroups(threads);

  return { readyToAdvance, blocked, parallelGroups, convergingThreads };
}

function buildParallelGroups(threads: PlotThread[]): string[][] {
  const activeIds = new Set(
    threads.filter(t => !RESOLVED_STATUSES.has(t.status)).map(t => t.id),
  );
  const parent = new Map<string, string>();

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const id of activeIds) parent.set(id, id);

  const nameById = new Map(threads.map(t => [t.id, t.name]));

  for (const t of threads) {
    if (!activeIds.has(t.id)) continue;
    for (const pid of t.parallelThreads ?? []) {
      if (activeIds.has(pid)) union(t.id, pid);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of activeIds) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(nameById.get(id) ?? id);
  }

  return [...groups.values()].filter(g => g.length > 1);
}

/**
 * Build a Writer-injectable context string from thread graph analysis.
 * Returns empty string if there is nothing noteworthy.
 */
export function buildThreadGraphContext(analysis: ThreadGraphAnalysis): string {
  const lines: string[] = [];

  if (analysis.readyToAdvance.length > 0) {
    lines.push('### 可推进的情节线');
    for (const t of analysis.readyToAdvance) {
      lines.push(`- 「${t.threadName}」（${t.status}）— 前置条件已满足，可以推进`);
    }
  }

  if (analysis.blocked.length > 0) {
    lines.push('### 受阻情节线（前置未完成）');
    for (const t of analysis.blocked) {
      lines.push(`- 「${t.threadName}」被阻塞，需先推进：${t.blockedBy.map(n => `「${n}」`).join('、')}`);
    }
  }

  if (analysis.parallelGroups.length > 0) {
    lines.push('### 并行情节线组（建议同步推进）');
    for (const group of analysis.parallelGroups) {
      lines.push(`- ${group.map(n => `「${n}」`).join(' + ')}`);
    }
  }

  if (analysis.convergingThreads.length > 0) {
    lines.push('### 即将合流的情节线');
    for (const { thread, mergeTargetName } of analysis.convergingThreads) {
      lines.push(`- 「${thread.threadName}」即将汇入「${mergeTargetName}」— 注意铺垫合流节点`);
    }
  }

  return lines.join('\n');
}
