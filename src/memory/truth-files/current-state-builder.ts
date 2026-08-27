/**
 * 当前状态视图构建器
 *
 * 从 StoryStateSnapshot 压缩为紧凑的 CurrentStateView，
 * 体积约为原始 snapshot 的 15-20%，适合直接注入 prompt。
 */

import type {
  StoryStateSnapshot,
  CharacterLiveState,
  FactionLiveState,
} from '../../novel/story-state-types.js';
import type {
  CurrentStateView,
  CompactCharacterState,
  CompactWorldState,
  CompactFactionState,
} from './types.js';

// ==================== 常量 ====================

/** 每个角色最多保留的关键物品数 */
const MAX_KEY_ITEMS = 5;

/** 每个势力最多保留的活跃关系数 */
const MAX_ACTIVE_RELATIONS = 5;

/** 世界变化条目最大数 */
const MAX_RECENT_CHANGES = 8;

// ==================== 构建函数 ====================

/**
 * 压缩角色状态
 */
function compactCharacter(c: CharacterLiveState): CompactCharacterState {
  return {
    name: c.name,
    location: c.location,
    goal: c.currentGoal,
    goalProgress: c.goalProgress,
    emotionalState: c.emotionalState,
    physicalCondition: c.physicalCondition,
    alive: c.alive,
    present: c.present,
    keyItems: c.inventory.slice(0, MAX_KEY_ITEMS),
    powerChange: c.powerChange,
  };
}

/**
 * 压缩世界状态
 */
function compactWorld(snapshot: StoryStateSnapshot): CompactWorldState {
  const w = snapshot.world;
  const changes: string[] = [];

  for (const fc of w.factionChanges) {
    changes.push(`${fc.factionName}: ${fc.change}`);
  }
  for (const gc of w.geographyChanges) {
    changes.push(gc);
  }
  for (const sc of w.socialChanges) {
    changes.push(sc);
  }

  return {
    timelineMarker: w.timelineMarker,
    environment: w.environment,
    recentChanges: changes.slice(0, MAX_RECENT_CHANGES),
  };
}

/**
 * 压缩势力状态，过滤掉中立关系
 */
function compactFaction(f: FactionLiveState): CompactFactionState {
  const activeRelations = f.relations
    .filter(r => r.type !== 'neutral')
    .slice(0, MAX_ACTIVE_RELATIONS)
    .map(r => ({
      target: r.targetFaction,
      type: r.type,
    }));

  return {
    name: f.factionName,
    phase: f.phase,
    powerLevel: f.powerLevel,
    objective: f.currentObjective,
    activeRelations,
  };
}

// ==================== 导出 ====================

/**
 * 从 StoryStateSnapshot 构建压缩的当前状态视图
 */
export function buildCurrentStateView(
  snapshot: StoryStateSnapshot,
): CurrentStateView {
  return {
    chapterNumber: snapshot.chapterNumber,
    characters: snapshot.characters.map(compactCharacter),
    world: compactWorld(snapshot),
    factions: snapshot.factions.map(compactFaction),
    tensionLevel: snapshot.plot.tensionLevel,
    readerQuestions: snapshot.plot.readerQuestions,
    nextChapterConstraints: snapshot.nextChapterConstraints,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 将 CurrentStateView 渲染为 prompt 注入文本
 */
export function renderCurrentStateContext(view: CurrentStateView): string {
  const lines: string[] = ['【当前故事状态 · 第' + view.chapterNumber + '章后】'];

  // 世界
  lines.push(`时间：${view.world.timelineMarker} | 环境：${view.world.environment}`);
  if (view.world.recentChanges.length > 0) {
    lines.push(`近期变化：${view.world.recentChanges.join('；')}`);
  }

  // 角色
  const aliveChars = view.characters.filter(c => c.alive && c.present);
  if (aliveChars.length > 0) {
    lines.push('');
    lines.push('角色状态：');
    for (const c of aliveChars) {
      const parts = [`${c.name} @${c.location}`];
      if (c.emotionalState) parts.push(c.emotionalState);
      if (c.goal) parts.push(`目标:${c.goal}(${c.goalProgress}%)`);
      if (c.powerChange) parts.push(`变化:${c.powerChange}`);
      lines.push(`  ${parts.join(' | ')}`);
    }
  }

  // 势力
  const activeFactions = view.factions.filter(f => f.phase !== 'dormant');
  if (activeFactions.length > 0) {
    lines.push('');
    lines.push('活跃势力：');
    for (const f of activeFactions) {
      const relStr = f.activeRelations.map(r => `${r.type}→${r.target}`).join('，');
      lines.push(`  ${f.name} [${f.phase}] 实力:${f.powerLevel} 目标:${f.objective}${relStr ? ` 关系:${relStr}` : ''}`);
    }
  }

  // 张力 & 约束
  lines.push('');
  lines.push(`张力等级：${view.tensionLevel}/10`);
  if (view.readerQuestions.length > 0) {
    lines.push(`读者悬念：${view.readerQuestions.join('；')}`);
  }
  if (view.nextChapterConstraints.length > 0) {
    lines.push(`下章约束：${view.nextChapterConstraints.join('；')}`);
  }

  return lines.join('\n');
}
