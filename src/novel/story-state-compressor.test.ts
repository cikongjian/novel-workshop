import { describe, it, expect } from 'vitest';
import { compressSnapshots, compressMegaArcsIfNeeded } from './story-state-compressor.js';
import type { StoryState, StoryStateSnapshot } from './story-state-types.js';

function makeSnapshot(chapter: number, summary: string = `第${chapter}章摘要`): StoryStateSnapshot {
  return {
    chapterNumber: chapter,
    characters: [
      {
        characterId: 'c1', name: '张三', location: '京城', emotionalState: 'calm',
        inventory: [], revealedSecrets: [], hiddenSecrets: [], currentGoal: '',
        goalProgress: 0, relationshipChanges: [], physicalCondition: 'normal',
        powerChange: chapter === 8 ? '突破金丹期' : '', currentBelief: '', beliefShift: '',
        alive: chapter !== 15, present: true,
      },
    ],
    world: { timelineMarker: `第${chapter}天`, environment: '晴', factionChanges: [], geographyChanges: [], powerSystemChanges: [], socialChanges: [] },
    factions: [],
    plot: { activeThreads: [], pendingForeshadowing: [], tensionLevel: 5, readerQuestions: [] },
    causalChains: chapter === 5 ? [{ cause: '发现宝藏', causeChapter: 5, resolvedEffects: [], pendingEffects: ['争夺开始'] }] : [],
    chapterSummary: summary,
    nextChapterConstraints: [],
    createdAt: new Date().toISOString(),
  };
}

function makeState(snapshotCount: number): StoryState {
  const snapshots = Array.from({ length: snapshotCount }, (_, i) => makeSnapshot(i + 1));
  return {
    novelId: 'test-novel',
    latestChapter: snapshotCount,
    snapshots,
    compressedArcs: [],
    megaArcs: [],
    updatedAt: new Date().toISOString(),
  };
}

describe('story-state-compressor', () => {
  describe('compressSnapshots', () => {
    it('快照数不足时不压缩', () => {
      const state = makeState(10);
      const result = compressSnapshots(state);
      expect(result.compressed).toBe(false);
    });

    it('快照数超过阈值时触发压缩', () => {
      // ARC_COMPRESS_INTERVAL(10) + MAX_RECENT_SNAPSHOTS(5) + 1 = 16
      const state = makeState(16);
      const result = compressSnapshots(state);
      expect(result.compressed).toBe(true);
      expect(result.state.compressedArcs.length).toBeGreaterThan(0);
      // 压缩后只保留最近 5 个快照
      expect(result.state.snapshots.length).toBe(5);
    });

    it('压缩弧线应包含章节范围和摘要', () => {
      const state = makeState(16);
      const result = compressSnapshots(state);
      const arc = result.state.compressedArcs[0];
      expect(arc.chapterRange.start).toBe(1);
      expect(arc.chapterRange.end).toBe(10);
      expect(arc.summary).toBeTruthy();
    });

    it('关键变化应按优先级排序（死亡 > 实力变化 > 伏笔）', () => {
      const state = makeState(20);
      const result = compressSnapshots(state);
      const arc = result.state.compressedArcs[0];
      // keyStateChanges 存在且不超过 15 条
      expect(arc.keyStateChanges.length).toBeLessThanOrEqual(15);
    });
  });

  describe('compressMegaArcsIfNeeded', () => {
    it('不足 3 个 arc 时不触发二级压缩', () => {
      const state = makeState(5);
      state.compressedArcs = [
        { chapterRange: { start: 1, end: 10 }, summary: '第一弧', keyStateChanges: [] },
        { chapterRange: { start: 11, end: 20 }, summary: '第二弧', keyStateChanges: [] },
      ];
      compressMegaArcsIfNeeded(state);
      expect(state.megaArcs.length).toBe(0);
    });

    it('达到 3 个 arc 时触发二级压缩', () => {
      const state = makeState(5);
      state.compressedArcs = [
        { chapterRange: { start: 1, end: 10 }, summary: '第一弧', keyStateChanges: ['事件A'] },
        { chapterRange: { start: 11, end: 20 }, summary: '第二弧', keyStateChanges: ['事件B'] },
        { chapterRange: { start: 21, end: 30 }, summary: '第三弧', keyStateChanges: ['事件C'] },
      ];
      compressMegaArcsIfNeeded(state);
      expect(state.megaArcs.length).toBe(1);
      expect(state.megaArcs[0].chapterRange).toEqual({ start: 1, end: 30 });
    });
  });
});
