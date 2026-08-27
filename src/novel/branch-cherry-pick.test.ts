import { describe, it, expect } from 'vitest';
import { cherryPickFromBranch } from './branch-cherry-pick.js';
import type { StoryState, StoryStateSnapshot } from './story-state-types.js';

function makeSnapshot(overrides: Partial<StoryStateSnapshot> = {}): StoryStateSnapshot {
  return {
    chapterNumber: 5,
    characters: [
      {
        characterId: 'c1', name: '张三', location: '京城', emotionalState: 'calm',
        inventory: [], revealedSecrets: [], hiddenSecrets: [], currentGoal: '',
        goalProgress: 0, relationshipChanges: [], physicalCondition: 'normal',
        powerChange: '', currentBelief: '', beliefShift: '',
        alive: true, present: true,
      },
    ],
    world: {
      timelineMarker: '第5天', environment: '晴',
      factionChanges: [], geographyChanges: [], powerSystemChanges: [], socialChanges: [],
    },
    factions: [],
    plot: {
      activeThreads: [{ threadName: '复仇线', status: 'active', summary: '复仇线进行中', activeForChapters: 2, prerequisites: [] }],
      pendingForeshadowing: [], tensionLevel: 5, readerQuestions: [],
    },
    causalChains: [{ cause: '宝藏争夺', causeChapter: 3, resolvedEffects: [], pendingEffects: ['帮派大战'] }],
    chapterSummary: '源分支第5章',
    nextChapterConstraints: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  } as StoryStateSnapshot;
}

function makeState(snapshots: StoryStateSnapshot[]): StoryState {
  return {
    novelId: 'test-novel',
    latestChapter: snapshots.length,
    snapshots,
    compressedArcs: [],
    megaArcs: [],
    updatedAt: new Date().toISOString(),
  };
}

describe('branch-cherry-pick', () => {
  describe('cherryPickFromBranch — 空目标', () => {
    it('目标无快照时复制整个源快照', () => {
      const source = makeSnapshot();
      const target = makeState([]);
      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5, elements: {},
      });
      expect(result.pickedElements).toContain('完整快照（目标为空）');
      expect(result.snapshot.chapterSummary).toBe('源分支第5章');
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('cherryPickFromBranch — 角色摘取', () => {
    it('摘取已有角色时替换目标状态', () => {
      const source = makeSnapshot({
        characters: [{
          characterId: 'c1', name: '张三', location: '洛阳', emotionalState: 'angry',
          inventory: ['宝剑'], revealedSecrets: [], hiddenSecrets: [], currentGoal: '',
          goalProgress: 0, relationshipChanges: [], physicalCondition: 'normal',
          powerChange: '', currentBelief: '', beliefShift: '',
          alive: true, present: true,
        }],
      });
      const targetSnap = makeSnapshot({ chapterNumber: 6, chapterSummary: '目标第6章' });
      const target = makeState([targetSnap]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { characters: ['张三'] },
      });

      expect(result.pickedElements).toContain('角色：张三');
      expect(result.snapshot.characters.find(c => c.name === '张三')?.location).toBe('洛阳');
      // 位置冲突应被检出
      expect(result.conflicts.some(c => c.includes('位置冲突'))).toBe(true);
    });

    it('摘取新角色时追加到目标', () => {
      const source = makeSnapshot({
        characters: [
          ...makeSnapshot().characters,
          {
            characterId: 'c2', name: '李四', location: '长安', emotionalState: 'calm',
            inventory: [], revealedSecrets: [], hiddenSecrets: [], currentGoal: '',
            goalProgress: 0, relationshipChanges: [], physicalCondition: 'normal',
            powerChange: '', currentBelief: '', beliefShift: '',
            alive: true, present: true,
          },
        ],
      });
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { characters: ['李四'] },
      });

      expect(result.pickedElements).toContain('角色：李四');
      expect(result.snapshot.characters).toHaveLength(2);
      expect(result.conflicts).toHaveLength(0);
    });

    it('源分支不存在的角色产生冲突', () => {
      const source = makeSnapshot();
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { characters: ['不存在的人'] },
      });

      expect(result.pickedElements).toHaveLength(0);
      expect(result.conflicts.some(c => c.includes('不存在的人'))).toBe(true);
    });
  });

  describe('cherryPickFromBranch — 情节线摘取', () => {
    it('摘取已有情节线时替换', () => {
      const source = makeSnapshot({
        plot: {
          activeThreads: [{ threadName: '复仇线', status: 'climax', summary: '复仇线高潮', activeForChapters: 8, prerequisites: [] }],
          pendingForeshadowing: [], tensionLevel: 8, readerQuestions: [],
        },
      });
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { plotThreads: ['复仇线'] },
      });

      expect(result.pickedElements).toContain('情节线：复仇线');
      const thread = result.snapshot.plot.activeThreads.find(t => t.threadName === '复仇线');
      expect(thread?.status).toBe('climax');
    });

    it('摘取新情节线时追加', () => {
      const source = makeSnapshot({
        plot: {
          activeThreads: [
            { threadName: '复仇线', status: 'active', summary: '复仇线进行中', activeForChapters: 3, prerequisites: [] },
            { threadName: '爱情线', status: 'active', summary: '爱情线开始', activeForChapters: 1, prerequisites: [] },
          ],
          pendingForeshadowing: [], tensionLevel: 5, readerQuestions: [],
        },
      });
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { plotThreads: ['爱情线'] },
      });

      expect(result.pickedElements).toContain('情节线：爱情线');
      expect(result.snapshot.plot.activeThreads).toHaveLength(2);
    });

    it('不存在的情节线产生冲突', () => {
      const source = makeSnapshot();
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { plotThreads: ['不存在线'] },
      });

      expect(result.conflicts.some(c => c.includes('不存在线'))).toBe(true);
    });
  });

  describe('cherryPickFromBranch — 世界/势力/因果链', () => {
    it('摘取世界状态', () => {
      const source = makeSnapshot({
        world: {
          timelineMarker: '第10天', environment: '暴雨',
          factionChanges: [], geographyChanges: ['山崩'], powerSystemChanges: [], socialChanges: [],
        },
      });
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { worldChanges: true },
      });

      expect(result.pickedElements).toContain('世界状态');
      expect(result.snapshot.world.environment).toBe('暴雨');
    });

    it('摘取势力状态', () => {
      const source = makeSnapshot({
        factions: [{ factionName: '天机阁', status: 'active', memberCount: 100, influence: 80, goal: '统一' }] as any,
      });
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { factionChanges: true },
      });

      expect(result.pickedElements).toContain('势力状态');
      expect(result.snapshot.factions).toHaveLength(1);
    });

    it('摘取因果链时合并去重', () => {
      const targetSnap = makeSnapshot({
        causalChains: [{ cause: '宝藏争夺', causeChapter: 3, resolvedEffects: [], pendingEffects: ['帮派大战'] }],
      });
      const source = makeSnapshot({
        causalChains: [
          { cause: '宝藏争夺', causeChapter: 3, resolvedEffects: [], pendingEffects: ['帮派大战'] },
          { cause: '身世之谜', causeChapter: 5, resolvedEffects: [], pendingEffects: ['真相大白'] },
        ],
      });
      const target = makeState([targetSnap]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { causalChains: true },
      });

      // 只新增了"身世之谜"，"宝藏争夺"已存在不重复
      expect(result.pickedElements.filter(e => e.includes('因果链'))).toHaveLength(1);
      expect(result.pickedElements).toContain('因果链：身世之谜');
      expect(result.snapshot.causalChains).toHaveLength(2);
    });
  });

  describe('cherryPickFromBranch — 组合摘取', () => {
    it('同时摘取角色+情节线+世界', () => {
      const source = makeSnapshot({
        characters: [{
          characterId: 'c1', name: '张三', location: '蜀山', emotionalState: 'excited',
          inventory: ['飞剑'], revealedSecrets: [], hiddenSecrets: [], currentGoal: '',
          goalProgress: 0, relationshipChanges: [], physicalCondition: 'normal',
          powerChange: '突破', currentBelief: '', beliefShift: '',
          alive: true, present: true,
        }],
        world: {
          timelineMarker: '第15天', environment: '雷暴',
          factionChanges: [], geographyChanges: [], powerSystemChanges: [], socialChanges: [],
        },
        plot: {
          activeThreads: [{ threadName: '修仙线', status: 'active', summary: '修仙线进行中', activeForChapters: 5, prerequisites: [] }],
          pendingForeshadowing: [], tensionLevel: 8, readerQuestions: [],
        },
      });
      const target = makeState([makeSnapshot()]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { characters: ['张三'], plotThreads: ['修仙线'], worldChanges: true },
      });

      expect(result.pickedElements).toContain('角色：张三');
      expect(result.pickedElements).toContain('情节线：修仙线');
      expect(result.pickedElements).toContain('世界状态');
      expect(result.snapshot.characters[0].location).toBe('蜀山');
      expect(result.snapshot.world.environment).toBe('雷暴');
    });

    it('无选择元素时返回未修改的目标快照', () => {
      const source = makeSnapshot();
      const target = makeState([makeSnapshot({ chapterSummary: '原目标' })]);

      const result = cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: {},
      });

      expect(result.pickedElements).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.snapshot.chapterSummary).toBe('原目标');
    });
  });

  describe('cherryPickFromBranch — 不可变性', () => {
    it('不修改源快照', () => {
      const source = makeSnapshot();
      const originalLocation = source.characters[0].location;
      const target = makeState([makeSnapshot()]);

      cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { characters: ['张三'], worldChanges: true },
      });

      expect(source.characters[0].location).toBe(originalLocation);
    });

    it('不修改目标状态', () => {
      const source = makeSnapshot();
      const target = makeState([makeSnapshot()]);
      const originalLength = target.snapshots.length;

      cherryPickFromBranch(source, target, {
        sourceBranchId: 'b1', sourceChapter: 5,
        elements: { characters: ['张三'] },
      });

      expect(target.snapshots).toHaveLength(originalLength);
    });
  });
});
