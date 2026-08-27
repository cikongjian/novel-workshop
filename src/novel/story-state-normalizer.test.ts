import { describe, expect, it } from 'vitest';
import { normalizeLoadedStoryState } from './story-state-normalizer.js';
import { formatSnapshot } from './story-state-formatter.js';

const NOVEL_ID = 'b0a8a977-aea5-4f3f-a6f7-4190c32eb9bc';

/** 构造一条结构完整的快照（仅必填字段），用于混入损坏数据测试 */
function validSnapshot(chapterNumber: number) {
  return {
    chapterNumber,
    characters: [
      {
        characterId: 'c1',
        name: '主角',
        relationshipChanges: [
          { targetName: '反派', change: '结仇', vector: { trust: -40, affection: -20, respect: 0, obligation: 0, fear: 10, rivalry: 30 } },
        ],
      },
    ],
    world: { factionChanges: [{ factionName: '朝廷', change: '动荡' }] },
    plot: { activeThreads: [{ threadName: '复仇', status: 'active', summary: '展开' }] },
    causalChains: [{ cause: '灭门', causeChapter: 1, pendingEffects: ['血债'] }],
    chapterSummary: `第${chapterNumber}章摘要`,
    nextChapterConstraints: ['不得让主角死亡'],
    createdAt: '2026-07-10T00:00:00.000Z',
  };
}

describe('normalizeLoadedStoryState', () => {
  it('补全缺失的数组字段（复现 relationshipChanges=undefined 崩溃）', () => {
    // 模拟批量生成失败写入的半成品快照：角色缺 relationshipChanges / inventory 等
    const corrupt = {
      novelId: NOVEL_ID,
      latestChapter: 35,
      snapshots: [
        {
          chapterNumber: 35,
          // 角色只写了 name，其余数组字段全部缺失 → 原始加载下 formatSnapshot 会崩溃
          characters: [{ characterId: 'c1', name: '主角' }],
          createdAt: '2026-07-10T00:00:00.000Z',
        },
      ],
      compressedArcs: [],
      updatedAt: '2026-07-10T00:00:00.000Z',
    };

    const { state, droppedSnapshots } = normalizeLoadedStoryState(corrupt, NOVEL_ID);
    expect(droppedSnapshots).toBe(0); // 字段缺失由 default 补全，不丢弃
    expect(state.snapshots).toHaveLength(1);
    const ch = state.snapshots[0].characters[0];
    expect(Array.isArray(ch.relationshipChanges)).toBe(true);
    expect(ch.relationshipChanges).toEqual([]);
    expect(Array.isArray(ch.inventory)).toBe(true);

    // 关键：规整后的快照送入 formatSnapshot 不再抛错
    expect(() => formatSnapshot(NOVEL_ID, state.snapshots[0])).not.toThrow();
    const text = formatSnapshot(NOVEL_ID, state.snapshots[0]);
    expect(text).toContain('主角');
  });

  it('丢弃结构损坏的单条快照，保留其余有效快照', () => {
    const broken = {
      novelId: NOVEL_ID,
      snapshots: [
        { chapterNumber: 34, characters: [], createdAt: '2026-07-09T00:00:00.000Z' },
        { /* 完全空对象：缺 chapterNumber，无法解析 */ },
        'not-a-snapshot',
        validSnapshot(35),
      ],
    };

    const { state, droppedSnapshots } = normalizeLoadedStoryState(broken, NOVEL_ID);
    expect(droppedSnapshots).toBe(2);
    expect(state.snapshots.map(s => s.chapterNumber)).toEqual([34, 35]);
    expect(state.latestChapter).toBe(35);
  });

  it('非对象 / 缺字段输入回退到空状态', () => {
    expect(normalizeLoadedStoryState(null, NOVEL_ID).state.snapshots).toEqual([]);
    expect(normalizeLoadedStoryState('oops', NOVEL_ID).state.snapshots).toEqual([]);
    expect(normalizeLoadedStoryState({}, NOVEL_ID).state.latestChapter).toBe(0);
  });

  it('补全缺失的 megaArcs / compressedArcs，且过滤损坏弧线', () => {
    const data = {
      novelId: NOVEL_ID,
      snapshots: [],
      compressedArcs: [
        { chapterRange: { start: 1, end: 5 }, summary: '开篇' },
        { /* 损坏弧线 */ },
      ],
    };
    const { state } = normalizeLoadedStoryState(data, NOVEL_ID);
    expect(state.compressedArcs).toHaveLength(1);
    expect(state.megaArcs).toEqual([]);
  });
});
