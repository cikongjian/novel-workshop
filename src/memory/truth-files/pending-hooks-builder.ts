/**
 * 待兑现伏笔视图构建器
 *
 * 从 PlotLiveState.pendingForeshadowing + OutlineData.foreshadowing
 * 构建带过期预警的伏笔列表。
 *
 * 复用 foreshadowing-tracker.ts 的 SCOPE_OVERDUE_THRESHOLDS 阈值逻辑。
 */

import type { PlotLiveState } from '../../novel/story-state-types.js';
import type { Foreshadowing } from '../../novel/types.js';
import type { PendingHooksView, PendingHookEntry } from './types.js';

// ==================== 阈值（与 foreshadowing-tracker.ts 保持一致） ====================

const SCOPE_OVERDUE_THRESHOLDS: Record<string, Record<string, number>> = {
  scene: { high: 1, medium: 2, low: 3 },
  arc: { high: 5, medium: 8, low: 12 },
  saga: { high: 15, medium: 25, low: 40 },
};

/** 当 scope 未指定时的默认推断 */
const DEFAULT_SCOPE = 'arc';

/** 最大伏笔条目数 */
const MAX_HOOKS = 30;

/** 紧急度排序权重 */
const URGENCY_RANK: Record<string, number> = { critical: 3, warning: 2, normal: 1 };
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

// ==================== 内部函数 ====================

function inferScope(
  f: { scope?: string; priority?: string; plantedInChapter?: number },
  plotThreadCount: number,
): 'scene' | 'arc' | 'saga' {
  if (f.scope && SCOPE_OVERDUE_THRESHOLDS[f.scope]) {
    return f.scope as 'scene' | 'arc' | 'saga';
  }
  if (plotThreadCount >= 2) return 'saga';
  if (f.priority === 'high' && (f.plantedInChapter ?? 0) <= 3) return 'arc';
  return DEFAULT_SCOPE as 'scene' | 'arc' | 'saga';
}

function computeUrgency(
  chaptersElapsed: number,
  scope: string,
  priority: string,
): { urgency: 'critical' | 'warning' | 'normal'; isOverdue: boolean; chaptersUntilOverdue: number } {
  const thresholds = SCOPE_OVERDUE_THRESHOLDS[scope] ?? SCOPE_OVERDUE_THRESHOLDS.arc;
  const threshold = thresholds[priority] ?? thresholds.medium;
  const chaptersUntilOverdue = threshold - chaptersElapsed;

  if (chaptersElapsed >= threshold + 2) {
    return { urgency: 'critical', isOverdue: true, chaptersUntilOverdue };
  }
  if (chaptersElapsed >= threshold) {
    return { urgency: 'warning', isOverdue: true, chaptersUntilOverdue };
  }
  return { urgency: 'normal', isOverdue: false, chaptersUntilOverdue };
}

function sortHooks(hooks: PendingHookEntry[]): PendingHookEntry[] {
  return hooks.sort((a, b) => {
    // 紧急度高的优先
    const urgDiff = (URGENCY_RANK[b.urgency] ?? 0) - (URGENCY_RANK[a.urgency] ?? 0);
    if (urgDiff !== 0) return urgDiff;
    // 同紧急度按优先级
    const priDiff = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
    if (priDiff !== 0) return priDiff;
    // 同优先级按已过章节数倒序
    return b.chaptersElapsed - a.chaptersElapsed;
  });
}

// ==================== 导出 ====================

/**
 * 从 PlotLiveState + OutlineData.foreshadowing 构建待兑现伏笔视图
 *
 * @param plotState - 最新的 PlotLiveState（来自 StoryStateSnapshot）
 * @param outlineForeshadowing - 大纲中的伏笔列表
 * @param currentChapter - 当前章节号
 */
export function buildPendingHooksView(
  plotState: PlotLiveState | null,
  outlineForeshadowing: Foreshadowing[],
  currentChapter: number,
): PendingHooksView {
  const hookMap = new Map<string, PendingHookEntry>();

  // 1. 从 plotState.pendingForeshadowing 收集（实时数据，优先）
  if (plotState?.pendingForeshadowing) {
    const activeThreadCount = plotState.activeThreads?.length ?? 0;

    for (const pf of plotState.pendingForeshadowing) {
      const scope = inferScope(
        { scope: pf.scope, priority: pf.urgency, plantedInChapter: pf.plantedInChapter },
        activeThreadCount,
      );
      const priority = pf.urgency === 'overdue' ? 'high' : (pf.urgency as 'high' | 'medium' | 'low');
      const chaptersElapsed = currentChapter - pf.plantedInChapter;
      const { urgency, isOverdue, chaptersUntilOverdue } = computeUrgency(chaptersElapsed, scope, priority);

      const key = pf.hint.trim().toLowerCase().replace(/[，。！？、；：""''（）\s]+/g, '');
      hookMap.set(key, {
        hint: pf.hint,
        plantedInChapter: pf.plantedInChapter,
        scope,
        priority,
        chaptersElapsed,
        chaptersUntilOverdue,
        urgency,
        isOverdue,
      });
    }
  }

  // 2. 从大纲伏笔补充未解决的条目
  for (const f of outlineForeshadowing) {
    if (f.isResolved) continue;
    if (f.plantedInChapter > currentChapter) continue;

    const key = f.hint.trim().toLowerCase().replace(/[，。！？、；：""''（）\s]+/g, '');
    if (hookMap.has(key)) continue; // 已有实时数据，不覆盖

    const scope = inferScope(
      { scope: f.scope, priority: f.priority, plantedInChapter: f.plantedInChapter },
      f.relatedPlotThreads?.length ?? 0,
    );
    const chaptersElapsed = currentChapter - f.plantedInChapter;
    const { urgency, isOverdue, chaptersUntilOverdue } = computeUrgency(chaptersElapsed, scope, f.priority);

    hookMap.set(key, {
      hint: f.hint,
      plantedInChapter: f.plantedInChapter,
      scope,
      priority: f.priority,
      chaptersElapsed,
      chaptersUntilOverdue,
      urgency,
      isOverdue,
    });
  }

  const hooks = sortHooks([...hookMap.values()]).slice(0, MAX_HOOKS);
  const stats = {
    total: hooks.length,
    critical: hooks.filter(h => h.urgency === 'critical').length,
    warning: hooks.filter(h => h.urgency === 'warning').length,
    normal: hooks.filter(h => h.urgency === 'normal').length,
  };

  return {
    currentChapter,
    hooks,
    stats,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 将 PendingHooksView 渲染为 prompt 注入文本
 */
export function renderPendingHooksContext(view: PendingHooksView): string {
  if (view.hooks.length === 0) return '';

  const lines: string[] = [
    `【伏笔债务看板 · 共${view.stats.total}项】`,
  ];

  if (view.stats.critical > 0) {
    lines.push(`⚠ ${view.stats.critical}项紧急 / ${view.stats.warning}项预警`);
  }

  for (const h of view.hooks) {
    const tag = h.urgency === 'critical' ? '紧急' : h.urgency === 'warning' ? '预警' : '正常';
    const overdueStr = h.isOverdue
      ? `已超期${Math.abs(h.chaptersUntilOverdue)}章`
      : `余${h.chaptersUntilOverdue}章`;
    lines.push(`  [${tag}][${h.scope}/${h.priority}] "${h.hint}" (第${h.plantedInChapter}章埋设，${overdueStr})`);
  }

  return lines.join('\n');
}
