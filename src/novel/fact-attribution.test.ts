import { describe, it, expect } from 'vitest';
import {
  createAttribution,
  mergeAttributions,
  inferAttributionFromContext,
} from './fact-attribution.js';

describe('fact-attribution', () => {
  describe('createAttribution', () => {
    it('应该创建正确的归因信息', () => {
      const attr = createAttribution(5, 'extracted', 0.9);
      expect(attr).toEqual({ sourceChapter: 5, sourceType: 'extracted', confidence: 0.9 });
    });

    it('应该支持所有 sourceType', () => {
      expect(createAttribution(1, 'inferred', 0.5).sourceType).toBe('inferred');
      expect(createAttribution(1, 'declared', 0.8).sourceType).toBe('declared');
    });
  });

  describe('mergeAttributions', () => {
    it('应该保留置信度更高的归因', () => {
      const low = createAttribution(1, 'inferred', 0.5);
      const high = createAttribution(2, 'extracted', 0.9);
      expect(mergeAttributions(low, high)).toBe(high);
    });

    it('置信度相同时优先保留更新的章节', () => {
      const old = createAttribution(1, 'extracted', 0.8);
      const newer = createAttribution(5, 'extracted', 0.8);
      expect(mergeAttributions(old, newer)).toBe(newer);
    });

    it('置信度相同且章节相同/更旧时保留原有归因', () => {
      const existing = createAttribution(5, 'extracted', 0.8);
      const older = createAttribution(3, 'inferred', 0.8);
      expect(mergeAttributions(existing, older)).toBe(existing);
    });

    it('新归因置信度更低时保留原有归因', () => {
      const existing = createAttribution(1, 'extracted', 0.9);
      const lower = createAttribution(10, 'inferred', 0.3);
      expect(mergeAttributions(existing, lower)).toBe(existing);
    });
  });

  describe('inferAttributionFromContext', () => {
    it('confirmed 应推断为 0.95 置信度', () => {
      const attr = inferAttributionFromContext(3, { certainty: 'confirmed' });
      expect(attr.confidence).toBe(0.95);
      expect(attr.sourceChapter).toBe(3);
    });

    it('suspected 应推断为 0.7 置信度', () => {
      const attr = inferAttributionFromContext(3, { certainty: 'suspected' });
      expect(attr.confidence).toBe(0.7);
    });

    it('rumored 应推断为 0.4 置信度', () => {
      const attr = inferAttributionFromContext(3, { certainty: 'rumored' });
      expect(attr.confidence).toBe(0.4);
    });

    it('direct/reference sourceType 应映射为 extracted', () => {
      expect(inferAttributionFromContext(1, { sourceType: 'direct' }).sourceType).toBe('extracted');
      expect(inferAttributionFromContext(1, { sourceType: 'reference' }).sourceType).toBe('extracted');
    });

    it('memory/dream sourceType 应映射为 inferred', () => {
      expect(inferAttributionFromContext(1, { sourceType: 'memory' }).sourceType).toBe('inferred');
      expect(inferAttributionFromContext(1, { sourceType: 'dream' }).sourceType).toBe('inferred');
    });

    it('无任何提示时默认 extracted / 0.5', () => {
      const attr = inferAttributionFromContext(1);
      expect(attr.sourceType).toBe('extracted');
      expect(attr.confidence).toBe(0.5);
    });

    it('显式 confidence 应覆盖 certainty 推断', () => {
      const attr = inferAttributionFromContext(1, { certainty: 'confirmed', confidence: 0.3 });
      expect(attr.confidence).toBe(0.3);
    });
  });
});
