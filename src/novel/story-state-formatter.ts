/**
 * 故事状态格式化器
 *
 * 负责将 StoryStateSnapshot / StoryState 渲染为可读文本，
 * 供 Writer Agent 注入上下文。从 story-state-manager.ts 拆分而来。
 */

import type { StoryState, StoryStateSnapshot, CompressedArc } from './story-state-types.js';
import { isCriticalInfo, calculateDecayFactor } from '../pipeline/memory-decay.js';
import { classifyVector } from './relationship-vector.js';

/** 注入 Writer 时最多携带多少章的详细快照 */
const MAX_RECENT_SNAPSHOTS = 5;

/** 势力阶段标签 */
const PHASE_LABELS: Record<string, string> = {
  dormant: '蛰伏', rising: '崛起', peak: '鼎盛', declining: '衰落', collapsed: '覆灭',
};

/** 势力关系类型标签 */
const RELATION_TYPE_LABELS: Record<string, string> = {
  ally: '盟友', neutral: '中立', rival: '竞争', enemy: '敌对', vassal: '附庸', overlord: '宗主',
};

/**
 * 格式化单个快照为可读文本。
 *
 * @param novelId 用于缓存 key
 * @param snapshot 待格式化的快照
 * @param cache   可选的外部缓存（由 StoryStateManager 提供）
 */
export function formatSnapshot(
  novelId: string,
  snapshot: StoryStateSnapshot,
  cache?: Map<string, string>,
): string {
  if (cache) {
    const cacheKey = `${novelId}:${snapshot.chapterNumber}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  const lines: string[] = [];

  // ---- 角色状态 ----
  const aliveChars = snapshot.characters.filter(c => c.alive);
  if (aliveChars.length > 0) {
    lines.push('**角色状态：**');
    for (const c of aliveChars) {
      const parts = [`${c.name}`];
      if (c.location) parts.push(`在${c.location}`);
      if (c.emotionalState && c.emotionalState !== 'neutral') parts.push(`情绪：${c.emotionalState}`);
      if (c.currentGoal) parts.push(`目标：${c.currentGoal}(${c.goalProgress}%)`);
      if (c.physicalCondition && c.physicalCondition !== 'normal') parts.push(`身体：${c.physicalCondition}`);
      if (c.inventory.length > 0) parts.push(`持有：${c.inventory.join('、')}`);
      if (c.powerChange) parts.push(`实力变化：${c.powerChange}`);
      if (c.currentBelief) parts.push(`信念：${c.currentBelief}`);
      if (c.beliefShift) parts.push(`⚡信念动摇：${c.beliefShift}`);
      lines.push(`- ${parts.join('｜')}`);
      if (c.relationshipChanges.length > 0) {
        for (const r of c.relationshipChanges) {
          const vectorTag = r.vector
            ? ` [${classifyVector(r.vector)}｜信任${r.vector.trust > 0 ? '+' : ''}${r.vector.trust} 亲近${r.vector.affection > 0 ? '+' : ''}${r.vector.affection}]`
            : '';
          lines.push(`  ↳ 与${r.targetName}：${r.change}${vectorTag}`);
        }
      }
    }
    const deadChars = snapshot.characters.filter(c => !c.alive);
    if (deadChars.length > 0) {
      lines.push(`- 已死亡：${deadChars.map(c => c.name).join('、')}`);
    }
    const absentChars = aliveChars.filter(c => !c.present);
    if (absentChars.length > 0) {
      lines.push(`- 暂时离场：${absentChars.map(c => c.name).join('、')}`);
    }

    // ---- 关系热力图总览（聚合所有关系向量，快速感知角色间格局）----
    const relationLines: string[] = [];
    const seenPairs = new Set<string>();
    const relTypeLabels: Record<string, string> = {
      ally: '盟友',
      respected_ally: '敬重盟友',
      enemy: '死敌',
      feared_enemy: '又怕又恨',
      subordinate: '从属',
      rival: '对手',
      feared: '畏惧',
      reluctant_debtor: '不情愿的债务人',
      neutral: '中性',
    };
    for (const c of aliveChars) {
      for (const r of c.relationshipChanges) {
        if (!r.vector) continue;
        const pairKey = [c.name, r.targetName].sort().join('↔');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const typeLabel = relTypeLabels[classifyVector(r.vector)] ?? classifyVector(r.vector);
        relationLines.push(`- ${pairKey}：${typeLabel}（信任${r.vector.trust > 0 ? '+' : ''}${r.vector.trust} 亲近${r.vector.affection > 0 ? '+' : ''}${r.vector.affection} 竞争${r.vector.rivalry}）`);
      }
    }
    if (relationLines.length > 0) {
      lines.push('\n**关系格局总览：**');
      lines.push(...relationLines.slice(0, 6));
    }
  }

  // ---- 世界状态 ----
  const w = snapshot.world;
  if (w.timelineMarker || w.factionChanges.length > 0 || w.geographyChanges.length > 0) {
    lines.push('\n**世界状态：**');
    if (w.timelineMarker) lines.push(`- 时间线：${w.timelineMarker}`);
    if (w.environment) lines.push(`- 环境：${w.environment}`);
    for (const f of w.factionChanges) lines.push(`- ${f.factionName}：${f.change}`);
    for (const g of w.geographyChanges) lines.push(`- 地理变化：${g}`);
    for (const p of w.powerSystemChanges) lines.push(`- 力量体系：${p}`);
    for (const s of w.socialChanges) lines.push(`- 社会变化：${s}`);
  }

  // ---- 势力状态 ----
  const factions = snapshot.factions ?? [];
  if (factions.length > 0) {
    lines.push('\n**势力状态：**');
    for (const f of factions) {
      const parts = [`${f.factionName}（${PHASE_LABELS[f.phase] ?? f.phase}）`];
      parts.push(`实力:${f.powerLevel}`);
      if (f.currentObjective) parts.push(`目标:${f.currentObjective}(${f.objectiveProgress}%)`);
      parts.push(`稳定度:${f.internalStability}`);
      lines.push(`- ${parts.join('｜')}`);
      if (f.controlledResources.length > 0) {
        lines.push(`  控制资源：${f.controlledResources.join('、')}`);
      }
      for (const r of f.relations) {
        lines.push(`  ↳ 与${r.targetFaction}：${RELATION_TYPE_LABELS[r.type] ?? r.type}${r.description ? ' — ' + r.description : ''}`);
      }
      if (f.changeThisChapter) {
        lines.push(`  本章变化：${f.changeThisChapter}`);
      }
    }
  }

  // ---- 情节状态 ----
  const p = snapshot.plot;
  if (p.activeThreads.length > 0 || p.readerQuestions.length > 0) {
    lines.push('\n**情节状态：**');
    lines.push(`- 张力水平：${p.tensionLevel}/10`);
    for (const t of p.activeThreads) {
      lines.push(`- [${t.status}] ${t.threadName}：${t.summary}（已持续${t.activeForChapters}章）`);
    }
    if (p.pendingForeshadowing.length > 0) {
      lines.push(`- 待兑现伏笔：${p.pendingForeshadowing.map(f => `${f.hint}(${f.urgency})`).join('；')}`);
    }
    if (p.readerQuestions.length > 0) {
      lines.push(`- 读者悬念：${p.readerQuestions.join('；')}`);
    }
  }

  // ---- 因果链 ----
  const pendingCausal = snapshot.causalChains.filter(c => c.pendingEffects.length > 0);
  if (pendingCausal.length > 0) {
    lines.push('\n**未兑现因果：**');
    for (const c of pendingCausal) {
      lines.push(`- 第${c.causeChapter}章「${c.cause}」→ 待兑现：${c.pendingEffects.join('、')}`);
    }
  }

  const result = lines.join('\n');

  if (cache) {
    const cacheKey = `${novelId}:${snapshot.chapterNumber}`;
    cache.set(cacheKey, result);
  }
  return result;
}

// ────────────────────────────────────────────────────────
// buildStateContext：渲染完整的故事状态上下文
// ────────────────────────────────────────────────────────

/** 内部辅助：渲染一组 arc 条目 */
function renderArcEntries(
  parts: string[],
  entries: CompressedArc[],
  currentChapter: number,
  label?: string,
): void {
  for (const arc of entries) {
    const midChapter = Math.floor((arc.chapterRange.start + arc.chapterRange.end) / 2);
    const decay = calculateDecayFactor(currentChapter, midChapter);
    const critical = isCriticalInfo(arc.summary) || arc.keyStateChanges.some(c => isCriticalInfo(c));
    const prefix = label ? `${label} ` : '';

    if (critical || decay >= 0.6) {
      parts.push(`${prefix}【第${arc.chapterRange.start}-${arc.chapterRange.end}章】${arc.summary}`);
      if (arc.keyStateChanges.length > 0) {
        parts.push(`  关键变化：${arc.keyStateChanges.join('；')}`);
      }
    } else if (decay >= 0.3) {
      parts.push(`${prefix}【第${arc.chapterRange.start}-${arc.chapterRange.end}章】${arc.summary}`);
    }
    // decay < 0.3: skip entirely
  }
}

/**
 * 构建注入 Writer 的状态上下文字符串。
 *
 * 策略：最近 N 章详细快照 + 更早的压缩弧线摘要 + mega-arcs。
 */
export function buildStateContext(
  state: StoryState,
  currentChapter: number,
  maxChars: number = 6000,
  cache?: Map<string, string>,
): string {
  const hasMegaArcs = (state.megaArcs ?? []).length > 0;
  if (state.snapshots.length === 0 && state.compressedArcs.length === 0 && !hasMegaArcs) {
    return '';
  }

  const megaArcs = state.megaArcs ?? [];
  const megaArcEnd = megaArcs.length > 0
    ? megaArcs[megaArcs.length - 1].chapterRange.end
    : 0;

  let remainingArcs = state.compressedArcs.filter(a => a.chapterRange.end > megaArcEnd);

  const buildResult = (
    useMegaArcs: CompressedArc[],
    useArcs: CompressedArc[],
    snapshotLimit: number,
  ): string => {
    const parts: string[] = ['## 📋 故事状态机（硬约束 — 必须遵守）\n'];

    // 远期记忆：mega-arcs + remaining arcs
    if (useMegaArcs.length > 0 || useArcs.length > 0) {
      parts.push('### 前情概要');
      renderArcEntries(parts, useMegaArcs, currentChapter);
      renderArcEntries(parts, useArcs, currentChapter);
      parts.push('');
    }

    // 最近 N 章详细快照
    const recentSnapshots = state.snapshots
      .filter(s => s.chapterNumber < currentChapter)
      .slice(-snapshotLimit);

    const latestSnapshot = recentSnapshots.length > 0
      ? recentSnapshots[recentSnapshots.length - 1]
      : undefined;

    if (latestSnapshot) {
      parts.push(`### 截至第${latestSnapshot.chapterNumber}章的实时状态\n`);
      parts.push(formatSnapshot(state.novelId, latestSnapshot, cache));
    }

    // 硬约束
    if (latestSnapshot?.nextChapterConstraints.length) {
      parts.push('\n### ⚠️ 本章硬约束（违反即为 BUG）');
      for (const c of latestSnapshot.nextChapterConstraints) {
        parts.push(`- ${c}`);
      }
    }

    return parts.join('\n');
  };

  let result = buildResult(megaArcs, remainingArcs, MAX_RECENT_SNAPSHOTS);

  if (result.length > maxChars) {
    remainingArcs = remainingArcs.slice(-3);
    result = buildResult(megaArcs, remainingArcs, MAX_RECENT_SNAPSHOTS);
  }

  if (result.length > maxChars) {
    result = buildResult(megaArcs, remainingArcs, 3);
  }

  return result;
}
