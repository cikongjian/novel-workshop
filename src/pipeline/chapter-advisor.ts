/**
 * 动态章节规划顾问
 *
 * 综合当前故事状态的所有信号，为下一章提供建议：
 * - 哪些情节线该推进
 * - 哪些角色该出场
 * - 建议的场景类型（战斗/日常/阴谋/探索等）
 * - 建议的情感基调
 */

import type { StoryState, StoryStateSnapshot } from '../novel/story-state-types.js';

export type SceneType =
  | 'battle'       // 战斗/冲突
  | 'daily'        // 日常/休息
  | 'intrigue'     // 阴谋/谋略
  | 'exploration'  // 探索/冒险
  | 'revelation'   // 揭秘/真相
  | 'emotional'    // 情感/关系
  | 'training'     // 修炼/成长
  | 'transition';  // 过渡/转场

export type ChapterAdvice = {
  /** Suggested plot threads to advance */
  suggestedThreads: string[];
  /** Characters that should appear */
  suggestedCharacters: string[];
  /** Recommended scene type */
  suggestedSceneType: SceneType;
  /** Emotional tone */
  suggestedTone: string;
  /** Specific recommendations */
  recommendations: string[];
  /** Overall priority: what's most urgent */
  topPriority: string;
};

export function adviseNextChapter(
  state: StoryState,
  currentChapter: number,
): ChapterAdvice | null {
  const snapshots = state.snapshots
    .filter(s => s.chapterNumber < currentChapter)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (snapshots.length === 0) return null;

  const latest = snapshots[snapshots.length - 1];
  const recommendations: string[] = [];
  const suggestedCharacters: string[] = [];
  const suggestedThreads: string[] = [];

  // 1. Check for urgent causal chains
  const urgentCausal = (latest.causalChains ?? [])
    .filter(c => c.pendingEffects.length > 0)
    .sort((a, b) => a.causeChapter - b.causeChapter);

  if (urgentCausal.length > 0) {
    const oldest = urgentCausal[0];
    const age = currentChapter - oldest.causeChapter;
    if (age >= 5) {
      recommendations.push(`因果链「${oldest.cause}」已悬置${age}章，急需兑现后果`);
    }
  }

  // 2. Check for stalled characters
  const stalledChars = findStalledCharacters(latest, snapshots);
  if (stalledChars.length > 0) {
    suggestedCharacters.push(...stalledChars.slice(0, 2));
    recommendations.push(`角色${stalledChars.slice(0, 2).join('、')}近期缺乏发展，建议推动其弧线`);
  }

  // 3. Check active plot threads
  if (latest.plot?.activeThreads) {
    const climaxThreads = latest.plot.activeThreads
      .filter(t => t.status === 'climax');
    const activeThreads = latest.plot.activeThreads
      .filter(t => t.status === 'active');

    if (climaxThreads.length > 0) {
      suggestedThreads.push(...climaxThreads.map(t => t.threadName));
      recommendations.push(`情节线「${climaxThreads[0].threadName}」正处于高潮，本章应延续或收束`);
    } else if (activeThreads.length > 0) {
      suggestedThreads.push(activeThreads[0].threadName);
    }
  }

  // 4. Check pending foreshadowing
  if (latest.plot?.pendingForeshadowing) {
    const urgent = latest.plot.pendingForeshadowing
      .filter(f => f.urgency === 'overdue' || f.urgency === 'high');
    if (urgent.length > 0) {
      recommendations.push(`有${urgent.length}条紧急伏笔待回收`);
    }
  }

  // 5. Determine scene type based on signals
  const tension = latest.plot?.tensionLevel ?? 5;
  const { suggestedSceneType, suggestedTone } = determineSceneAndTone(
    tension, urgentCausal.length, stalledChars.length, recommendations,
  );

  // 6. Determine top priority
  let topPriority: string;
  if (urgentCausal.length > 0 && currentChapter - urgentCausal[0].causeChapter >= 5) {
    topPriority = `兑现因果链「${urgentCausal[0].cause}」的后果`;
  } else if (recommendations.length > 0) {
    topPriority = recommendations[0];
  } else {
    topPriority = '按大纲正常推进';
  }

  return {
    suggestedThreads,
    suggestedCharacters,
    suggestedSceneType,
    suggestedTone,
    recommendations,
    topPriority,
  };
}

function findStalledCharacters(
  latest: StoryStateSnapshot,
  snapshots: StoryStateSnapshot[],
): string[] {
  const stalledChars: string[] = [];
  if (!latest.characters) return stalledChars;

  for (const char of latest.characters) {
    if (char.alive === false || char.present === false) continue;
    const recentSnapshots = snapshots.slice(-3);
    const hasChanged = recentSnapshots.some(s => {
      const charState = s.characters?.find(c => c.name === char.name);
      return charState && (
        charState.emotionalState !== char.emotionalState ||
        charState.currentGoal !== char.currentGoal ||
        charState.location !== char.location
      );
    });
    if (!hasChanged) {
      stalledChars.push(char.name);
    }
  }
  return stalledChars;
}

function determineSceneAndTone(
  tension: number,
  urgentCausalCount: number,
  stalledCharCount: number,
  recommendations: string[],
): { suggestedSceneType: SceneType; suggestedTone: string } {
  if (tension >= 8) {
    recommendations.push('上一章张力极高，本章建议安排喘息段落');
    return { suggestedSceneType: 'daily', suggestedTone: '舒缓、沉淀' };
  }
  if (tension <= 3) {
    recommendations.push('张力偏低，本章建议埋下新的冲突种子');
    return { suggestedSceneType: 'intrigue', suggestedTone: '暗流涌动' };
  }
  if (urgentCausalCount > 0) {
    return { suggestedSceneType: 'revelation', suggestedTone: '紧张、揭示' };
  }
  if (stalledCharCount > 0) {
    return { suggestedSceneType: 'emotional', suggestedTone: '深入、内省' };
  }
  return { suggestedSceneType: 'exploration', suggestedTone: '推进、发展' };
}

/**
 * Build context string for injection into the Outline agent
 */
export function buildChapterAdviceContext(advice: ChapterAdvice): string {
  const lines: string[] = [];

  lines.push(`最高优先：${advice.topPriority}`);
  lines.push(`建议场景类型：${getSceneTypeLabel(advice.suggestedSceneType)}`);
  lines.push(`建议情感基调：${advice.suggestedTone}`);

  if (advice.suggestedThreads.length > 0) {
    lines.push(`建议推进情节线：${advice.suggestedThreads.join('、')}`);
  }
  if (advice.suggestedCharacters.length > 0) {
    lines.push(`建议出场角色：${advice.suggestedCharacters.join('、')}`);
  }
  if (advice.recommendations.length > 0) {
    lines.push('');
    lines.push('具体建议：');
    for (const r of advice.recommendations) {
      lines.push(`- ${r}`);
    }
  }

  return lines.join('\n');
}

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  battle: '战斗/冲突',
  daily: '日常/休息',
  intrigue: '阴谋/谋略',
  exploration: '探索/冒险',
  revelation: '揭秘/真相',
  emotional: '情感/关系',
  training: '修炼/成长',
  transition: '过渡/转场',
};

function getSceneTypeLabel(type: SceneType): string {
  return SCENE_TYPE_LABELS[type] ?? type;
}

