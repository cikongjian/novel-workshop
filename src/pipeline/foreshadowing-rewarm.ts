/**
 * 伏笔回温曲线推理器（Foreshadowing Rewarm Curve Reasoner）
 *
 * 把伏笔从"埋下"到"回收"之间的生命周期建模为一条曲线：
 *
 *   埋下 → 沉默期 → 预热铺垫 → 升温触及 → 爆发回收
 *
 * 现有系统只有"埋了→到期了→回收"，缺少中间的"回温"推理。
 * 本模块推理出：每条活跃伏笔当前处于曲线的哪个阶段，以及
 * Writer 在本章应该做什么动作（沉默/铺垫/升温/回收）。
 *
 * 设计目标：
 * - 纯本地推理，无 LLM 调用
 * - 输出为阶段判定 + Writer 行动建议
 * - 幂等：相同输入产生相同输出
 */

import type { Foreshadowing } from '../novel/types.js';

// ─── 阶段定义 ────────────────────────────────────────────────────────

export type ForeshadowingPhase =
  | 'planted'    // 刚埋下（1-2 章）
  | 'silent'     // 沉默期（正常间隔，不需提及）
  | 'warming'    // 预热期（该开始铺垫了）
  | 'heating'    // 升温期（应在本章触及）
  | 'due'        // 到期（应在本章回收）
  | 'overdue'    // 逾期（必须尽快回收）
  | 'resolved';  // 已回收

export interface PhaseAssessment {
  id: string;
  hint: string;
  phase: ForeshadowingPhase;
  scope: 'scene' | 'arc' | 'saga';
  priority: 'high' | 'medium' | 'low';
  plantedInChapter: number;
  chaptersElapsed: number;
  /** 建议的 Writer 动作 */
  recommendedAction: string;
  /** 距离回收窗口的剩余章节（负数=已逾期） */
  chaptersUntilDue: number;
}

export interface RewarmCurveReport {
  /** 各阶段的伏笔列表 */
  byPhase: Record<ForeshadowingPhase, PhaseAssessment[]>;
  /** 本章需要回温（warming/heating）的伏笔 */
  needsRewarmThisChapter: PhaseAssessment[];
  /** 本章必须回收的伏笔 */
  mustResolveThisChapter: PhaseAssessment[];
  /** 建议本章铺垫的伏笔（提前 2-3 章植入暗示） */
  shouldForeshadowThisChapter: PhaseAssessment[];
  /** 回温曲线 prompt 上下文 */
  contextPrompt: string;
}

// ─── 窗口配置（复用 foreshadowing-graph 的阈值） ────────────────────

const PHASE_THRESHOLDS: Record<string, {
  planted: number;  // 刚埋下的章节数
  silent: number;    // 沉默期结束
  warming: number;   // 预热期开始（距回收窗口 70%）
  heating: number;   // 升温期开始（距回收窗口 85%）
  due: number;       // 到期
}> = {
  scene: { planted: 0, silent: 1, warming: 1, heating: 1, due: 1 },
  arc:   { planted: 1, silent: 2, warming: 4, heating: 6, due: 8 },
  saga:  { planted: 2, silent: 5, warming: 12, heating: 18, due: 25 },
};

// ─── 辅助函数 ────────────────────────────────────────────────────────

function inferScope(item: Foreshadowing): 'scene' | 'arc' | 'saga' {
  if (item.scope) return item.scope;
  if (item.relatedPlotThreads.length >= 2) return 'saga';
  if (item.priority === 'high' && item.plantedInChapter <= 3) return 'arc';
  return 'arc';
}

function getThresholds(scope: 'scene' | 'arc' | 'saga') {
  return PHASE_THRESHOLDS[scope] ?? PHASE_THRESHOLDS.arc;
}

/**
 * 判定伏笔当前处于哪个阶段
 */
function assessPhase(
  item: Foreshadowing,
  currentChapter: number,
): PhaseAssessment {
  const scope = inferScope(item);
  const thresholds = getThresholds(scope);
  const elapsed = currentChapter - item.plantedInChapter;

  let phase: ForeshadowingPhase;
  let recommendedAction: string;
  let chaptersUntilDue: number;

  if (item.isResolved) {
    phase = 'resolved';
    recommendedAction = '已回收，无需操作';
    chaptersUntilDue = 0;
  } else if (elapsed <= thresholds.planted) {
    phase = 'planted';
    recommendedAction = '刚埋下，保持自然，不要急于提及';
    chaptersUntilDue = thresholds.due - elapsed;
  } else if (elapsed < thresholds.silent) {
    phase = 'silent';
    recommendedAction = '沉默期，不需要在本章提及';
    chaptersUntilDue = thresholds.due - elapsed;
  } else if (elapsed < thresholds.warming) {
    phase = 'warming';
    recommendedAction = '预热期：建议在正文中自然地暗示或间接提及，为后续回收做铺垫';
    chaptersUntilDue = thresholds.due - elapsed;
  } else if (elapsed < thresholds.heating) {
    phase = 'heating';
    recommendedAction = '升温期：应在本章正文中直接触及或推进此伏笔，让读者感受到悬念在收紧';
    chaptersUntilDue = thresholds.due - elapsed;
  } else if (elapsed < thresholds.due) {
    phase = 'due';
    recommendedAction = '到期：应在本章或最近 1-2 章内完成回收';
    chaptersUntilDue = thresholds.due - elapsed;
  } else {
    phase = 'overdue';
    recommendedAction = '逾期：必须尽快回收，读者可能已经遗忘';
    chaptersUntilDue = thresholds.due - elapsed; // 负数
  }

  return {
    id: item.id,
    hint: item.hint,
    phase,
    scope,
    priority: item.priority,
    plantedInChapter: item.plantedInChapter,
    chaptersElapsed: elapsed,
    recommendedAction,
    chaptersUntilDue,
  };
}

// ─── 主推理函数 ────────────────────────────────────────────────────────

/**
 * 推理所有伏笔的回温曲线阶段，生成本章行动建议。
 */
export function assessRewarmCurve(params: {
  foreshadowing: Foreshadowing[];
  currentChapter: number;
}): RewarmCurveReport {
  const { foreshadowing, currentChapter } = params;

  const assessments = foreshadowing
    .filter(f => f.plantedInChapter > 0 && f.plantedInChapter <= currentChapter)
    .map(f => assessPhase(f, currentChapter));

  // 按阶段分组
  const byPhase: Record<ForeshadowingPhase, PhaseAssessment[]> = {
    planted: [],
    silent: [],
    warming: [],
    heating: [],
    due: [],
    overdue: [],
    resolved: [],
  };
  for (const a of assessments) {
    byPhase[a.phase].push(a);
  }

  // 本章需要回温的（预热 + 升温）
  const needsRewarmThisChapter = [
    ...byPhase.warming,
    ...byPhase.heating,
  ].sort((a, b) => a.chaptersUntilDue - b.chaptersUntilDue);

  // 本章必须回收的（到期 + 逾期）
  const mustResolveThisChapter = [
    ...byPhase.due,
    ...byPhase.overdue,
  ].sort((a, b) => a.chaptersUntilDue - b.chaptersUntilDue);

  // 建议本章铺垫的（plannedResolveChapter 在未来 2-3 章）
  const shouldForeshadowThisChapter = assessments.filter(a => {
    const item = foreshadowing.find(f => f.id === a.id);
    if (!item?.plannedResolveChapter) return false;
    const remaining = item.plannedResolveChapter - currentChapter;
    return remaining > 0 && remaining <= 3 && a.phase !== 'resolved';
  });

  const contextPrompt = buildRewarmContextPrompt({
    byPhase,
    needsRewarmThisChapter,
    mustResolveThisChapter,
    shouldForeshadowThisChapter,
  });

  return {
    byPhase,
    needsRewarmThisChapter,
    mustResolveThisChapter,
    shouldForeshadowThisChapter,
    contextPrompt,
  };
}

// ─── Prompt 渲染 ────────────────────────────────────────────────────

function buildRewarmContextPrompt(params: {
  byPhase: Record<ForeshadowingPhase, PhaseAssessment[]>;
  needsRewarmThisChapter: PhaseAssessment[];
  mustResolveThisChapter: PhaseAssessment[];
  shouldForeshadowThisChapter: PhaseAssessment[];
}): string {
  const lines: string[] = [];

  // 必须回收
  if (params.mustResolveThisChapter.length > 0) {
    lines.push('### 本章必须回收的伏笔');
    for (const a of params.mustResolveThisChapter.slice(0, 5)) {
      const urgency = a.phase === 'overdue' ? '⚠ 逾期' : '到期';
      lines.push(`- [${urgency}] ${a.hint.slice(0, 50)}`);
      if (a.chaptersUntilDue < 0) {
        lines.push(`  已逾期 ${Math.abs(a.chaptersUntilDue)} 章 — ${a.recommendedAction}`);
      } else {
        lines.push(`  剩 ${a.chaptersUntilDue} 章到期 — ${a.recommendedAction}`);
      }
    }
  }

  // 需要回温
  if (params.needsRewarmThisChapter.length > 0) {
    lines.push('');
    lines.push('### 本章需要回温的伏笔（预热/升温）');
    for (const a of params.needsRewarmThisChapter.slice(0, 5)) {
      const phaseLabel = a.phase === 'warming' ? '预热' : '升温';
      lines.push(`- [${phaseLabel}] ${a.hint.slice(0, 50)}`);
      lines.push(`  ${a.recommendedAction}`);
    }
  }

  // 建议铺垫
  if (params.shouldForeshadowThisChapter.length > 0) {
    lines.push('');
    lines.push('### 建议本章提前铺垫（2-3 章后回收）');
    for (const a of params.shouldForeshadowThisChapter.slice(0, 3)) {
      lines.push(`- ${a.hint.slice(0, 50)} — 可植入暗示或间接提及`);
    }
  }

  // 全局阶段分布概览
  const phases: Array<[ForeshadowingPhase, string]> = [
    ['planted', '刚埋下'],
    ['silent', '沉默'],
    ['warming', '预热'],
    ['heating', '升温'],
    ['due', '到期'],
    ['overdue', '逾期'],
    ['resolved', '已回收'],
  ];
  const phaseSummary = phases
    .map(([phase, label]) => {
      const count = params.byPhase[phase].length;
      return count > 0 ? `${label}×${count}` : '';
    })
    .filter(Boolean)
    .join('、');

  if (phaseSummary) {
    lines.unshift(`### 伏笔生命周期分布：${phaseSummary}`);
  }

  return lines.join('\n');
}
