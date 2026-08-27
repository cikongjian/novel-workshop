import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  extractTemporalConstraints,
  validateTimeline,
  violationsToContradictions,
} from './timeline-constraints.js';
import type { TimelineEvent } from './fact-graph-types.js';
import type { CausalChainEntry } from './story-state-types.js';

// ── 辅助工厂 ─────────────────────────────────────────────────

function makeTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: randomUUID(),
    chapterNumber: 1,
    timeMarker: '',
    summary: '默认事件',
    involvedCharacterNames: [],
    location: '',
    importance: 3,
    isFlashback: false,
    evidence: '',
    sentenceIndex: 0,
    ...overrides,
  };
}

function makeCausalChain(overrides: Partial<CausalChainEntry> = {}): CausalChainEntry {
  return {
    cause: '触发事件',
    causeChapter: 1,
    resolvedEffects: [],
    pendingEffects: [],
    ...overrides,
  };
}

// ── extractTemporalConstraints ───────────────────────────────

describe('extractTemporalConstraints', () => {
  it('空输入返回空约束', () => {
    const result = extractTemporalConstraints([], []);
    expect(result).toEqual([]);
  });

  it('从因果链的已兑现效果生成 before 约束', () => {
    const chains: CausalChainEntry[] = [
      makeCausalChain({
        cause: '王子被刺杀',
        causeChapter: 3,
        resolvedEffects: ['内战爆发', '公主流亡'],
      }),
    ];
    const result = extractTemporalConstraints([], chains);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type: 'before',
      eventA: '王子被刺杀',
      eventAChapter: 3,
      eventB: '内战爆发',
      source: 'inferred',
    });
    expect(result[1]).toMatchObject({
      type: 'before',
      eventA: '王子被刺杀',
      eventAChapter: 3,
      eventB: '公主流亡',
      source: 'inferred',
    });
  });

  it('从因果链的待兑现效果生成 within_n_chapters 约束', () => {
    const chains: CausalChainEntry[] = [
      makeCausalChain({
        cause: '禁术开启',
        causeChapter: 5,
        pendingEffects: ['反噬降临'],
      }),
    ];
    const result = extractTemporalConstraints([], chains);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'within_n_chapters',
      eventA: '禁术开启',
      eventAChapter: 5,
      eventB: '反噬降临',
      eventBChapter: 0,
      maxGap: 50,
      source: 'inferred',
    });
  });

  it('同时处理 resolvedEffects 和 pendingEffects', () => {
    const chains: CausalChainEntry[] = [
      makeCausalChain({
        cause: '大爆炸',
        causeChapter: 10,
        resolvedEffects: ['城墙倒塌'],
        pendingEffects: ['瘟疫蔓延'],
      }),
    ];
    const result = extractTemporalConstraints([], chains);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('before');
    expect(result[1].type).toBe('within_n_chapters');
  });

  it('从时间线事件中按章节排序生成 dayNumber 单调性约束', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 1, summary: '事件A' }),
      makeTimelineEvent({ chapterNumber: 3, dayNumber: 5, summary: '事件C' }),
      makeTimelineEvent({ chapterNumber: 2, dayNumber: 3, summary: '事件B' }),
    ];
    const result = extractTemporalConstraints(events, []);

    // 排序后应为: ch1→ch2→ch3，产生 2 个相邻 before 约束
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      type: 'before',
      eventA: '事件A',
      eventAChapter: 1,
      eventB: '事件B',
      eventBChapter: 2,
      source: 'inferred',
    });
    expect(result[1]).toMatchObject({
      type: 'before',
      eventA: '事件B',
      eventAChapter: 2,
      eventB: '事件C',
      eventBChapter: 3,
    });
  });

  it('闪回事件不参与 dayNumber 单调性约束', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 10, summary: '现在' }),
      makeTimelineEvent({ chapterNumber: 2, dayNumber: 1, summary: '回忆', isFlashback: true }),
      makeTimelineEvent({ chapterNumber: 3, dayNumber: 15, summary: '之后' }),
    ];
    const result = extractTemporalConstraints(events, []);

    // 闪回被排除，只剩 ch1→ch3，产生 1 个约束
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      eventA: '现在',
      eventB: '之后',
    });
  });

  it('无 dayNumber 的事件不参与单调性约束', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 5, summary: '有日期' }),
      makeTimelineEvent({ chapterNumber: 2, summary: '无日期' }), // dayNumber undefined
      makeTimelineEvent({ chapterNumber: 3, dayNumber: 10, summary: '也有日期' }),
    ];
    const result = extractTemporalConstraints(events, []);

    // 只有 ch1 和 ch3 有 dayNumber，产生 1 个约束
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      eventA: '有日期',
      eventB: '也有日期',
    });
  });

  it('单个时间线事件不产生约束', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 1, summary: '唯一事件' }),
    ];
    const result = extractTemporalConstraints(events, []);
    expect(result).toEqual([]);
  });

  it('多条因果链各自独立产生约束', () => {
    const chains: CausalChainEntry[] = [
      makeCausalChain({ cause: '原因A', causeChapter: 1, resolvedEffects: ['效果A1'] }),
      makeCausalChain({ cause: '原因B', causeChapter: 5, pendingEffects: ['效果B1'] }),
    ];
    const result = extractTemporalConstraints([], chains);

    expect(result).toHaveLength(2);
    expect(result[0].eventA).toBe('原因A');
    expect(result[1].eventA).toBe('原因B');
  });

  it('因果链无效果时不产生约束', () => {
    const chains: CausalChainEntry[] = [
      makeCausalChain({ cause: '悬而未决', causeChapter: 1 }),
    ];
    const result = extractTemporalConstraints([], chains);
    expect(result).toEqual([]);
  });
});

// ── validateTimeline ─────────────────────────────────────────

describe('validateTimeline', () => {
  it('无约束返回空违规列表', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 1 }),
    ];
    const result = validateTimeline(events, [], 10);
    expect(result).toEqual([]);
  });

  it('空事件和空约束返回空违规列表', () => {
    const result = validateTimeline([], [], 1);
    expect(result).toEqual([]);
  });

  it('检测 dayNumber 时间回退（before 约束违规）', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 10, summary: '第10天事件' }),
      makeTimelineEvent({ chapterNumber: 3, dayNumber: 5, summary: '第5天事件' }),
    ];
    const constraints = extractTemporalConstraints(events, []);
    const violations = validateTimeline(events, constraints, 5);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('error');
    expect(violations[0].violation).toContain('时间回退');
  });

  it('dayNumber 正常递增不产生违规', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 1, summary: '开始' }),
      makeTimelineEvent({ chapterNumber: 2, dayNumber: 3, summary: '中间' }),
      makeTimelineEvent({ chapterNumber: 3, dayNumber: 7, summary: '结尾' }),
    ];
    const constraints = extractTemporalConstraints(events, []);
    const violations = validateTimeline(events, constraints, 5);

    expect(violations).toEqual([]);
  });

  it('检测超时的 within_n_chapters 约束（warning 级别）', () => {
    const constraints = [{
      type: 'within_n_chapters' as const,
      eventA: '种下伏笔',
      eventAChapter: 1,
      eventB: '伏笔兑现',
      eventBChapter: 0,
      maxGap: 10,
      source: 'inferred' as const,
    }];
    // currentChapter = 15, chaptersSinceCause = 14, > maxGap(10) but <= 20
    const violations = validateTimeline([], constraints, 15);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('warning');
    expect(violations[0].violation).toContain('待兑现效果');
  });

  it('严重超时的 within_n_chapters 约束升级为 error', () => {
    const constraints = [{
      type: 'within_n_chapters' as const,
      eventA: '远古伏笔',
      eventAChapter: 1,
      eventB: '从未兑现',
      eventBChapter: 0,
      maxGap: 10,
      source: 'inferred' as const,
    }];
    // currentChapter = 25, chaptersSinceCause = 24, > maxGap * 2 (20)
    const violations = validateTimeline([], constraints, 25);

    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('error');
  });

  it('within_n_chapters 未超期不产生违规', () => {
    const constraints = [{
      type: 'within_n_chapters' as const,
      eventA: '新伏笔',
      eventAChapter: 5,
      eventB: '待兑现',
      eventBChapter: 0,
      maxGap: 50,
      source: 'inferred' as const,
    }];
    // currentChapter = 10, chaptersSinceCause = 5, <= maxGap(50)
    const violations = validateTimeline([], constraints, 10);

    expect(violations).toEqual([]);
  });

  it('within_n_chapters 无 maxGap 时使用默认值 50', () => {
    const constraints = [{
      type: 'within_n_chapters' as const,
      eventA: '原因',
      eventAChapter: 1,
      eventB: '效果',
      eventBChapter: 0,
      source: 'inferred' as const,
      // maxGap 未设置，应默认 50
    }];
    // currentChapter = 40, gap = 39, <= 50 → 无违规
    const violations = validateTimeline([], constraints, 40);
    expect(violations).toEqual([]);

    // currentChapter = 60, gap = 59, > 50 → 违规
    const violations2 = validateTimeline([], constraints, 60);
    expect(violations2).toHaveLength(1);
  });

  it('闪回事件不触发 before 约束的 dayNumber 回退检测', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 10, summary: '现在' }),
      makeTimelineEvent({ chapterNumber: 2, dayNumber: 1, summary: '闪回', isFlashback: true }),
    ];
    // 提取约束时闪回已被排除，所以不会有 before 约束涉及闪回事件
    const constraints = extractTemporalConstraints(events, []);
    expect(constraints).toHaveLength(0);

    const violations = validateTimeline(events, constraints, 5);
    expect(violations).toEqual([]);
  });

  it('violations 总数不超过 MAX_VIOLATIONS_PER_RUN (20)', () => {
    // 创建超过 20 个必然违规的 within_n_chapters 约束
    const constraints = Array.from({ length: 30 }, (_, i) => ({
      type: 'within_n_chapters' as const,
      eventA: `原因${i}`,
      eventAChapter: 1,
      eventB: `效果${i}`,
      eventBChapter: 0,
      maxGap: 5,
      source: 'inferred' as const,
    }));
    // currentChapter = 100, 每个 gap = 99, 远超 maxGap(5)
    const violations = validateTimeline([], constraints, 100);

    expect(violations).toHaveLength(20);
  });

  it('after/during 类型约束当前被忽略，不产生违规', () => {
    const constraints = [
      {
        type: 'after' as const,
        eventA: 'A',
        eventAChapter: 1,
        eventB: 'B',
        eventBChapter: 2,
        source: 'explicit' as const,
      },
      {
        type: 'during' as const,
        eventA: 'C',
        eventAChapter: 3,
        eventB: 'D',
        eventBChapter: 3,
        source: 'explicit' as const,
      },
    ];
    const violations = validateTimeline([], constraints, 10);
    expect(violations).toEqual([]);
  });

  it('before 约束：相同章节内不产生回退违规', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 5, dayNumber: 10, summary: '早' }),
      makeTimelineEvent({ chapterNumber: 5, dayNumber: 8, summary: '晚' }),
    ];
    // 相同章节 chapterNumber，a.chapterNumber < b.chapterNumber 不成立
    const constraints = [{
      type: 'before' as const,
      eventA: '早',
      eventAChapter: 5,
      eventB: '晚',
      eventBChapter: 5,
      source: 'inferred' as const,
    }];
    const violations = validateTimeline(events, constraints, 10);
    expect(violations).toEqual([]);
  });
});

// ── violationsToContradictions ───────────────────────────────

describe('violationsToContradictions', () => {
  it('空违规列表返回空矛盾列表', () => {
    const result = violationsToContradictions([]);
    expect(result).toEqual([]);
  });

  it('error 级别违规映射为 critical 矛盾', () => {
    const violations = [{
      constraint: {
        type: 'before' as const,
        eventA: '事件A',
        eventAChapter: 1,
        eventB: '事件B',
        eventBChapter: 3,
        source: 'inferred' as const,
      },
      violation: '时间回退：第1章在第3章之后',
      chapter: 3,
      severity: 'error' as const,
    }];
    const result = violationsToContradictions(violations);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('temporal-constraint-violation');
    expect(result[0].severity).toBe('critical');
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].resolved).toBe(false);
    expect(result[0].suggestion).toContain('修正时间线矛盾');
  });

  it('warning 级别违规映射为 warning 矛盾', () => {
    const violations = [{
      constraint: {
        type: 'within_n_chapters' as const,
        eventA: '伏笔',
        eventAChapter: 2,
        eventB: '兑现',
        eventBChapter: 0,
        maxGap: 10,
        source: 'inferred' as const,
      },
      violation: '因果链超期',
      chapter: 2,
      severity: 'warning' as const,
    }];
    const result = violationsToContradictions(violations);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('warning');
    expect(result[0].confidence).toBe(0.6);
    expect(result[0].suggestion).toContain('因果链的兑现');
  });

  it('每个矛盾有唯一 UUID', () => {
    const violation = {
      constraint: {
        type: 'before' as const,
        eventA: 'A',
        eventAChapter: 1,
        eventB: 'B',
        eventBChapter: 2,
        source: 'inferred' as const,
      },
      violation: '测试',
      chapter: 2,
      severity: 'error' as const,
    };
    const result = violationsToContradictions([violation, violation]);

    expect(result[0].id).not.toBe(result[1].id);
    // 每个 id 都是 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result[0].id).toMatch(uuidRegex);
    expect(result[1].id).toMatch(uuidRegex);
  });

  it('chapterNumbers 去重', () => {
    const violations = [{
      constraint: {
        type: 'before' as const,
        eventA: 'A',
        eventAChapter: 5, // 与 chapter 相同
        eventB: 'B',
        eventBChapter: 5,
        source: 'inferred' as const,
      },
      violation: '测试',
      chapter: 5,
      severity: 'error' as const,
    }];
    const result = violationsToContradictions(violations);

    // chapter=5 和 eventAChapter=5 去重后只剩 [5]
    expect(result[0].chapterNumbers).toEqual([5]);
  });

  it('chapterNumbers 包含不同的章节号', () => {
    const violations = [{
      constraint: {
        type: 'before' as const,
        eventA: 'A',
        eventAChapter: 1,
        eventB: 'B',
        eventBChapter: 3,
        source: 'inferred' as const,
      },
      violation: '测试',
      chapter: 3,
      severity: 'error' as const,
    }];
    const result = violationsToContradictions(violations);

    expect(result[0].chapterNumbers).toEqual([3, 1]);
  });

  it('evidence 包含约束来源和事件信息', () => {
    const violations = [{
      constraint: {
        type: 'before' as const,
        eventA: '失踪',
        eventAChapter: 2,
        eventB: '重逢',
        eventBChapter: 8,
        source: 'explicit' as const,
      },
      violation: '某种违规',
      chapter: 8,
      severity: 'warning' as const,
    }];
    const result = violationsToContradictions(violations);

    expect(result[0].evidence).toContain('约束来源: explicit');
    expect(result[0].evidence).toContain('事件A: 失踪');
    expect(result[0].evidence).toContain('事件B: 重逢');
  });

  it('description 直接使用 violation 文本', () => {
    const violations = [{
      constraint: {
        type: 'before' as const,
        eventA: 'A',
        eventAChapter: 1,
        eventB: 'B',
        eventBChapter: 2,
        source: 'inferred' as const,
      },
      violation: '自定义违规描述文本',
      chapter: 2,
      severity: 'error' as const,
    }];
    const result = violationsToContradictions(violations);
    expect(result[0].description).toBe('自定义违规描述文本');
  });
});

// ── 端到端集成场景 ───────────────────────────────────────────

describe('端到端：提取 → 验证 → 转换', () => {
  it('正常时间线全流程无矛盾', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 1, summary: '出发' }),
      makeTimelineEvent({ chapterNumber: 2, dayNumber: 3, summary: '抵达' }),
      makeTimelineEvent({ chapterNumber: 3, dayNumber: 7, summary: '战斗' }),
    ];
    const chains: CausalChainEntry[] = [
      makeCausalChain({
        cause: '出发',
        causeChapter: 1,
        resolvedEffects: ['抵达'],
      }),
    ];

    const constraints = extractTemporalConstraints(events, chains);
    const violations = validateTimeline(events, constraints, 3);
    const contradictions = violationsToContradictions(violations);

    expect(contradictions).toEqual([]);
  });

  it('时间回退全流程产生 critical 矛盾', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 10, summary: '第一章-第10天' }),
      makeTimelineEvent({ chapterNumber: 2, dayNumber: 5, summary: '第二章-第5天' }),
    ];

    const constraints = extractTemporalConstraints(events, []);
    const violations = validateTimeline(events, constraints, 5);
    const contradictions = violationsToContradictions(violations);

    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].type).toBe('temporal-constraint-violation');
    expect(contradictions[0].severity).toBe('critical');
  });

  it('混合闪回和正常事件，只检测正常事件的回退', () => {
    const events: TimelineEvent[] = [
      makeTimelineEvent({ chapterNumber: 1, dayNumber: 10, summary: '现实' }),
      makeTimelineEvent({ chapterNumber: 2, dayNumber: 1, summary: '回忆片段', isFlashback: true }),
      makeTimelineEvent({ chapterNumber: 3, dayNumber: 15, summary: '继续' }),
    ];

    const constraints = extractTemporalConstraints(events, []);
    const violations = validateTimeline(events, constraints, 5);

    // 闪回不参与约束提取，ch1(day10) → ch3(day15) 正常递增
    expect(violations).toEqual([]);
  });
});
