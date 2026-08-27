import { describe, it, expect } from 'vitest';
import type { StoryStateSnapshot } from './story-state-types.js';
import { computeDelta, applyDelta, reconstructAt, estimateDeltaSize } from './snapshot-delta.js';

/** 构建最小有效快照的工厂函数 */
function makeSnapshot(overrides: Partial<StoryStateSnapshot> = {}): StoryStateSnapshot {
  return {
    chapterNumber: 1,
    characters: [
      {
        characterId: 'c1', name: '张三', location: '京城', emotionalState: 'calm',
        inventory: ['剑'], revealedSecrets: [], hiddenSecrets: [],
        currentGoal: '', goalProgress: 0, relationshipChanges: [],
        physicalCondition: 'normal', powerChange: '', currentBelief: '',
        beliefShift: '', alive: true, present: true,
      },
    ],
    world: {
      timelineMarker: '第一天', environment: '晴',
      factionChanges: [], geographyChanges: [], powerSystemChanges: [], socialChanges: [],
    },
    factions: [],
    plot: { activeThreads: [], pendingForeshadowing: [], tensionLevel: 5, readerQuestions: [] },
    causalChains: [],
    chapterSummary: '张三到达京城',
    nextChapterConstraints: ['张三在京城'],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ==================== computeDelta ====================

describe('computeDelta', () => {
  it('角色位置变化时产生正确的 set diff', () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot({
      chapterNumber: 2,
      characters: [
        { ...prev.characters[0], location: '洛阳', emotionalState: 'anxious' },
      ],
      chapterSummary: '张三前往洛阳',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(prev, curr);

    expect(delta.fromChapter).toBe(1);
    expect(delta.toChapter).toBe(2);
    expect(delta.chapterSummary).toBe('张三前往洛阳');
    expect(delta.deltas.length).toBeGreaterThan(0);

    const locationDelta = delta.deltas.find((d) => d.path.includes('location'));
    expect(locationDelta).toBeDefined();
    expect(locationDelta!.op).toBe('set');
    expect(locationDelta!.oldValue).toBe('京城');
    expect(locationDelta!.newValue).toBe('洛阳');

    const emotionDelta = delta.deltas.find((d) => d.path.includes('emotionalState'));
    expect(emotionDelta).toBeDefined();
    expect(emotionDelta!.op).toBe('set');
    expect(emotionDelta!.oldValue).toBe('calm');
    expect(emotionDelta!.newValue).toBe('anxious');
  });

  it('新增角色产生 add 操作，移除角色产生 remove 操作', () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot({
      chapterNumber: 2,
      characters: [
        prev.characters[0],
        {
          characterId: 'c2', name: '李四', location: '洛阳', emotionalState: 'neutral',
          inventory: [], revealedSecrets: [], hiddenSecrets: [],
          currentGoal: '寻宝', goalProgress: 0, relationshipChanges: [],
          physicalCondition: 'normal', powerChange: '', currentBelief: '',
          beliefShift: '', alive: true, present: true,
        },
      ],
      chapterSummary: '李四登场',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const addDelta = computeDelta(prev, curr);
    const addOps = addDelta.deltas.filter((d) => d.op === 'add');
    expect(addOps.length).toBeGreaterThanOrEqual(1);
    const addedChar = addOps.find((d) => {
      const nv = d.newValue as Record<string, unknown> | undefined;
      return nv && nv.name === '李四';
    });
    expect(addedChar).toBeDefined();

    // 反向：移除角色
    const removeDelta = computeDelta(curr, prev);
    const removeOps = removeDelta.deltas.filter((d) => d.op === 'remove');
    expect(removeOps.length).toBeGreaterThanOrEqual(1);
    const removedChar = removeOps.find((d) => {
      const ov = d.oldValue as Record<string, unknown> | undefined;
      return ov && ov.name === '李四';
    });
    expect(removedChar).toBeDefined();
  });

  it('完全相同的快照产生空 delta 列表', () => {
    const snap = makeSnapshot();
    const delta = computeDelta(snap, { ...snap });
    expect(delta.deltas).toHaveLength(0);
  });

  it('世界状态字段变化被正确检测', () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot({
      chapterNumber: 2,
      world: {
        ...prev.world,
        timelineMarker: '第二天',
        environment: '暴风雨',
      },
      chapterSummary: '暴风雨来临',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(prev, curr);
    const timelineDelta = delta.deltas.find((d) => d.path === 'world.timelineMarker');
    expect(timelineDelta).toBeDefined();
    expect(timelineDelta!.newValue).toBe('第二天');

    const envDelta = delta.deltas.find((d) => d.path === 'world.environment');
    expect(envDelta).toBeDefined();
    expect(envDelta!.newValue).toBe('暴风雨');
  });

  it('情节张力变化被正确检测', () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot({
      chapterNumber: 2,
      plot: { ...prev.plot, tensionLevel: 8, readerQuestions: ['张三的身世？'] },
      chapterSummary: '张力升级',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(prev, curr);
    const tensionDelta = delta.deltas.find((d) => d.path === 'plot.tensionLevel');
    expect(tensionDelta).toBeDefined();
    expect(tensionDelta!.newValue).toBe(8);
  });
});

// ==================== applyDelta ====================

describe('applyDelta', () => {
  it('将 delta 应用到基准快照，结果与预期一致', () => {
    const prev = makeSnapshot();
    const expected = makeSnapshot({
      chapterNumber: 2,
      characters: [
        { ...prev.characters[0], location: '洛阳', inventory: ['剑', '盾'] },
      ],
      world: { ...prev.world, environment: '雨' },
      chapterSummary: '张三到达洛阳',
      nextChapterConstraints: ['张三在洛阳'],
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(prev, expected);
    const result = applyDelta(prev, delta);

    expect(result.chapterNumber).toBe(2);
    expect(result.chapterSummary).toBe('张三到达洛阳');
    expect(result.nextChapterConstraints).toEqual(['张三在洛阳']);
    expect(result.characters[0].location).toBe('洛阳');
    expect(result.world.environment).toBe('雨');
  });

  it('applyDelta 不修改原始基准快照', () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot({
      chapterNumber: 2,
      characters: [{ ...prev.characters[0], location: '洛阳' }],
      chapterSummary: '移动',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(prev, curr);
    const originalLocation = prev.characters[0].location;
    applyDelta(prev, delta);

    expect(prev.characters[0].location).toBe(originalLocation);
    expect(prev.chapterNumber).toBe(1);
  });
});

// ==================== computeDelta + applyDelta 往返一致性 ====================

describe('computeDelta + applyDelta 往返一致性', () => {
  it('从 A 到 B 的 delta 应用到 A 后等于 B（角色位置 + 世界变化）', () => {
    const snapshotA = makeSnapshot();
    const snapshotB = makeSnapshot({
      chapterNumber: 2,
      characters: [
        { ...snapshotA.characters[0], location: '蜀山', emotionalState: 'determined', inventory: ['剑', '丹药'] },
      ],
      world: {
        ...snapshotA.world,
        timelineMarker: '第三天',
        environment: '多云',
        geographyChanges: ['发现蜀山秘境入口'],
      },
      plot: { ...snapshotA.plot, tensionLevel: 7 },
      chapterSummary: '张三到达蜀山',
      nextChapterConstraints: ['张三在蜀山', '丹药剩余两颗'],
      createdAt: '2024-01-03T00:00:00.000Z',
    });

    const delta = computeDelta(snapshotA, snapshotB);
    const reconstructed = applyDelta(snapshotA, delta);

    expect(reconstructed.chapterNumber).toBe(snapshotB.chapterNumber);
    expect(reconstructed.chapterSummary).toBe(snapshotB.chapterSummary);
    expect(reconstructed.nextChapterConstraints).toEqual(snapshotB.nextChapterConstraints);
    expect(reconstructed.createdAt).toBe(snapshotB.createdAt);
    expect(reconstructed.characters[0].location).toBe('蜀山');
    expect(reconstructed.characters[0].emotionalState).toBe('determined');
    expect(reconstructed.characters[0].inventory).toEqual(['剑', '丹药']);
    expect(reconstructed.world.timelineMarker).toBe('第三天');
    expect(reconstructed.world.environment).toBe('多云');
    expect(reconstructed.world.geographyChanges).toEqual(['发现蜀山秘境入口']);
    expect(reconstructed.plot.tensionLevel).toBe(7);
  });

  it('从 A 到 B 的 delta 应用到 A 后等于 B（新增和移除角色）', () => {
    const snapshotA = makeSnapshot({
      characters: [
        {
          characterId: 'c1', name: '张三', location: '京城', emotionalState: 'calm',
          inventory: ['剑'], revealedSecrets: [], hiddenSecrets: [],
          currentGoal: '', goalProgress: 0, relationshipChanges: [],
          physicalCondition: 'normal', powerChange: '', currentBelief: '',
          beliefShift: '', alive: true, present: true,
        },
        {
          characterId: 'c2', name: '李四', location: '京城', emotionalState: 'neutral',
          inventory: [], revealedSecrets: [], hiddenSecrets: [],
          currentGoal: '', goalProgress: 0, relationshipChanges: [],
          physicalCondition: 'normal', powerChange: '', currentBelief: '',
          beliefShift: '', alive: true, present: true,
        },
      ],
    });

    const snapshotB = makeSnapshot({
      chapterNumber: 2,
      characters: [
        { ...snapshotA.characters[0], location: '洛阳' },
        // 李四被移除
        // 新增王五
        {
          characterId: 'c3', name: '王五', location: '洛阳', emotionalState: 'excited',
          inventory: ['弓'], revealedSecrets: [], hiddenSecrets: [],
          currentGoal: '寻友', goalProgress: 10, relationshipChanges: [],
          physicalCondition: 'normal', powerChange: '', currentBelief: '',
          beliefShift: '', alive: true, present: true,
        },
      ],
      chapterSummary: '李四离开，王五登场',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(snapshotA, snapshotB);
    const reconstructed = applyDelta(snapshotA, delta);

    expect(reconstructed.characters).toHaveLength(2);
    const names = reconstructed.characters.map((c) => c.name).sort();
    expect(names).toEqual(['张三', '王五']);
    expect(reconstructed.characters.find((c) => c.name === '王五')!.location).toBe('洛阳');
    expect(reconstructed.characters.find((c) => c.name === '李四')).toBeUndefined();
  });

  it('从 A 到 B 的 delta 应用到 A 后等于 B（势力变化）', () => {
    const snapshotA = makeSnapshot({
      factions: [
        {
          factionName: '天机阁', phase: 'rising' as const, powerLevel: 60,
          controlledResources: ['灵石矿'], currentObjective: '扩张',
          objectiveProgress: 30, internalStability: 70,
          relations: [], changeThisChapter: '',
        },
      ],
    });

    const snapshotB = makeSnapshot({
      chapterNumber: 2,
      factions: [
        {
          factionName: '天机阁', phase: 'peak' as const, powerLevel: 80,
          controlledResources: ['灵石矿', '秘境'], currentObjective: '守成',
          objectiveProgress: 60, internalStability: 65,
          relations: [], changeThisChapter: '占据秘境',
        },
      ],
      chapterSummary: '天机阁崛起',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(snapshotA, snapshotB);
    const reconstructed = applyDelta(snapshotA, delta);

    expect(reconstructed.factions).toHaveLength(1);
    expect(reconstructed.factions[0].phase).toBe('peak');
    expect(reconstructed.factions[0].powerLevel).toBe(80);
    expect(reconstructed.factions[0].controlledResources).toEqual(['灵石矿', '秘境']);
  });
});

// ==================== reconstructAt ====================

describe('reconstructAt', () => {
  it('从基准快照 + delta 链重建中间和最终快照', () => {
    const snap1 = makeSnapshot({
      chapterNumber: 1,
      characters: [{
        characterId: 'c1', name: '张三', location: '京城', emotionalState: 'calm',
        inventory: ['剑'], revealedSecrets: [], hiddenSecrets: [],
        currentGoal: '', goalProgress: 0, relationshipChanges: [],
        physicalCondition: 'normal', powerChange: '', currentBelief: '',
        beliefShift: '', alive: true, present: true,
      }],
      chapterSummary: '第一章',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    const snap2 = makeSnapshot({
      chapterNumber: 2,
      characters: [{
        ...snap1.characters[0], location: '洛阳', emotionalState: 'anxious',
      }],
      world: { ...snap1.world, timelineMarker: '第二天' },
      chapterSummary: '第二章',
      nextChapterConstraints: ['张三在洛阳'],
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const snap3 = makeSnapshot({
      chapterNumber: 3,
      characters: [{
        ...snap2.characters[0], location: '蜀山', emotionalState: 'determined', inventory: ['剑', '地图'],
      }],
      world: { ...snap2.world, timelineMarker: '第五天', environment: '雪' },
      plot: { ...snap1.plot, tensionLevel: 8 },
      chapterSummary: '第三章',
      nextChapterConstraints: ['张三在蜀山'],
      createdAt: '2024-01-03T00:00:00.000Z',
    });

    const delta1to2 = computeDelta(snap1, snap2);
    const delta2to3 = computeDelta(snap2, snap3);
    const deltas = [delta1to2, delta2to3];

    // 重建第 1 章（即基准本身）
    const rebuilt1 = reconstructAt(snap1, deltas, 1);
    expect(rebuilt1.chapterNumber).toBe(1);
    expect(rebuilt1.characters[0].location).toBe('京城');

    // 重建第 2 章
    const rebuilt2 = reconstructAt(snap1, deltas, 2);
    expect(rebuilt2.chapterNumber).toBe(2);
    expect(rebuilt2.chapterSummary).toBe('第二章');
    expect(rebuilt2.characters[0].location).toBe('洛阳');
    expect(rebuilt2.characters[0].emotionalState).toBe('anxious');
    expect(rebuilt2.world.timelineMarker).toBe('第二天');

    // 重建第 3 章
    const rebuilt3 = reconstructAt(snap1, deltas, 3);
    expect(rebuilt3.chapterNumber).toBe(3);
    expect(rebuilt3.chapterSummary).toBe('第三章');
    expect(rebuilt3.characters[0].location).toBe('蜀山');
    expect(rebuilt3.characters[0].emotionalState).toBe('determined');
    expect(rebuilt3.characters[0].inventory).toEqual(['剑', '地图']);
    expect(rebuilt3.world.timelineMarker).toBe('第五天');
    expect(rebuilt3.world.environment).toBe('雪');
    expect(rebuilt3.plot.tensionLevel).toBe(8);
  });

  it('目标章节超出 delta 链范围时返回最后可达快照', () => {
    const snap1 = makeSnapshot({ chapterNumber: 1 });
    const snap2 = makeSnapshot({
      chapterNumber: 2,
      chapterSummary: '第二章',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(snap1, snap2);
    // 请求第 5 章但只有到第 2 章的 delta
    const result = reconstructAt(snap1, [delta], 5);
    expect(result.chapterNumber).toBe(2);
  });

  it('reconstructAt 不修改基准快照', () => {
    const snap1 = makeSnapshot({ chapterNumber: 1 });
    const snap2 = makeSnapshot({
      chapterNumber: 2,
      characters: [{ ...snap1.characters[0], location: '洛阳' }],
      chapterSummary: '第二章',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(snap1, snap2);
    reconstructAt(snap1, [delta], 2);

    expect(snap1.chapterNumber).toBe(1);
    expect(snap1.characters[0].location).toBe('京城');
  });
});

// ==================== estimateDeltaSize ====================

describe('estimateDeltaSize', () => {
  it('非平凡 delta 的估算大小大于零', () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot({
      chapterNumber: 2,
      characters: [{ ...prev.characters[0], location: '洛阳' }],
      chapterSummary: '张三前往洛阳',
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const delta = computeDelta(prev, curr);
    const size = estimateDeltaSize(delta);
    expect(size).toBeGreaterThan(0);
  });

  it('空 delta（无字段变化）的估算大小仅包含 summary 和 constraints', () => {
    const snap = makeSnapshot();
    const delta = computeDelta(snap, { ...snap });

    expect(delta.deltas).toHaveLength(0);
    const size = estimateDeltaSize(delta);
    // 即使无字段 delta，chapterSummary 和 constraints 仍有大小
    expect(size).toBeGreaterThan(0);
  });

  it('变化越多的 delta 估算大小越大', () => {
    const base = makeSnapshot();

    const smallChange = makeSnapshot({
      chapterNumber: 2,
      characters: [{ ...base.characters[0], location: '洛阳' }],
      chapterSummary: '小变化',
      nextChapterConstraints: [],
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const bigChange = makeSnapshot({
      chapterNumber: 2,
      characters: [
        {
          ...base.characters[0],
          location: '蜀山之巅的隐秘洞穴',
          emotionalState: 'overwhelmed',
          inventory: ['剑', '丹药', '地图', '令牌', '秘籍'],
          currentGoal: '找到上古遗迹中的传承',
          goalProgress: 45,
          physicalCondition: '轻伤',
          powerChange: '突破至金丹期',
        },
      ],
      world: {
        ...base.world,
        timelineMarker: '三个月后的深秋',
        environment: '暴风雪席卷整个蜀山',
        geographyChanges: ['蜀山禁地开启', '灵脉断裂'],
        powerSystemChanges: ['天地灵气浓度骤升'],
      },
      chapterSummary: '这是一个非常详细的章节总结，描述了大量的变化和事件发生',
      nextChapterConstraints: ['约束一', '约束二', '约束三'],
      createdAt: '2024-01-02T00:00:00.000Z',
    });

    const smallDelta = computeDelta(base, smallChange);
    const bigDelta = computeDelta(base, bigChange);

    expect(estimateDeltaSize(bigDelta)).toBeGreaterThan(estimateDeltaSize(smallDelta));
  });
});
