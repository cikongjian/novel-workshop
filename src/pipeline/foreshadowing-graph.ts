/**
 * 伏笔回收路径规划器（Foreshadowing Recovery Path Planner）
 *
 * 把伏笔系统从「被动检测逾期 → 临场选择回收」升级为「主动规划回收路径」：
 * 1. 依赖图分析：基于 prerequisites 字段构建伏笔依赖图，识别可独立回收 vs
 *    被阻塞的伏笔
 * 2. 自动路径生成：基于 scope×priority 阈值矩阵，为每条未回收伏笔规划
 *    「计划回收章节」+「回收路径描述」，让 foreshadowing-scheduler
 *    不再每次都从头选择，而是按既定路径推进
 * 3. 与 plot-thread-graph 类似的拓扑分析，但针对伏笔的"递进揭示"特性
 *    做了优化（支持层级解锁）
 *
 * 设计目标：
 * - 纯本地推理，无 LLM 调用
 * - 幂等：重复规划不会反复 bump planVersion
 * - 尊重作者手动设置的 plannedResolveChapter（不覆盖非零值）
 */

import type { Foreshadowing } from '../novel/types.js';
import { analyzeForeshadowing } from './foreshadowing-tracker.js';

// ─── 类型定义 ────────────────────────────────────────────────────────

export interface ForeshadowingGraphNode {
  id: string;
  hint: string;
  scope: 'scene' | 'arc' | 'saga';
  priority: 'high' | 'medium' | 'low';
  plantedInChapter: number;
  plannedResolveChapter?: number;
  prerequisites: string[];
  isResolved: boolean;
  isOverdue: boolean;
  /** 是否被前置伏笔阻塞 */
  isBlocked: boolean;
  /** 阻塞它的前置伏笔ID列表 */
  blockedBy: string[];
}

export interface ForeshadowingGraphAnalysis {
  /** 拓扑层级分组：layer 0 = 无前置，layer N = 前置最大层级为 N-1 */
  layered: ForeshadowingGraphNode[][];
  /** 当前可以回收（无阻塞 + 未回收） */
  readyToResolve: ForeshadowingGraphNode[];
  /** 被阻塞的伏笔 */
  blocked: ForeshadowingGraphNode[];
  /** 已回收的伏笔 */
  resolved: ForeshadowingGraphNode[];
  /** 逾期且未被规划回收章节的伏笔（需立即关注） */
  unplannedOverdue: ForeshadowingGraphNode[];
  /** 即将到期的规划伏笔（plannedResolveChapter - currentChapter <= 2） */
  upcomingPlanned: ForeshadowingGraphNode[];
}

export interface PlannerOptions {
  currentChapter: number;
  /** 总章节预算（用于规划长线伏笔回收章节），默认 100 */
  totalChapterBudget?: number;
  /** 已规划伏笔是否需要重新规划（默认 false，仅规划未规划的） */
  forceReplan?: boolean;
}

export interface PlannedForeshadowing {
  id: string;
  plannedResolveChapter: number;
  recoveryPath: string;
  prerequisites: string[];
  planVersion: number;
}

// ─── 阈值配置 ────────────────────────────────────────────────────────

/** 各 scope×priority 的目标回收窗口（章节数） */
const RECOVERY_WINDOW: Record<string, Record<string, number>> = {
  scene: { high: 1, medium: 2, low: 3 },
  arc:   { high: 5, medium: 8, low: 12 },
  saga:  { high: 15, medium: 25, low: 40 },
};

/** 默认总章节预算 */
const DEFAULT_TOTAL_BUDGET = 100;

/** 长线伏笔的回收章节上限（不超过总预算的 90%） */
const SAGA_BUDGET_RATIO = 0.9;

// ─── 辅助函数 ────────────────────────────────────────────────────────

function inferScope(item: Foreshadowing): 'scene' | 'arc' | 'saga' {
  if (item.scope) return item.scope;
  if (item.relatedPlotThreads.length >= 2) return 'saga';
  if (item.priority === 'high' && item.plantedInChapter <= 3) return 'arc';
  return 'arc';
}

function isResolvedItem(item: Foreshadowing, currentChapter: number): boolean {
  if (item.isResolved) return true;
  if (typeof item.resolvedInChapter === 'number' && item.resolvedInChapter > 0) {
    return item.resolvedInChapter <= currentChapter;
  }
  return false;
}

function isOverdueItem(item: Foreshadowing, currentChapter: number): boolean {
  const scope = inferScope(item);
  const threshold = RECOVERY_WINDOW[scope]?.[item.priority] ?? RECOVERY_WINDOW.arc.medium;
  return currentChapter - item.plantedInChapter >= threshold;
}

// ─── 拓扑分层（Kahn 算法变体） ────────────────────────────────────────

/**
 * 基于 prerequisites 字段对未回收伏笔做拓扑分层。
 * layer 0 = 无前置或前置已全部回收
 * layer N = 前置最大层级为 N-1
 *
 * 已回收的伏笔不参与分层（视为已解锁的基础）。
 * 返回 (node, layer) 二元组列表。
 */
function topologicalLayering(
  unresolved: Foreshadowing[],
  resolvedIds: Set<string>,
): Array<{ node: ForeshadowingGraphNode; layer: number }> {
  const byId = new Map(unresolved.map(f => [f.id, f]));
  const layerCache = new Map<string, number>();

  function getLayer(id: string, visiting: Set<string>): number {
    if (layerCache.has(id)) return layerCache.get(id)!;
    const item = byId.get(id);
    if (!item) return 0;

    // 防止循环依赖
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const prereqs = item.prerequisites ?? [];
    if (prereqs.length === 0) {
      layerCache.set(id, 0);
      return 0;
    }

    let maxPrereqLayer = -1;
    for (const pid of prereqs) {
      // 前置已回收 → 视为 -1（不阻塞）
      if (resolvedIds.has(pid)) continue;
      const prereqItem = byId.get(pid);
      if (!prereqItem) continue;
      const prereqLayer = getLayer(pid, visiting);
      if (prereqLayer > maxPrereqLayer) maxPrereqLayer = prereqLayer;
    }

    const layer = maxPrereqLayer + 1;
    layerCache.set(id, layer);
    return layer;
  }

  return unresolved.map(item => {
    const layer = getLayer(item.id, new Set());
    const prereqs = item.prerequisites ?? [];
    const blockedBy = prereqs.filter(pid => {
      if (resolvedIds.has(pid)) return false;
      return byId.has(pid);
    });
    const node: ForeshadowingGraphNode = {
      id: item.id,
      hint: item.hint,
      scope: inferScope(item),
      priority: item.priority,
      plantedInChapter: item.plantedInChapter,
      plannedResolveChapter: item.plannedResolveChapter,
      prerequisites: prereqs,
      isResolved: false,
      isOverdue: false, // 后面用 tracker 结果覆盖
      isBlocked: blockedBy.length > 0,
      blockedBy,
    };
    return { node, layer };
  });
}

// ─── 主分析函数 ──────────────────────────────────────────────────────

export function analyzeForeshadowingGraph(params: {
  foreshadowing: Foreshadowing[];
  currentChapter: number;
}): ForeshadowingGraphAnalysis {
  const { foreshadowing, currentChapter } = params;

  const resolvedItems = foreshadowing.filter(f => isResolvedItem(f, currentChapter));
  const resolvedIds = new Set(resolvedItems.map(f => f.id));
  const unresolved = foreshadowing.filter(f => !isResolvedItem(f, currentChapter));

  // 用 foreshadowing-tracker 获取逾期状态（复用现有逻辑）
  const trackerAnalysis = analyzeForeshadowing({ foreshadowing, currentChapter });
  const overdueIds = new Set(trackerAnalysis.overdue.map(s => s.item.id));

  // 拓扑分层（同时返回 node 和 layer）
  const layeredNodes = topologicalLayering(unresolved, resolvedIds);

  // 把逾期状态填回 node
  for (const { node } of layeredNodes) {
    node.isOverdue = overdueIds.has(node.id);
  }

  // 按层级分组
  const layerMap = new Map<number, ForeshadowingGraphNode[]>();
  for (const { node, layer } of layeredNodes) {
    if (!layerMap.has(layer)) layerMap.set(layer, []);
    layerMap.get(layer)!.push(node);
  }
  const layered = [...layerMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => group);

  const allNodes = layeredNodes.map(x => x.node);
  const readyToResolve = allNodes.filter(n => !n.isBlocked);
  const blocked = allNodes.filter(n => n.isBlocked);
  const resolved = resolvedItems.map(item => ({
    id: item.id,
    hint: item.hint,
    scope: inferScope(item),
    priority: item.priority,
    plantedInChapter: item.plantedInChapter,
    plannedResolveChapter: item.plannedResolveChapter,
    prerequisites: item.prerequisites ?? [],
    isResolved: true,
    isOverdue: false,
    isBlocked: false,
    blockedBy: [],
  }));

  const unplannedOverdue = allNodes.filter(
    n => n.isOverdue && (n.plannedResolveChapter === undefined || n.plannedResolveChapter <= 0),
  );

  const upcomingPlanned = allNodes.filter(n => {
    if (n.plannedResolveChapter === undefined || n.plannedResolveChapter <= 0) return false;
    const remaining = n.plannedResolveChapter - currentChapter;
    return remaining >= 0 && remaining <= 2;
  });

  return {
    layered,
    readyToResolve,
    blocked,
    resolved,
    unplannedOverdue,
    upcomingPlanned,
  };
}

// ─── 路径规划器 ───────────────────────────────────────────────────────

/**
 * 为未规划或需要重新规划的伏笔生成回收路径。
 *
 * 策略：
 * - 优先级 high → 尽早回收（在窗口内偏前）
 * - 优先级 low → 推迟到窗口末尾
 * - saga 类伏笔受总章节预算限制
 * - 被前置阻塞的伏笔回收章节不能早于前置的回收章节
 *
 * 幂等性：
 * - 默认不覆盖已规划（plannedResolveChapter > 0）的伏笔
 * - forceReplan=true 时强制重规划，planVersion +1
 */
export function planRecoveryPaths(
  foreshadowing: Foreshadowing[],
  options: PlannerOptions,
): PlannedForeshadowing[] {
  const { currentChapter } = options;
  const totalBudget = options.totalChapterBudget ?? DEFAULT_TOTAL_BUDGET;
  const forceReplan = options.forceReplan ?? false;
  const sagaMaxChapter = Math.floor(totalBudget * SAGA_BUDGET_RATIO);

  const analysis = analyzeForeshadowingGraph({ foreshadowing, currentChapter });
  const byId = new Map(foreshadowing.map(f => [f.id, f]));
  const plannedMap = new Map<string, PlannedForeshadowing>();

  // 第一遍：为每条未回收伏笔计算基础回收章节
  for (const node of analysis.readyToResolve) {
    const item = byId.get(node.id);
    if (!item) continue;
    if (isResolvedItem(item, currentChapter)) continue;

    // 已规划且非强制重规划 → 跳过
    if (!forceReplan && item.plannedResolveChapter && item.plannedResolveChapter > 0) {
      plannedMap.set(node.id, {
        id: node.id,
        plannedResolveChapter: item.plannedResolveChapter,
        recoveryPath: item.recoveryPath || '',
        prerequisites: item.prerequisites ?? [],
        planVersion: item.planVersion ?? 0,
      });
      continue;
    }

    const scope = node.scope;
    const window = RECOVERY_WINDOW[scope]?.[node.priority] ?? RECOVERY_WINDOW.arc.medium;
    // 优先级 high → 窗口内偏前（+0~+1），medium → 中间，low → 末尾
    const offset = node.priority === 'high' ? 0
      : node.priority === 'medium' ? Math.floor(window / 2)
      : window - 1;

    let planned = currentChapter + Math.max(1, offset);

    // saga 受总预算限制
    if (scope === 'saga' && planned > sagaMaxChapter) {
      planned = sagaMaxChapter;
    }

    plannedMap.set(node.id, {
      id: node.id,
      plannedResolveChapter: planned,
      recoveryPath: buildRecoveryPathDescription(item, scope),
      prerequisites: item.prerequisites ?? [],
      planVersion: (item.planVersion ?? 0) + 1,
    });
  }

  // 第二遍：被阻塞的伏笔，回收章节必须晚于所有前置的回收章节
  for (const node of analysis.blocked) {
    const item = byId.get(node.id);
    if (!item) continue;
    if (isResolvedItem(item, currentChapter)) continue;

    if (!forceReplan && item.plannedResolveChapter && item.plannedResolveChapter > 0) {
      plannedMap.set(node.id, {
        id: node.id,
        plannedResolveChapter: item.plannedResolveChapter,
        recoveryPath: item.recoveryPath || '',
        prerequisites: item.prerequisites ?? [],
        planVersion: item.planVersion ?? 0,
      });
      continue;
    }

    // 找出所有前置的回收章节最大值
    let minChapter = currentChapter + 1;
    for (const pid of node.blockedBy) {
      const planned = plannedMap.get(pid);
      if (planned && planned.plannedResolveChapter > minChapter) {
        minChapter = planned.plannedResolveChapter + 1;
      }
    }

    const scope = node.scope;
    const window = RECOVERY_WINDOW[scope]?.[node.priority] ?? RECOVERY_WINDOW.arc.medium;
    let planned = Math.max(minChapter, currentChapter + 1);

    // 加上本伏笔的优先级偏移
    const offset = node.priority === 'high' ? 0
      : node.priority === 'medium' ? Math.floor(window / 2)
      : window - 1;
    planned += offset;

    if (scope === 'saga' && planned > sagaMaxChapter) {
      planned = sagaMaxChapter;
    }

    plannedMap.set(node.id, {
      id: node.id,
      plannedResolveChapter: planned,
      recoveryPath: buildRecoveryPathDescription(item, scope),
      prerequisites: item.prerequisites ?? [],
      planVersion: (item.planVersion ?? 0) + 1,
    });
  }

  return Array.from(plannedMap.values());
}

function buildRecoveryPathDescription(
  item: Foreshadowing,
  scope: 'scene' | 'arc' | 'saga',
): string {
  const parts: string[] = [];
  const scopeLabel = scope === 'scene' ? '短线' : scope === 'arc' ? '中线' : '长线';
  parts.push(`${scopeLabel}伏笔`);

  if (item.relatedPlotThreads.length > 0) {
    parts.push(`关联${item.relatedPlotThreads.length}条情节线`);
  }

  if (item.priority === 'high') {
    parts.push('高优先级需尽早回收');
  } else if (item.priority === 'low') {
    parts.push('可延后回收');
  }

  if (item.resolution) {
    parts.push(`预期方式：${item.resolution}`);
  }

  return parts.join('，');
}

// ─── Writer 上下文构建 ────────────────────────────────────────────────

/**
 * 构建伏笔路径规划上下文，注入 Writer / foreshadowing-scheduler。
 *
 * 包含：
 * - 本章应回收的伏笔（plannedResolveChapter == currentChapter）
 * - 即将到期需提前布局的伏笔（差 1-2 章）
 * - 被阻塞的伏笔及其前置（提示作者推进前置伏笔）
 * - 逾期且未规划的伏笔（紧急提醒）
 */
export function buildForeshadowingGraphContext(
  analysis: ForeshadowingGraphAnalysis,
  currentChapter: number,
): string {
  const lines: string[] = [];

  // 本章应回收
  const dueThisChapter = analysis.readyToResolve.filter(
    n => n.plannedResolveChapter === currentChapter,
  );
  if (dueThisChapter.length > 0) {
    lines.push('### 本章应回收的伏笔（按规划路径）');
    for (const n of dueThisChapter) {
      lines.push(`- [${n.scope}/${n.priority}] ${n.hint}`);
      if (n.plannedResolveChapter) {
        lines.push(`  计划回收：第${n.plannedResolveChapter}章`);
      }
    }
  }

  // 即将到期
  if (analysis.upcomingPlanned.length > 0) {
    lines.push('### 即将到期（提前布局铺垫）');
    for (const n of analysis.upcomingPlanned) {
      const remaining = (n.plannedResolveChapter ?? 0) - currentChapter;
      lines.push(`- ${n.hint}（第${n.plannedResolveChapter}章回收，剩${remaining}章）`);
    }
  }

  // 被阻塞
  if (analysis.blocked.length > 0) {
    lines.push('### 受阻伏笔（需先回收前置）');
    for (const n of analysis.blocked) {
      lines.push(`- ${n.hint} — 阻塞于 ${n.blockedBy.length} 条前置伏笔`);
    }
  }

  // 逾期未规划
  if (analysis.unplannedOverdue.length > 0) {
    lines.push('### 逾期且未规划（紧急）');
    for (const n of analysis.unplannedOverdue) {
      lines.push(`- [紧急] ${n.hint}`);
    }
  }

  return lines.join('\n');
}
