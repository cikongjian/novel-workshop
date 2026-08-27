import { describe, it, expect } from 'vitest';
import { getGenreBaseline, getAllGenres, GENRE_BASELINES } from './genre-baselines.js';
import { HookDetector } from './hook-detector.js';
import { DialoguePacingDetector } from './dialogue-pacing-detector.js';

describe('题材动态基准值系统', () => {
  describe('getGenreBaseline', () => {
    it('获取默认基准值', () => {
      const baseline = getGenreBaseline('default');
      expect(baseline.genre).toBe('default');
      expect(baseline.label).toBe('通用');
      expect(baseline.hook.weakThreshold).toBeGreaterThan(0);
    });

    it('获取玄幻基准值', () => {
      const baseline = getGenreBaseline('xuanhuan');
      expect(baseline.label).toBe('玄幻');
      expect(baseline.hook.strongThreshold).toBeGreaterThan(
        getGenreBaseline('default').hook.strongThreshold
      );
    });

    it('获取言情基准值 - 对话占比更高', () => {
      const baseline = getGenreBaseline('yanqing');
      expect(baseline.label).toBe('言情');
      expect(baseline.dialogue.minRatio).toBeGreaterThan(0.1);
      expect(baseline.dialogue.maxRatio).toBeGreaterThan(0.55);
    });

    it('获取体育基准值 - 动作更多', () => {
      const baseline = getGenreBaseline('tiyu');
      expect(baseline.label).toBe('体育竞技');
      expect(baseline.pacing.actionRatio).toBeGreaterThan(0.1);
    });

    it('未知题材返回默认值', () => {
      const baseline = getGenreBaseline('unknown-genre-xxx');
      expect(baseline.genre).toBe('default');
    });

    it('所有题材基准值结构完整', () => {
      const genres = getAllGenres();
      expect(genres.length).toBeGreaterThan(10);
      for (const g of genres) {
        const baseline = getGenreBaseline(g.genre);
        expect(baseline.hook).toBeDefined();
        expect(baseline.dialogue).toBeDefined();
        expect(baseline.pacing).toBeDefined();
        expect(baseline.cost).toBeDefined();
      }
    });
  });

  describe('HookDetector 题材适配', () => {
    it('不同题材钩子阈值不同', () => {
      const detector = new HookDetector();
      detector.setGenre('default');
      const defaultRules = (detector as any).ruleStore.getRules('hook-detector');
      const defaultNoneThreshold = defaultRules.find((r: any) => r.id === 'hook-none')?.threshold;

      detector.setGenre('xuanhuan');
      const xuanhuanRules = (detector as any).ruleStore.getRules('hook-detector');
      const xuanhuanNoneThreshold = xuanhuanRules.find((r: any) => r.id === 'hook-none')?.threshold;

      expect(xuanhuanNoneThreshold).not.toBe(defaultNoneThreshold);
      expect(xuanhuanNoneThreshold).toBeGreaterThan(defaultNoneThreshold);
    });
  });

  describe('DialoguePacingDetector 题材适配', () => {
    it('言情题材对话阈值更宽松', () => {
      const detector = new DialoguePacingDetector();
      detector.setGenre('default');
      const defaultRules = (detector as any).ruleStore.getRules('dialogue-pacing');
      const defaultMaxRatio = defaultRules.find((r: any) => r.id === 'dialogue-ratio-high')?.threshold;

      detector.setGenre('yanqing');
      const yanqingRules = (detector as any).ruleStore.getRules('dialogue-pacing');
      const yanqingMaxRatio = yanqingRules.find((r: any) => r.id === 'dialogue-ratio-high')?.threshold;

      expect(yanqingMaxRatio).toBeGreaterThan(defaultMaxRatio);
    });

    it('体育题材动作阈值更高', () => {
      const detector = new DialoguePacingDetector();
      detector.setGenre('default');
      const defaultRules = (detector as any).ruleStore.getRules('dialogue-pacing');
      const defaultActionLow = defaultRules.find((r: any) => r.id === 'action-ratio-low')?.threshold;

      detector.setGenre('tiyu');
      const tiyuRules = (detector as any).ruleStore.getRules('dialogue-pacing');
      const tiyuActionLow = tiyuRules.find((r: any) => r.id === 'action-ratio-low')?.threshold;

      expect(tiyuActionLow).toBeGreaterThan(defaultActionLow);
    });
  });

  describe('getAllGenres', () => {
    it('返回所有题材列表', () => {
      const genres = getAllGenres();
      expect(genres.length).toBeGreaterThan(10);
      expect(genres.some(g => g.genre === 'xuanhuan')).toBe(true);
      expect(genres.some(g => g.genre === 'yanqing')).toBe(true);
      expect(genres.some(g => g.genre === 'default')).toBe(true);
    });
  });
});
