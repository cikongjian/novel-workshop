import { describe, it, expect } from 'vitest';
import {
  createDefaultVector,
  clampVector,
  classifyVector,
  vectorDistance,
  mergeVectorDelta,
  inferVectorFromText,
  vectorToPromptText,
  VECTOR_DIMENSIONS,
  type RelationshipVector,
} from './relationship-vector.js';

describe('relationship-vector', () => {
  // ── createDefaultVector ─────────────────────────────────────────────

  describe('createDefaultVector', () => {
    it('应该返回六维全零向量', () => {
      const v = createDefaultVector();
      expect(v).toEqual({
        trust: 0,
        affection: 0,
        respect: 0,
        obligation: 0,
        fear: 0,
        rivalry: 0,
      });
    });

    it('每次调用应该返回独立对象', () => {
      const a = createDefaultVector();
      const b = createDefaultVector();
      expect(a).not.toBe(b);
      a.trust = 50;
      expect(b.trust).toBe(0);
    });
  });

  // ── clampVector ─────────────────────────────────────────────────────

  describe('clampVector', () => {
    it('已在范围内的向量应原样返回', () => {
      const v: RelationshipVector = {
        trust: 50, affection: -30, respect: 0,
        obligation: 80, fear: 10, rivalry: 99,
      };
      expect(clampVector(v)).toEqual(v);
    });

    it('双极维度应钳位到 [-100, 100]', () => {
      const v: RelationshipVector = {
        trust: 200, affection: -150, respect: 100,
        obligation: 0, fear: 0, rivalry: 0,
      };
      const result = clampVector(v);
      expect(result.trust).toBe(100);
      expect(result.affection).toBe(-100);
      expect(result.respect).toBe(100);
    });

    it('单极维度应钳位到 [0, 100]', () => {
      const v: RelationshipVector = {
        trust: 0, affection: 0, respect: 0,
        obligation: -30, fear: 200, rivalry: 101,
      };
      const result = clampVector(v);
      expect(result.obligation).toBe(0);
      expect(result.fear).toBe(100);
      expect(result.rivalry).toBe(100);
    });

    it('不应修改原始向量（返回新对象）', () => {
      const v: RelationshipVector = {
        trust: 200, affection: 0, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      const result = clampVector(v);
      expect(v.trust).toBe(200);
      expect(result.trust).toBe(100);
      expect(result).not.toBe(v);
    });
  });

  // ── classifyVector ──────────────────────────────────────────────────

  describe('classifyVector', () => {
    it('信任>60 且亲近>40 时应分类为 ally', () => {
      const v: RelationshipVector = {
        trust: 70, affection: 50, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      expect(classifyVector(v)).toBe('ally');
    });

    it('信任>60、尊敬>50、亲近<=40 时应分类为 respected_ally', () => {
      const v: RelationshipVector = {
        trust: 70, affection: 30, respect: 60,
        obligation: 0, fear: 0, rivalry: 0,
      };
      expect(classifyVector(v)).toBe('respected_ally');
    });

    it('信任<-50 且竞争>50 时应分类为 enemy', () => {
      const v: RelationshipVector = {
        trust: -60, affection: 0, respect: 0,
        obligation: 0, fear: 0, rivalry: 60,
      };
      expect(classifyVector(v)).toBe('enemy');
    });

    it('信任<-30 且畏惧>50 时应分类为 feared_enemy', () => {
      const v: RelationshipVector = {
        trust: -40, affection: 0, respect: 0,
        obligation: 0, fear: 60, rivalry: 0,
      };
      expect(classifyVector(v)).toBe('feared_enemy');
    });

    it('尊敬>60 且义务>50 时应分类为 subordinate', () => {
      const v: RelationshipVector = {
        trust: 0, affection: 0, respect: 70,
        obligation: 60, fear: 0, rivalry: 0,
      };
      expect(classifyVector(v)).toBe('subordinate');
    });

    it('竞争>60 且信任>0 时应分类为 rival', () => {
      const v: RelationshipVector = {
        trust: 10, affection: 0, respect: 0,
        obligation: 0, fear: 0, rivalry: 70,
      };
      expect(classifyVector(v)).toBe('rival');
    });

    it('畏惧>70 时应分类为 feared', () => {
      const v: RelationshipVector = {
        trust: 0, affection: 0, respect: 0,
        obligation: 0, fear: 80, rivalry: 0,
      };
      expect(classifyVector(v)).toBe('feared');
    });

    it('义务>70 且信任<20 时应分类为 reluctant_debtor', () => {
      const v: RelationshipVector = {
        trust: 10, affection: 0, respect: 0,
        obligation: 80, fear: 0, rivalry: 0,
      };
      expect(classifyVector(v)).toBe('reluctant_debtor');
    });

    it('不满足任何特殊条件时应分类为 neutral', () => {
      const v = createDefaultVector();
      expect(classifyVector(v)).toBe('neutral');
    });

    it('边界值：恰好不满足 ally 条件时不应返回 ally', () => {
      const v: RelationshipVector = {
        trust: 60, affection: 40, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      // trust 和 affection 需要严格大于阈值
      expect(classifyVector(v)).not.toBe('ally');
    });

    it('优先级：同时满足 ally 和 subordinate 时应优先返回 ally', () => {
      const v: RelationshipVector = {
        trust: 70, affection: 50, respect: 70,
        obligation: 60, fear: 0, rivalry: 0,
      };
      expect(classifyVector(v)).toBe('ally');
    });

    it('优先级：同时满足 enemy 和 feared_enemy 时应优先返回 enemy', () => {
      const v: RelationshipVector = {
        trust: -60, affection: 0, respect: 0,
        obligation: 0, fear: 60, rivalry: 60,
      };
      expect(classifyVector(v)).toBe('enemy');
    });
  });

  // ── vectorDistance ──────────────────────────────────────────────────

  describe('vectorDistance', () => {
    it('相同向量的距离应为 0', () => {
      const v: RelationshipVector = {
        trust: 50, affection: -30, respect: 10,
        obligation: 40, fear: 20, rivalry: 60,
      };
      expect(vectorDistance(v, v)).toBe(0);
    });

    it('全零向量之间距离应为 0', () => {
      const a = createDefaultVector();
      const b = createDefaultVector();
      expect(vectorDistance(a, b)).toBe(0);
    });

    it('单维度差异应返回正确欧氏距离', () => {
      const a = createDefaultVector();
      const b = createDefaultVector();
      b.trust = 30;
      expect(vectorDistance(a, b)).toBe(30);
    });

    it('多维度差异应返回正确欧氏距离', () => {
      const a: RelationshipVector = {
        trust: 0, affection: 0, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      const b: RelationshipVector = {
        trust: 30, affection: 40, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      // sqrt(30^2 + 40^2) = sqrt(900 + 1600) = sqrt(2500) = 50
      expect(vectorDistance(a, b)).toBe(50);
    });

    it('距离应满足对称性', () => {
      const a: RelationshipVector = {
        trust: 10, affection: 20, respect: 30,
        obligation: 40, fear: 50, rivalry: 60,
      };
      const b: RelationshipVector = {
        trust: -10, affection: -20, respect: -30,
        obligation: 10, fear: 10, rivalry: 10,
      };
      expect(vectorDistance(a, b)).toBe(vectorDistance(b, a));
    });
  });

  // ── mergeVectorDelta ────────────────────────────────────────────────

  describe('mergeVectorDelta', () => {
    it('权重为 1 时应直接加和', () => {
      const base: RelationshipVector = {
        trust: 50, affection: 0, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      const result = mergeVectorDelta(base, { trust: 20 }, 1.0);
      expect(result.trust).toBe(70);
    });

    it('权重为 0.5 时增量应减半', () => {
      const base = createDefaultVector();
      const result = mergeVectorDelta(base, { trust: 40, affection: -60 }, 0.5);
      expect(result.trust).toBe(20);
      expect(result.affection).toBe(-30);
    });

    it('未指定的维度应保持不变', () => {
      const base: RelationshipVector = {
        trust: 10, affection: 20, respect: 30,
        obligation: 40, fear: 50, rivalry: 60,
      };
      const result = mergeVectorDelta(base, { trust: 5 });
      expect(result.affection).toBe(20);
      expect(result.respect).toBe(30);
      expect(result.obligation).toBe(40);
      expect(result.fear).toBe(50);
      expect(result.rivalry).toBe(60);
    });

    it('结果应经过钳位处理', () => {
      const base: RelationshipVector = {
        trust: 90, affection: 0, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      const result = mergeVectorDelta(base, { trust: 50 });
      expect(result.trust).toBe(100);
    });

    it('单极维度合并后负值应被钳位到 0', () => {
      const base: RelationshipVector = {
        trust: 0, affection: 0, respect: 0,
        obligation: 10, fear: 0, rivalry: 0,
      };
      const result = mergeVectorDelta(base, { obligation: -30 });
      expect(result.obligation).toBe(0);
    });

    it('不应修改原始 base 向量', () => {
      const base: RelationshipVector = {
        trust: 50, affection: 0, respect: 0,
        obligation: 0, fear: 0, rivalry: 0,
      };
      mergeVectorDelta(base, { trust: 30 });
      expect(base.trust).toBe(50);
    });

    it('默认权重应为 1', () => {
      const base = createDefaultVector();
      const result = mergeVectorDelta(base, { trust: 25 });
      expect(result.trust).toBe(25);
    });
  });

  // ── inferVectorFromText ─────────────────────────────────────────────

  describe('inferVectorFromText', () => {
    it('包含"信任"关键词应增加 trust +20', () => {
      const result = inferVectorFromText('他们之间建立了信任');
      expect(result.trust).toBe(20);
    });

    it('包含"怀疑"关键词应减少 trust -20', () => {
      const result = inferVectorFromText('她开始怀疑对方的动机');
      expect(result.trust).toBe(-20);
    });

    it('包含"亲近"关键词应增加 affection +20', () => {
      const result = inferVectorFromText('两人逐渐亲近');
      expect(result.affection).toBe(20);
    });

    it('包含"厌恶"关键词应减少 affection -20', () => {
      const result = inferVectorFromText('她对他充满厌恶');
      expect(result.affection).toBe(-20);
    });

    it('包含"尊敬"关键词应增加 respect +20', () => {
      const result = inferVectorFromText('他非常尊敬师父');
      expect(result.respect).toBe(20);
    });

    it('包含"轻视"关键词应减少 respect -20', () => {
      const result = inferVectorFromText('他轻视所有对手');
      expect(result.respect).toBe(-20);
    });

    it('包含"恩情"关键词应增加 obligation +20', () => {
      const result = inferVectorFromText('她记着那份恩情');
      expect(result.obligation).toBe(20);
    });

    it('包含"恐惧"关键词应增加 fear +20', () => {
      const result = inferVectorFromText('心中充满恐惧');
      expect(result.fear).toBe(20);
    });

    it('包含"竞争"关键词应增加 rivalry +20', () => {
      const result = inferVectorFromText('两人展开竞争');
      expect(result.rivalry).toBe(20);
    });

    it('复合关键词应累加同一维度的增量', () => {
      // '信任' +20 和 '相信' +20 同维度累加 → trust = 40
      const result = inferVectorFromText('他信任并相信她');
      expect(result.trust).toBe(40);
    });

    it('正负关键词同时出现应相互抵消', () => {
      // '信任' +20 和 '怀疑' -20 → trust = 0, 应被过滤
      const result = inferVectorFromText('他信任又怀疑她');
      expect(result.trust).toBeUndefined();
    });

    it('同一维度多个正面关键词累加应受上限 80 钳位', () => {
      // 5 个 trust+ 关键词：信任+相信+托付+依赖+坦诚 → 5*20=100 → 钳位到 80
      const result = inferVectorFromText('他信任、相信、托付、依赖并坦诚相待');
      expect(result.trust).toBe(80);
    });

    it('同一维度多个负面关键词累加应受下限 -80 钳位', () => {
      // 5 个 trust- 关键词：怀疑+不信+猜忌+防备+戒心 → 5*(-20)=-100 → 钳位到 -80
      const result = inferVectorFromText('她怀疑、不信、猜忌、防备并充满戒心');
      expect(result.trust).toBe(-80);
    });

    it('多个维度应同时推断', () => {
      const result = inferVectorFromText('他信任她但恐惧她的力量，竞争激烈');
      expect(result.trust).toBe(20);
      expect(result.fear).toBe(20);
      expect(result.rivalry).toBe(20);
    });

    it('无匹配关键词应返回空对象', () => {
      const result = inferVectorFromText('天气真好');
      expect(result).toEqual({});
    });

    it('空字符串应返回空对象', () => {
      const result = inferVectorFromText('');
      expect(result).toEqual({});
    });
  });

  // ── vectorToPromptText ──────────────────────────────────────────────

  describe('vectorToPromptText', () => {
    it('应生成正确的提示文本格式', () => {
      const v: RelationshipVector = {
        trust: 80, affection: 60, respect: 40,
        obligation: 20, fear: 10, rivalry: 5,
      };
      const text = vectorToPromptText('张三', '李四', v);
      expect(text).toBe('张三→李四：信任(80) 亲近(60) 尊敬(40) 义务(20) 畏惧(10) 竞争(5)');
    });

    it('应正确处理负值维度', () => {
      const v: RelationshipVector = {
        trust: -50, affection: -30, respect: -10,
        obligation: 0, fear: 0, rivalry: 0,
      };
      const text = vectorToPromptText('A', 'B', v);
      expect(text).toBe('A→B：信任(-50) 亲近(-30) 尊敬(-10) 义务(0) 畏惧(0) 竞争(0)');
    });

    it('应包含所有六个维度', () => {
      const v = createDefaultVector();
      const text = vectorToPromptText('甲', '乙', v);
      const dimensions = ['信任', '亲近', '尊敬', '义务', '畏惧', '竞争'];
      for (const dim of dimensions) {
        expect(text).toContain(dim);
      }
    });

    it('维度顺序应与 VECTOR_DIMENSIONS 一致', () => {
      const v: RelationshipVector = {
        trust: 1, affection: 2, respect: 3,
        obligation: 4, fear: 5, rivalry: 6,
      };
      const text = vectorToPromptText('X', 'Y', v);
      // 检查维度值出现的顺序
      const matches = [...text.matchAll(/\((\d)\)/g)].map(m => Number(m[1]));
      expect(matches).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  // ── VECTOR_DIMENSIONS ───────────────────────────────────────────────

  describe('VECTOR_DIMENSIONS', () => {
    it('应包含六个维度名称', () => {
      expect(VECTOR_DIMENSIONS).toHaveLength(6);
      expect([...VECTOR_DIMENSIONS]).toEqual([
        'trust', 'affection', 'respect', 'obligation', 'fear', 'rivalry',
      ]);
    });
  });
});
