/**
 * 伏笔密度与健康度诊断器（Foreshadowing Density & Health Diagnoser）
 *
 * 从全局视角评估伏笔系统的"生态健康度"：
 * 1. 伏笔密度：每 N 章新增/回收的伏笔数量是否合理
 * 2. 回收率：已回收 / 已埋下 的比率，过低说明伏笔堆积
 * 3. 回温曲线：伏笔从埋下到回收之间的"提及/铺垫"次数是否足够
 * 4. 撞车检测：同一章规划回收的伏笔是否过多
 *
 * 设计目标：
 * - 纯本地推理，无 LLM 调用
 * - 输出为诊断报告 + Writer 可读的建议
 * - 幂等：相同输入产生相同输出
 */

import type { Foreshadowing } from '../novel/types.js';
import { analyzeForeshadowing } from './foreshadowing-tracker.js';

// ─── 常量 ────────────────────────────────────────────────────────────

/** 每章伏笔密度建议范围 */
const DENSITY_HEALTHY_MIN = 0.5; // 平均至少每 2 章 1 条新伏笔
const DENSITY_HEALTHY_MAX = 3.0; // 每章不超过 3 条新伏笔

/** 回收率健康阈值 */
const RESOLUTION_RATE_HEALTHY = 0.4; // 至少 40% 的已到期伏笔应被回收

/** 单章回收伏笔建议上限 */
const RESOLVE_PER_CHAPTER_SOFT = 2; // 每章回收 2 条以内为佳
const RESOLVE_PER_CHAPTER_HARD = 4; // 超过 4 条为撞车

// ─── 类型定义 ────────────────────────────────────────────────────────

export interface ForeshadowingDensityReport {
  /** 已埋下伏笔总数 */
  totalPlanted: number;
  /** 已回收伏笔总数 */
  totalResolved: number;
  /** 当前活跃（未回收）伏笔数 */
  totalActive: number;
  /** 回收率 (0~1) */
  resolutionRate: number;
  /** 每章平均新增伏笔数 */
  avgPlantedPerChapter: number;
  /** 每章平均回收伏笔数 */
  avgResolvedPerChapter: number;
  /** 伏笔密度是否健康 */
  densityHealth: 'healthy' | 'sparse' | 'dense' | 'unknown';
  /** 回收率是否健康 */
  resolutionHealth: 'healthy' | 'low' | 'critical' | 'unknown';
  /** 检测到的撞车章节（规划回收过多） */
  collisionChapters: CollisionChapter[];
  /** 缺少回温的伏笔（埋下后从未被提及） */
  coldForeshadowing: ColdForeshadowing[];
  /** 诊断建议（供 Writer 参考） */
  suggestions: string[];
}

export interface CollisionChapter {
  chapterNumber: number;
  plannedCount: number;
  hints: string[];
}

export interface ColdForeshadowing {
  id: string;
  hint: string;
  plantedInChapter: number;
  chaptersSincePlanted: number;
  scope: 'scene' | 'arc' | 'saga';
  priority: 'high' | 'medium' | 'low';
}

// ─── 主诊断函数 ────────────────────────────────────────────────────────

/**
 * 诊断伏笔系统的全局健康度。
 *
 * @param foreshadowing 全部伏笔列表
 * @param currentChapter 当前章节号
 * @param totalChapters 小说总章节预算（用于计算密度）
 */
export function diagnoseForeshadowingHealth(params: {
  foreshadowing: Foreshadowing[];
  currentChapter: number;
  totalChapters?: number;
}): ForeshadowingDensityReport {
  const { foreshadowing, currentChapter } = params;
  const totalChapters = params.totalChapters ?? Math.max(currentChapter, 20);

  const totalPlanted = foreshadowing.length;
  const trackerAnalysis = analyzeForeshadowing({ foreshadowing, currentChapter });
  const totalResolved = trackerAnalysis.resolved.length;
  const totalActive = trackerAnalysis.overdue.length + trackerAnalysis.active.length;

  // 回收率：只算已到期的（plantedInChapter + window <= currentChapter）
  const dueOrPast = foreshadowing.filter(f => {
    if (f.isResolved) return true;
    if (f.resolvedInChapter && f.resolvedInChapter > 0) return true;
    // 未回收但已过窗口的也算"应回收"
    return f.plantedInChapter <= currentChapter;
  });
  const resolutionRate = dueOrPast.length > 0
    ? totalResolved / dueOrPast.length
    : 0;

  // 每章平均新增/回收
  const avgPlantedPerChapter = currentChapter > 0 ? totalPlanted / currentChapter : 0;
  const avgResolvedPerChapter = currentChapter > 0 ? totalResolved / currentChapter : 0;

  // 密度健康度
  let densityHealth: ForeshadowingDensityReport['densityHealth'] = 'unknown';
  if (currentChapter >= 5) {
    if (avgPlantedPerChapter < DENSITY_HEALTHY_MIN) {
      densityHealth = 'sparse';
    } else if (avgPlantedPerChapter > DENSITY_HEALTHY_MAX) {
      densityHealth = 'dense';
    } else {
      densityHealth = 'healthy';
    }
  }

  // 回收率健康度
  let resolutionHealth: ForeshadowingDensityReport['resolutionHealth'] = 'unknown';
  if (currentChapter >= 10 && dueOrPast.length >= 3) {
    if (resolutionRate < RESOLUTION_RATE_HEALTHY * 0.5) {
      resolutionHealth = 'critical';
    } else if (resolutionRate < RESOLUTION_RATE_HEALTHY) {
      resolutionHealth = 'low';
    } else {
      resolutionHealth = 'healthy';
    }
  }

  // 撞车检测
  const collisionChapters = detectCollisions(foreshadowing, currentChapter);

  // 回温检测（冷伏笔）
  const coldForeshadowing = detectColdForeshadowing(foreshadowing, currentChapter);

  // 生成建议
  const suggestions = buildSuggestions({
    densityHealth,
    resolutionHealth,
    resolutionRate,
    avgPlantedPerChapter,
    avgResolvedPerChapter,
    collisionChapters,
    coldForeshadowing,
    totalActive,
  });

  return {
    totalPlanted,
    totalResolved,
    totalActive,
    resolutionRate,
    avgPlantedPerChapter,
    avgResolvedPerChapter,
    densityHealth,
    resolutionHealth,
    collisionChapters,
    coldForeshadowing,
    suggestions,
  };
}

// ─── 撞车检测 ────────────────────────────────────────────────────────

function detectCollisions(
  foreshadowing: Foreshadowing[],
  _currentChapter: number,
): CollisionChapter[] {
  const byPlannedChapter = new Map<number, Foreshadowing[]>();

  for (const f of foreshadowing) {
    if (f.isResolved) continue;
    if (!f.plannedResolveChapter || f.plannedResolveChapter <= 0) continue;

    const list = byPlannedChapter.get(f.plannedResolveChapter) ?? [];
    list.push(f);
    byPlannedChapter.set(f.plannedResolveChapter, list);
  }

  const collisions: CollisionChapter[] = [];
  for (const [chapter, items] of byPlannedChapter) {
    if (items.length > RESOLVE_PER_CHAPTER_SOFT) {
      collisions.push({
        chapterNumber: chapter,
        plannedCount: items.length,
        hints: items.map(f => f.hint),
      });
    }
  }

  return collisions.sort((a, b) => b.plannedCount - a.plannedCount);
}

// ─── 冷伏笔检测 ──────────────────────────────────────────────────────

/**
 * 检测"冷伏笔"：埋下后很久没被回收，且从未在正文中被"触碰"过。
 *
 * 触碰的代理指标：伏笔有 resolution 字段（说明作者或 AI 曾考虑过如何回收），
 * 或者有 prerequisites（说明被纳入了依赖图）。
 * 如果两者都没有且超过窗口期，说明这条伏笔被"遗忘"了。
 */
function detectColdForeshadowing(
  foreshadowing: Foreshadowing[],
  currentChapter: number,
): ColdForeshadowing[] {
  const cold: ColdForeshadowing[] = [];

  for (const f of foreshadowing) {
    if (f.isResolved) continue;
    if (!f.plantedInChapter || f.plantedInChapter <= 0) continue;

    const elapsed = currentChapter - f.plantedInChapter;
    if (elapsed < 5) continue; // 5 章以内不算冷

    const scope = f.scope ?? (f.relatedPlotThreads.length >= 2 ? 'saga' : 'arc');
    const hasResolution = Boolean(f.resolution?.trim());
    const hasPrerequisites = (f.prerequisites ?? []).length > 0;
    const hasRecoveryPath = Boolean(f.recoveryPath?.trim());

    // saga 类长线伏笔给予更多宽容
    const coldThreshold = scope === 'saga' ? 30 : scope === 'arc' ? 12 : 4;
    if (elapsed < coldThreshold) continue;

    // 有任何"被关注"的标记就不算冷
    if (hasResolution || hasPrerequisites || hasRecoveryPath) continue;

    cold.push({
      id: f.id,
      hint: f.hint,
      plantedInChapter: f.plantedInChapter,
      chaptersSincePlanted: elapsed,
      scope,
      priority: f.priority,
    });
  }

  // 按已过章节降序排列（越久没管的越紧急）
  return cold.sort((a, b) => b.chaptersSincePlanted - a.chaptersSincePlanted);
}

// ─── 建议生成 ────────────────────────────────────────────────────────

function buildSuggestions(params: {
  densityHealth: string;
  resolutionHealth: string;
  resolutionRate: number;
  avgPlantedPerChapter: number;
  avgResolvedPerChapter: number;
  collisionChapters: CollisionChapter[];
  coldForeshadowing: ColdForeshadowing[];
  totalActive: number;
}): string[] {
  const suggestions: string[] = [];
  const {
    densityHealth,
    resolutionHealth,
    resolutionRate,
    avgPlantedPerChapter,
    avgResolvedPerChapter,
    collisionChapters,
    coldForeshadowing,
    totalActive,
  } = params;

  // 密度建议
  if (densityHealth === 'sparse') {
    suggestions.push(
      `伏笔密度偏低（平均每章 ${avgPlantedPerChapter.toFixed(1)} 条新伏笔），建议在接下来 2-3 章中埋下新的悬念或线索，保持读者好奇心`,
    );
  } else if (densityHealth === 'dense') {
    suggestions.push(
      `伏笔密度过高（平均每章 ${avgPlantedPerChapter.toFixed(1)} 条新伏笔），读者可能记不住，建议暂停新增并优先回收现有伏笔`,
    );
  }

  // 回收率建议
  if (resolutionHealth === 'critical') {
    suggestions.push(
      `回收率严重偏低（${(resolutionRate * 100).toFixed(0)}%），大量伏笔堆积未回收，读者可能已经遗忘——建议在未来 3 章内集中回收至少 ${Math.ceil(totalActive * 0.3)} 条`,
    );
  } else if (resolutionHealth === 'low') {
    suggestions.push(
      `回收率偏低（${(resolutionRate * 100).toFixed(0)}%），建议加快回收节奏，避免伏笔堆积`,
    );
  }

  // 撞车建议
  if (collisionChapters.length > 0) {
    const worst = collisionChapters[0];
    suggestions.push(
      `第 ${worst.chapterNumber} 章规划回收 ${worst.plannedCount} 条伏笔，可能造成"集中爆发"的突兀感，建议分散到相邻章节`,
    );
  }

  // 冷伏笔建议
  if (coldForeshadowing.length > 0) {
    const coldest = coldForeshadowing[0];
    suggestions.push(
      `伏笔「${coldest.hint.slice(0, 20)}…」已 ${coldest.chaptersSincePlanted} 章未被提及，可能已被读者遗忘，建议在最近 1-2 章中自然提及或推进`,
    );
    if (coldForeshadowing.length > 1) {
      suggestions.push(`共有 ${coldForeshadowing.length} 条伏笔长期未被触及，考虑清理或合并`);
    }
  }

  // 健康时的正向反馈
  if (suggestions.length === 0 && totalActive > 0) {
    suggestions.push('伏笔系统健康度良好，密度和回收节奏均处于合理区间');
  }

  return suggestions;
}

// ─── Writer 上下文渲染 ──────────────────────────────────────────────────

/**
 * 把密度诊断报告渲染为 Writer 可读的 prompt 上下文。
 */
export function buildDensityContextPrompt(report: ForeshadowingDensityReport): string {
  const lines: string[] = [];

  // 健康度概览
  lines.push('### 伏笔生态健康度');
  lines.push(`- 已埋下：${report.totalPlanted} 条，已回收：${report.totalResolved} 条，活跃：${report.totalActive} 条`);
  lines.push(`- 回收率：${(report.resolutionRate * 100).toFixed(0)}%`);
  lines.push(`- 密度：每章平均新增 ${report.avgPlantedPerChapter.toFixed(1)} 条，回收 ${report.avgResolvedPerChapter.toFixed(1)} 条`);

  const healthLabel: Record<string, string> = {
    healthy: '✓ 健康',
    sparse: '⚠ 偏稀疏',
    dense: '⚠ 偏密集',
    low: '⚠ 偏低',
    critical: '✗ 严重偏低',
    unknown: '— 数据不足',
  };
  lines.push(`- 密度评估：${healthLabel[report.densityHealth] ?? report.densityHealth}`);
  lines.push(`- 回收评估：${healthLabel[report.resolutionHealth] ?? report.resolutionHealth}`);

  // 撞车预警
  if (report.collisionChapters.length > 0) {
    lines.push('');
    lines.push('### 伏笔回收撞车预警');
    for (const c of report.collisionChapters.slice(0, 3)) {
      const severity = c.plannedCount > RESOLVE_PER_CHAPTER_HARD ? '严重' : '注意';
      lines.push(`- [${severity}] 第 ${c.chapterNumber} 章规划回收 ${c.plannedCount} 条（建议 ≤${RESOLVE_PER_CHAPTER_SOFT}）`);
      for (const h of c.hints.slice(0, 3)) {
        lines.push(`  · ${h.slice(0, 30)}`);
      }
    }
  }

  // 冷伏笔提醒
  if (report.coldForeshadowing.length > 0) {
    lines.push('');
    lines.push('### 被遗忘的伏笔（建议最近提及）');
    for (const f of report.coldForeshadowing.slice(0, 5)) {
      const scopeLabel = f.scope === 'saga' ? '长线' : f.scope === 'arc' ? '中线' : '短线';
      lines.push(`- [${scopeLabel}/${f.priority}] ${f.hint.slice(0, 40)}（第${f.plantedInChapter}章埋下，已${f.chaptersSincePlanted}章未提及）`);
    }
  }

  // 建议
  if (report.suggestions.length > 0) {
    lines.push('');
    lines.push('### 伏笔系统建议');
    for (const s of report.suggestions) {
      lines.push(`- ${s}`);
    }
  }

  return lines.join('\n');
}
