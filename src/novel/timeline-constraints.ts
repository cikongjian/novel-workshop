/**
 * 时间线约束引擎
 *
 * 从事实图谱中提取时间约束，并验证事件序列的一致性。
 * 类似 git 的 bisect 思想——定位时间线矛盾发生的精确位置。
 */

import type { TimelineEvent, Contradiction } from './fact-graph-types.js';
import type { CausalChainEntry } from './story-state-types.js';
import { randomUUID } from 'node:crypto';

// ── 常量 ──────────────────────────────────────────────────────────

const DEFAULT_MAX_GAP_CHAPTERS = 50;
const MAX_VIOLATIONS_PER_RUN = 20;

// ── 类型 ──────────────────────────────────────────────────────────

export type ConstraintType = 'before' | 'after' | 'during' | 'within_n_chapters';

export type ConstraintSource = 'explicit' | 'inferred';

export interface TemporalConstraint {
  type: ConstraintType;
  /** Event A description or ID */
  eventA: string;
  eventAChapter: number;
  /** Event B description or ID */
  eventB: string;
  eventBChapter: number;
  /** Maximum chapter gap (for within_n_chapters type) */
  maxGap?: number;
  source: ConstraintSource;
}

export interface ConstraintViolation {
  constraint: TemporalConstraint;
  violation: string;
  chapter: number;
  severity: 'error' | 'warning';
}

// ── 约束提取 ──────────────────────────────────────────────────────

/**
 * Extract temporal constraints from timeline events and causal chains.
 *
 * Rules:
 * 1. Causal chains: cause must happen before effect (inferred 'before')
 * 2. dayNumber monotonicity: non-flashback events should have non-decreasing dayNumber
 * 3. Pending effects: must occur within N chapters of cause (inferred 'within_n_chapters')
 */
export function extractTemporalConstraints(
  timelineEvents: TimelineEvent[],
  causalChains: CausalChainEntry[],
): TemporalConstraint[] {
  const constraints: TemporalConstraint[] = [];

  // From causal chains: cause must be before all resolved effects
  for (const chain of causalChains) {
    for (const effect of chain.resolvedEffects) {
      constraints.push({
        type: 'before',
        eventA: chain.cause,
        eventAChapter: chain.causeChapter,
        eventB: effect,
        eventBChapter: chain.causeChapter, // we don't know exact chapter of effect
        source: 'inferred',
      });
    }

    // Pending effects should resolve within a reasonable window
    for (const pending of chain.pendingEffects) {
      constraints.push({
        type: 'within_n_chapters',
        eventA: chain.cause,
        eventAChapter: chain.causeChapter,
        eventB: pending,
        eventBChapter: 0, // not yet happened
        maxGap: DEFAULT_MAX_GAP_CHAPTERS,
        source: 'inferred',
      });
    }
  }

  // From timeline: dayNumber monotonicity (non-flashback events)
  const nonFlashbackEvents = timelineEvents
    .filter(e => !e.isFlashback && e.dayNumber !== undefined)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  for (let i = 1; i < nonFlashbackEvents.length; i++) {
    const prev = nonFlashbackEvents[i - 1];
    const curr = nonFlashbackEvents[i];
    if (prev.dayNumber !== undefined && curr.dayNumber !== undefined) {
      constraints.push({
        type: 'before',
        eventA: prev.summary,
        eventAChapter: prev.chapterNumber,
        eventB: curr.summary,
        eventBChapter: curr.chapterNumber,
        source: 'inferred',
      });
    }
  }

  return constraints;
}

// ── 约束验证 ──────────────────────────────────────────────────────

/**
 * Validate timeline events against extracted temporal constraints.
 * Returns a list of violations.
 */
export function validateTimeline(
  timelineEvents: TimelineEvent[],
  constraints: TemporalConstraint[],
  currentChapter: number,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Build a chapter lookup for events by summary prefix
  const eventByChapter = new Map<number, TimelineEvent[]>();
  for (const e of timelineEvents) {
    const list = eventByChapter.get(e.chapterNumber) ?? [];
    list.push(e);
    eventByChapter.set(e.chapterNumber, list);
  }

  for (const constraint of constraints) {
    if (violations.length >= MAX_VIOLATIONS_PER_RUN) break;

    switch (constraint.type) {
      case 'before': {
        // Check dayNumber ordering for monotonicity violations
        const violation = checkBeforeConstraint(timelineEvents, constraint);
        if (violation) violations.push(violation);
        break;
      }
      case 'within_n_chapters': {
        // Check if pending effects are overdue
        const maxGap = constraint.maxGap ?? DEFAULT_MAX_GAP_CHAPTERS;
        const chaptersSinceCause = currentChapter - constraint.eventAChapter;
        if (chaptersSinceCause > maxGap) {
          violations.push({
            constraint,
            violation: `因果链「${constraint.eventA}」已过${chaptersSinceCause}章，` +
              `待兑现效果「${constraint.eventB}」超过${maxGap}章窗口`,
            chapter: constraint.eventAChapter,
            severity: chaptersSinceCause > maxGap * 2 ? 'error' : 'warning',
          });
        }
        break;
      }
      // 'after' and 'during' are symmetric checks, omitted for now
    }
  }

  return violations;
}

function checkBeforeConstraint(
  events: TimelineEvent[],
  constraint: TemporalConstraint,
): ConstraintViolation | null {
  // Find events matching A and B by chapter
  const aEvents = events.filter(e =>
    e.chapterNumber === constraint.eventAChapter && !e.isFlashback && e.dayNumber !== undefined,
  );
  const bEvents = events.filter(e =>
    e.chapterNumber === constraint.eventBChapter && !e.isFlashback && e.dayNumber !== undefined,
  );

  // Check dayNumber regression
  for (const a of aEvents) {
    for (const b of bEvents) {
      if (
        a.dayNumber !== undefined &&
        b.dayNumber !== undefined &&
        a.chapterNumber < b.chapterNumber &&
        a.dayNumber > b.dayNumber
      ) {
        return {
          constraint,
          violation: `时间回退：第${a.chapterNumber}章事件（第${a.dayNumber}天）` +
            `发生在第${b.chapterNumber}章事件（第${b.dayNumber}天）之后`,
          chapter: b.chapterNumber,
          severity: 'error',
        };
      }
    }
  }
  return null;
}

// ── 矛盾转换 ──────────────────────────────────────────────────────

/** Convert constraint violations to Contradiction format for the fact graph */
export function violationsToContradictions(
  violations: ConstraintViolation[],
): Contradiction[] {
  return violations.map(v => ({
    id: randomUUID(),
    type: 'temporal-constraint-violation' as const,
    severity: v.severity === 'error' ? 'critical' as const : 'warning' as const,
    chapterNumbers: [v.chapter, v.constraint.eventAChapter].filter((n, i, a) => a.indexOf(n) === i),
    description: v.violation,
    evidence: [`约束来源: ${v.constraint.source}`, `事件A: ${v.constraint.eventA}`, `事件B: ${v.constraint.eventB}`],
    evidenceDetails: [],
    suggestion: v.severity === 'error'
      ? '需要修正时间线矛盾，检查章节间的时间标记是否一致'
      : '建议尽快安排因果链的兑现',
    resolved: false,
    confidence: v.severity === 'error' ? 0.9 : 0.6,
    entityName: '',
  }));
}
