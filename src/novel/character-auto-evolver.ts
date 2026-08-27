/**
 * 角色自主演化器（Character Auto-Evolver）
 *
 * 在章节定稿后，基于累积的 CharacterStateSnapshot（stress / beliefShift /
 * trustChanges / goalProgress / isCritical）自动触发角色 V2 深度字段的
 * 性格演化。所有人格与应对方式变化必须能在快照证据中找到明确文本，
 * 压力分、目标分等统计信号只能作为触发条件，不能单独创造角色特征。
 *
 * 设计目标：
 * - 纯本地推理，无 LLM 调用，零额外成本
 * - 幂等：同一章节重复执行不会重复添加已存在的演化项
 * - 尊重 autoEvolve=false 的角色（作者手动控制）
 * - 不破坏已有数据：所有变更以追加为主，仅在明确冲突时替换
 */

import type { CharacterProfile, CharacterStateSnapshot, CharacterGrowthMilestone } from './types.js';

/**
 * 单条演化变更记录。用于审计 / 调试 / 后续 UI 展示。
 */
export interface EvolutionChange {
  /** 字段路径，如 "personalityModel.traits" */
  field: string;
  /** 变更类型 */
  action: 'add' | 'update';
  /** 变更前的值（add 时为 undefined） */
  before?: unknown;
  /** 变更后的值 */
  after: unknown;
  /** 触发原因（人类可读） */
  reason: string;
}

export interface EvolutionResult {
  characterId: string;
  characterName: string;
  chapterNumber: number;
  changes: EvolutionChange[];
}

/**
 * NovelManager 中演化器需要依赖的最小接口。
 * 用接口而非具体类，方便单测注入 mock。
 */
export interface EvolverNovelManager {
  getCharacters(novelId: string): Promise<CharacterProfile[]>;
  saveCharacter(novelId: string, character: CharacterProfile): Promise<void>;
  getCharacterStateSnapshots(
    novelId: string,
    characterId?: string,
  ): Promise<CharacterStateSnapshot[]>;
}

// ─── 触发阈值（可调） ────────────────────────────────────────────────

const STRESS_HIGH_THRESHOLD = 70;
const STRESS_HIGH_RECENT_CHAPTERS = 3;
const STRESS_HIGH_MIN_HITS = 2;

const BELIEF_SHIFT_MIN_ACCUMULATION = 3;

const TRAUMA_MIN_COUNT_FOR_CONTRADICTION = 2;
const TRUST_NEGATIVE_ACCUMULATION_THRESHOLD = -50;

/** 单次演化最多回顾多少章历史快照 */
const MAX_HISTORY_SNAPSHOTS = 10;

// ─── 有明确文本证据时才允许写入的演化特征 ──────────────────────────

const STRESS_TRAIT_EVIDENCE = [
  { label: '多疑', pattern: /多疑|疑神疑鬼|开始怀疑/u },
  { label: '暴躁', pattern: /暴躁|易怒|暴怒/u },
  { label: '焦虑', pattern: /焦虑|坐立不安|惴惴不安/u },
  { label: '戒备', pattern: /戒备|警惕|防备/u },
] as const;

const STRESS_COPING_EVIDENCE = [
  { label: '逃避', pattern: /逃避|回避现实/u },
  { label: '失眠', pattern: /失眠|无法入睡|彻夜未眠/u },
  { label: '情绪化决策', pattern: /情绪化决策|冲动决定/u },
  { label: '酗酒', pattern: /酗酒|借酒消愁|烂醉/u },
] as const;

const TRUST_NEGATIVE_TRAIT = '防备心重';

// ─── 辅助函数 ────────────────────────────────────────────────────────

/**
 * 取出某个角色最近 N 章的状态快照（按章节升序）。
 */
function recentSnapshots(
  all: CharacterStateSnapshot[],
  characterId: string,
  windowSize: number,
): CharacterStateSnapshot[] {
  return all
    .filter((s) => s.characterId === characterId)
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .slice(-windowSize);
}

/**
 * 累积某角色对所有其他角色的 trustChanges 总和。
 */
function accumulateTrustDelta(snaps: CharacterStateSnapshot[]): number {
  let total = 0;
  for (const s of snaps) {
    for (const t of s.trustChanges ?? []) {
      total += t.delta;
    }
  }
  return total;
}

function snapshotEvidenceText(snapshot: CharacterStateSnapshot): string {
  return [
    snapshot.beliefShift,
    snapshot.emotionState.trigger,
    ...(snapshot.trustChanges ?? []).map(change => change.reason),
    ...(snapshot.evidence ?? []).map(item => item.reason),
  ].filter(Boolean).join('；');
}

function findEvidenceLabel(
  text: string,
  rules: ReadonlyArray<{ label: string; pattern: RegExp }>,
): string | undefined {
  return rules.find(rule => rule.pattern.test(text))?.label;
}

// ─── 单条演化规则 ────────────────────────────────────────────────────

interface RuleContext {
  character: CharacterProfile;
  history: CharacterStateSnapshot[];
  currentChapter: number;
}

interface RuleOutcome {
  changes: EvolutionChange[];
  /** 返回更新后的 character 副本（不修改入参） */
  applyTo: (c: CharacterProfile) => CharacterProfile;
}

type EvolutionRule = (ctx: RuleContext) => RuleOutcome | null;

// 规则 1：长期高压 + 明确行为证据 → 性格标签 / 应对机制
function stressHighRule(ctx: RuleContext): RuleOutcome | null {
  const { character, history } = ctx;
  const recent = history.slice(-STRESS_HIGH_RECENT_CHAPTERS);
  if (recent.length < STRESS_HIGH_MIN_HITS) return null;
  const hits = recent.filter((s) => s.stress >= STRESS_HIGH_THRESHOLD).length;
  if (hits < STRESS_HIGH_MIN_HITS) return null;

  const evidenceText = recent.map(snapshotEvidenceText).join('；');
  const trait = findEvidenceLabel(evidenceText, STRESS_TRAIT_EVIDENCE);
  const coping = findEvidenceLabel(evidenceText, STRESS_COPING_EVIDENCE);
  if (!trait && !coping) return null;

  const changes: EvolutionChange[] = [];

  let traitsBefore = character.personalityModel?.traits ?? [];
  let copingBefore = character.psychology?.copingMechanisms ?? [];
  let traitAdded = false;
  let copingAdded = false;

  if (trait && !traitsBefore.includes(trait)) {
    changes.push({
      field: 'personalityModel.traits',
      action: 'add',
      before: traitsBefore,
      after: [...traitsBefore, trait],
      reason: `最近 ${recent.length} 章中 ${hits} 章处于高压，且快照证据明确出现“${trait}”`,
    });
    traitAdded = true;
  }
  if (coping && !copingBefore.includes(coping)) {
    changes.push({
      field: 'psychology.copingMechanisms',
      action: 'add',
      before: copingBefore,
      after: [...copingBefore, coping],
      reason: `高压期间的快照证据明确出现应对方式“${coping}”`,
    });
    copingAdded = true;
  }

  if (!traitAdded && !copingAdded) return null;

  return {
    changes,
    applyTo: (c) => ({
      ...c,
      personalityModel: {
        traits: traitAdded && trait
          ? [...(c.personalityModel?.traits ?? []), trait]
          : (c.personalityModel?.traits ?? []),
        innerContradictions: c.personalityModel?.innerContradictions ?? [],
        moralBoundary: c.personalityModel?.moralBoundary ?? [],
      },
      psychology: {
        worldview: c.psychology?.worldview ?? '',
        copingMechanisms: copingAdded && coping
          ? [...(c.psychology?.copingMechanisms ?? []), coping]
          : (c.psychology?.copingMechanisms ?? []),
        emotionalTriggers: c.psychology?.emotionalTriggers ?? [],
      },
    }),
  };
}

// 规则 2：信念反复动摇 → 更新世界观
function beliefShiftAccumulationRule(ctx: RuleContext): RuleOutcome | null {
  const { character, history } = ctx;
  const shifted = history.filter((s) => s.beliefShift && s.beliefShift.trim().length > 0);
  if (shifted.length < BELIEF_SHIFT_MIN_ACCUMULATION) return null;

  const latestShift = shifted[shifted.length - 1].beliefShift;
  const currentWorldview = character.psychology?.worldview ?? '';

  // 若世界观已包含最新 beliefShift 关键短语，则视为已应用
  if (latestShift && currentWorldview.includes(latestShift.slice(0, 8))) return null;

  const newWorldview = currentWorldview
    ? `${currentWorldview}｜经历 ${shifted.length} 次信念动摇，最新：${latestShift}`
    : `经历 ${shifted.length} 次信念动摇，最新：${latestShift}`;

  return {
    changes: [
      {
        field: 'psychology.worldview',
        action: 'update',
        before: currentWorldview || undefined,
        after: newWorldview,
        reason: `${shifted.length} 次信念动摇累积，世界观发生演化`,
      },
    ],
    applyTo: (c) => ({
      ...c,
      psychology: {
        worldview: newWorldview,
        copingMechanisms: c.psychology?.copingMechanisms ?? [],
        emotionalTriggers: c.psychology?.emotionalTriggers ?? [],
      },
    }),
  };
}

// 规则 3：未解决创伤累积 → 内在矛盾增加
function traumaContradictionRule(ctx: RuleContext): RuleOutcome | null {
  const { character } = ctx;
  const trauma = character.growthTrack?.unresolvedTrauma ?? [];
  if (trauma.length < TRAUMA_MIN_COUNT_FOR_CONTRADICTION) return null;

  const newContradiction = `${trauma[0]} ↔ 形成心理阴影`;
  const existing = character.personalityModel?.innerContradictions ?? [];
  if (existing.some((c) => c.startsWith(trauma[0]))) return null;

  return {
    changes: [
      {
        field: 'personalityModel.innerContradictions',
        action: 'add',
        before: existing,
        after: [...existing, newContradiction],
        reason: `${trauma.length} 项未解决创伤累积，催生新的内在矛盾`,
      },
    ],
    applyTo: (c) => ({
      ...c,
      personalityModel: {
        traits: c.personalityModel?.traits ?? [],
        innerContradictions: [...(c.personalityModel?.innerContradictions ?? []), newContradiction],
        moralBoundary: c.personalityModel?.moralBoundary ?? [],
      },
    }),
  };
}

// 规则 4：trust 累积负值 → 防备心重
function trustNegativeRule(ctx: RuleContext): RuleOutcome | null {
  const { character, history } = ctx;
  const total = accumulateTrustDelta(history);
  if (total >= TRUST_NEGATIVE_ACCUMULATION_THRESHOLD) return null;

  const traits = character.personalityModel?.traits ?? [];
  if (traits.includes(TRUST_NEGATIVE_TRAIT)) return null;

  return {
    changes: [
      {
        field: 'personalityModel.traits',
        action: 'add',
        before: traits,
        after: [...traits, TRUST_NEGATIVE_TRAIT],
        reason: `信任累积变化 ${total}，对人产生防备`,
      },
    ],
    applyTo: (c) => ({
      ...c,
      personalityModel: {
        traits: [...(c.personalityModel?.traits ?? []), TRUST_NEGATIVE_TRAIT],
        innerContradictions: c.personalityModel?.innerContradictions ?? [],
        moralBoundary: c.personalityModel?.moralBoundary ?? [],
      },
    }),
  };
}

// 规则 5：有内容证据的关键事件 → 追加里程碑
function criticalMilestoneRule(ctx: RuleContext): RuleOutcome | null {
  const { character, history, currentChapter } = ctx;
  const chapterSnap = history.filter((s) => s.chapterNumber === currentChapter);
  if (chapterSnap.length === 0) return null;
  const critical = chapterSnap.find((s) => s.isCritical);
  if (!critical) return null;

  const eventEvidence = critical.beliefShift?.trim()
    || critical.trustChanges.find(change => change.reason.trim())?.reason.trim();
  if (!eventEvidence) return null;

  const milestones = character.growthTrack?.milestones ?? [];
  if (milestones.some((m) => m.chapter === currentChapter)) return null;

  const newMilestone: CharacterGrowthMilestone = {
    chapter: currentChapter,
    event: eventEvidence.slice(0, 120),
    insight: critical.beliefShift || '',
  };

  return {
    changes: [
      {
        field: 'growthTrack.milestones',
        action: 'add',
        before: milestones,
        after: [...milestones, newMilestone],
        reason: `第 ${currentChapter} 章触发关键事件，记录成长里程碑`,
      },
    ],
    applyTo: (c) => ({
      ...c,
      growthTrack: {
        milestones: [...(c.growthTrack?.milestones ?? []), newMilestone],
        archivedMilestonesSummary: c.growthTrack?.archivedMilestonesSummary ?? '',
        unresolvedTrauma: c.growthTrack?.unresolvedTrauma ?? [],
        pendingPromises: c.growthTrack?.pendingPromises ?? [],
      },
    }),
  };
}

const ALL_RULES: EvolutionRule[] = [
  stressHighRule,
  beliefShiftAccumulationRule,
  traumaContradictionRule,
  trustNegativeRule,
  criticalMilestoneRule,
];

// ─── 主入口 ──────────────────────────────────────────────────────────

/**
 * 对一本小说的所有角色执行自主演化。
 * 应在章节定稿流程末尾、角色状态快照保存完成后调用。
 *
 * @returns 触发了演化的角色及变更明细（用于日志/UI 展示）
 */
export async function evolveCharactersAuto(
  novelManager: EvolverNovelManager,
  novelId: string,
  currentChapter: number,
): Promise<EvolutionResult[]> {
  const [characters, allSnapshots] = await Promise.all([
    novelManager.getCharacters(novelId),
    novelManager.getCharacterStateSnapshots(novelId).catch(() => [] as CharacterStateSnapshot[]),
  ]);

  const results: EvolutionResult[] = [];

  for (const character of characters) {
    // autoEvolve=false → 作者手动控制，跳过
    if (character.autoEvolve === false) continue;
    // 已退场/死亡的角色不再演化
    if (character.status === 'dead' || character.status === 'exited') continue;

    const history = recentSnapshots(allSnapshots, character.id, MAX_HISTORY_SNAPSHOTS);
    if (history.length === 0) continue;

    const ctx: RuleContext = { character, history, currentChapter };
    const changes: EvolutionChange[] = [];
    let evolved = character;

    for (const rule of ALL_RULES) {
      try {
        const outcome = rule(ctx);
        if (!outcome || outcome.changes.length === 0) continue;
        // 把规则应用到上一轮的 evolved 副本，串行累积
        evolved = outcome.applyTo(evolved);
        changes.push(...outcome.changes);
      } catch {
        // 单条规则失败不影响其他规则
      }
    }

    if (changes.length === 0) continue;

    evolved.updatedAt = new Date().toISOString();
    await novelManager.saveCharacter(novelId, evolved);

    results.push({
      characterId: character.id,
      characterName: character.name,
      chapterNumber: currentChapter,
      changes,
    });
  }

  return results;
}
