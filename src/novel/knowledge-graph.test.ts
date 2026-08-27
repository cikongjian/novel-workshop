import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from './knowledge-graph.js';
import type { KnowledgeEvent } from './knowledge-graph.js';

describe('KnowledgeGraph', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = new KnowledgeGraph();
  });

  // ==================== addSecret ====================

  describe('addSecret — 添加秘密', () => {
    it('应返回以 secret- 前缀开头的唯一 secretId', () => {
      const id1 = graph.addSecret('张三', '真正的凶手是管家', 1);
      const id2 = graph.addSecret('李四', '宝藏埋在后山', 2);

      expect(id1).toBe('secret-1');
      expect(id2).toBe('secret-2');
    });

    it('添加秘密后，原始角色应成为该秘密的持有者', () => {
      const secretId = graph.addSecret('张三', '他有双重身份', 1);
      const holders = graph.whoKnows(secretId);

      expect(holders).toContain('张三');
      expect(holders).toHaveLength(1);
    });

    it('应记录初始发现事件（method 为 discovered，confidence 为 1）', () => {
      const secretId = graph.addSecret('张三', '密道入口', 3);
      const events = graph.getEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        secretId,
        secretContent: '密道入口',
        from: '张三',
        to: '张三',
        chapter: 3,
        method: 'discovered',
        confidence: 1,
      });
    });
  });

  // ==================== propagate ====================

  describe('propagate — 知识传播', () => {
    it('角色 A 告诉角色 B 一个秘密后，B 应成为持有者', () => {
      const secretId = graph.addSecret('张三', '村长的秘密', 1);

      graph.propagate({
        secretId,
        secretContent: '村长的秘密',
        from: '张三',
        to: '李四',
        chapter: 2,
        method: 'told',
        confidence: 0.9,
      });

      const holders = graph.whoKnows(secretId);
      expect(holders).toContain('张三');
      expect(holders).toContain('李四');
      expect(holders).toHaveLength(2);
    });

    it('传播不存在的 secretId 应抛出错误', () => {
      expect(() => {
        graph.propagate({
          secretId: 'secret-999',
          secretContent: '不存在的秘密',
          from: '张三',
          to: '李四',
          chapter: 1,
          method: 'told',
          confidence: 1,
        });
      }).toThrow('Unknown secretId: secret-999');
    });

    it('confidence 超出 [0,1] 范围时应被截断（clamp）', () => {
      const secretId = graph.addSecret('张三', '测试秘密', 1);

      graph.propagate({
        secretId,
        secretContent: '测试秘密',
        from: '张三',
        to: '李四',
        chapter: 2,
        method: 'told',
        confidence: 1.5,
      });

      graph.propagate({
        secretId,
        secretContent: '测试秘密',
        from: '张三',
        to: '王五',
        chapter: 3,
        method: 'overheard',
        confidence: -0.3,
      });

      const events = graph.getEvents();
      // 第二个事件（索引 1）confidence 应被截断为 1
      expect(events[1]!.confidence).toBe(1);
      // 第三个事件（索引 2）confidence 应被截断为 0
      expect(events[2]!.confidence).toBe(0);
    });
  });

  // ==================== whoKnows ====================

  describe('whoKnows — 查询秘密持有者', () => {
    it('传播后应返回正确的持有者集合', () => {
      const secretId = graph.addSecret('张三', '宝藏位置', 1);
      graph.propagate({
        secretId,
        secretContent: '宝藏位置',
        from: '张三',
        to: '李四',
        chapter: 2,
        method: 'told',
        confidence: 0.8,
      });
      graph.propagate({
        secretId,
        secretContent: '宝藏位置',
        from: '李四',
        to: '王五',
        chapter: 3,
        method: 'told',
        confidence: 0.6,
      });

      const holders = graph.whoKnows(secretId);
      expect(holders).toHaveLength(3);
      expect(holders).toContain('张三');
      expect(holders).toContain('李四');
      expect(holders).toContain('王五');
    });

    it('不存在的 secretId 应返回空数组', () => {
      expect(graph.whoKnows('secret-nonexistent')).toEqual([]);
    });
  });

  // ==================== whatDoesCharKnow ====================

  describe('whatDoesCharKnow — 查询角色所知', () => {
    it('应返回角色知道的所有知识，包含 method、confidence、learnedAt', () => {
      const sid1 = graph.addSecret('张三', '第一个秘密', 1);
      const sid2 = graph.addSecret('张三', '第二个秘密', 2);

      const knowledge = graph.whatDoesCharKnow('张三');

      expect(knowledge).toHaveLength(2);

      const item1 = knowledge.find(k => k.secretId === sid1);
      expect(item1).toBeDefined();
      expect(item1!.content).toBe('第一个秘密');
      expect(item1!.method).toBe('discovered');
      expect(item1!.confidence).toBe(1);
      expect(item1!.learnedAt).toBe(1);

      const item2 = knowledge.find(k => k.secretId === sid2);
      expect(item2).toBeDefined();
      expect(item2!.content).toBe('第二个秘密');
      expect(item2!.learnedAt).toBe(2);
    });

    it('被传播获知的知识应反映传播事件的 method 和 confidence', () => {
      const secretId = graph.addSecret('张三', '核心秘密', 1);
      graph.propagate({
        secretId,
        secretContent: '核心秘密',
        from: '张三',
        to: '李四',
        chapter: 5,
        method: 'overheard',
        confidence: 0.6,
      });

      const knowledge = graph.whatDoesCharKnow('李四');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0]).toMatchObject({
        secretId,
        content: '核心秘密',
        learnedAt: 5,
        method: 'overheard',
        confidence: 0.6,
      });
    });

    it('同一秘密多次传播给同一角色时，应返回最新事件的信息', () => {
      const secretId = graph.addSecret('张三', '变化的秘密', 1);

      graph.propagate({
        secretId,
        secretContent: '变化的秘密',
        from: '张三',
        to: '李四',
        chapter: 2,
        method: 'told',
        confidence: 0.5,
      });

      graph.propagate({
        secretId,
        secretContent: '变化的秘密',
        from: '王五',
        to: '李四',
        chapter: 8,
        method: 'witnessed',
        confidence: 0.95,
      });

      const knowledge = graph.whatDoesCharKnow('李四');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0]!.method).toBe('witnessed');
      expect(knowledge[0]!.confidence).toBe(0.95);
      expect(knowledge[0]!.learnedAt).toBe(8);
    });

    it('不知道任何秘密的角色应返回空数组', () => {
      graph.addSecret('张三', '独家秘密', 1);
      expect(graph.whatDoesCharKnow('路人甲')).toEqual([]);
    });
  });

  // ==================== getKnowledgeGap ====================

  describe('getKnowledgeGap — 知识差距', () => {
    it('A 知道秘密 1、2，B 知道秘密 2、3 时，差距应正确计算', () => {
      const sid1 = graph.addSecret('A', '秘密一', 1);
      const sid2 = graph.addSecret('A', '秘密二', 1);
      const sid3 = graph.addSecret('B', '秘密三', 1);

      // 让 B 也知道秘密二
      graph.propagate({
        secretId: sid2,
        secretContent: '秘密二',
        from: 'A',
        to: 'B',
        chapter: 2,
        method: 'told',
        confidence: 0.9,
      });

      const gap = graph.getKnowledgeGap('A', 'B');

      // A 知道但 B 不知道：秘密一
      expect(gap.aKnowsBDoesnt).toHaveLength(1);
      expect(gap.aKnowsBDoesnt[0]!.secretId).toBe(sid1);

      // B 知道但 A 不知道：秘密三
      expect(gap.bKnowsADoesnt).toHaveLength(1);
      expect(gap.bKnowsADoesnt[0]!.secretId).toBe(sid3);
    });

    it('两个角色都不知道任何秘密时，差距应为空', () => {
      const gap = graph.getKnowledgeGap('甲', '乙');
      expect(gap.aKnowsBDoesnt).toEqual([]);
      expect(gap.bKnowsADoesnt).toEqual([]);
    });

    it('两个角色知道完全相同的秘密时，差距应为空', () => {
      const sid = graph.addSecret('甲', '共同秘密', 1);
      graph.propagate({
        secretId: sid,
        secretContent: '共同秘密',
        from: '甲',
        to: '乙',
        chapter: 2,
        method: 'told',
        confidence: 1,
      });

      const gap = graph.getKnowledgeGap('甲', '乙');
      expect(gap.aKnowsBDoesnt).toEqual([]);
      expect(gap.bKnowsADoesnt).toEqual([]);
    });
  });

  // ==================== toJSON / fromJSON ====================

  describe('toJSON / fromJSON — 序列化往返', () => {
    it('序列化后反序列化应保留所有数据', () => {
      const sid1 = graph.addSecret('张三', '秘密一', 1);
      const sid2 = graph.addSecret('李四', '秘密二', 2);

      graph.propagate({
        secretId: sid1,
        secretContent: '秘密一',
        from: '张三',
        to: '李四',
        chapter: 3,
        method: 'told',
        confidence: 0.7,
        distortion: '张三添油加醋了一番',
      });

      const json = graph.toJSON();
      const restored = KnowledgeGraph.fromJSON(json);

      // 验证秘密内容
      const restoredSecrets = restored.getSecrets();
      expect(restoredSecrets.get(sid1)).toBe('秘密一');
      expect(restoredSecrets.get(sid2)).toBe('秘密二');

      // 验证持有者
      expect(restored.whoKnows(sid1)).toContain('张三');
      expect(restored.whoKnows(sid1)).toContain('李四');
      expect(restored.whoKnows(sid2)).toContain('李四');

      // 验证事件
      const events = restored.getEvents();
      expect(events).toHaveLength(3); // 2 个初始 + 1 个传播

      // 验证 nextSecretNum 被保留（新增秘密 id 应接续）
      const sid3 = restored.addSecret('王五', '新秘密', 5);
      expect(sid3).toBe('secret-3');
    });

    it('fromJSON 传入空对象应返回可用的空图谱', () => {
      const restored = KnowledgeGraph.fromJSON({});

      expect(restored.getEvents()).toEqual([]);
      expect(restored.getSecrets().size).toBe(0);
      expect(restored.whoKnows('any')).toEqual([]);
    });

    it('JSON 可通过 JSON.stringify / JSON.parse 完成深度往返', () => {
      const sid = graph.addSecret('测试角色', '深度序列化测试', 1);
      graph.propagate({
        secretId: sid,
        secretContent: '深度序列化测试',
        from: '测试角色',
        to: '另一角色',
        chapter: 2,
        method: 'inferred',
        confidence: 0.4,
        distortion: '推测有误差',
      });

      const jsonString = JSON.stringify(graph.toJSON());
      const parsed = JSON.parse(jsonString);
      const restored = KnowledgeGraph.fromJSON(parsed);

      expect(restored.whoKnows(sid)).toContain('测试角色');
      expect(restored.whoKnows(sid)).toContain('另一角色');

      const knowledge = restored.whatDoesCharKnow('另一角色');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0]!.distortion).toBe('推测有误差');
    });
  });

  // ==================== 多次传播（链式） ====================

  describe('多次传播 — 链式传播 A→B→C', () => {
    it('链式传播后，所有中间节点和末端节点都应持有该秘密', () => {
      const secretId = graph.addSecret('A', '连环秘密', 1);

      graph.propagate({
        secretId,
        secretContent: '连环秘密',
        from: 'A',
        to: 'B',
        chapter: 2,
        method: 'told',
        confidence: 0.9,
      });

      graph.propagate({
        secretId,
        secretContent: '连环秘密',
        from: 'B',
        to: 'C',
        chapter: 3,
        method: 'told',
        confidence: 0.7,
      });

      const holders = graph.whoKnows(secretId);
      expect(holders).toHaveLength(3);
      expect(holders).toContain('A');
      expect(holders).toContain('B');
      expect(holders).toContain('C');
    });

    it('链式传播中，每个角色应记录自己获知时的 method 和 confidence', () => {
      const secretId = graph.addSecret('A', '逐级传递', 1);

      graph.propagate({
        secretId,
        secretContent: '逐级传递',
        from: 'A',
        to: 'B',
        chapter: 2,
        method: 'told',
        confidence: 0.9,
      });

      graph.propagate({
        secretId,
        secretContent: '逐级传递',
        from: 'B',
        to: 'C',
        chapter: 4,
        method: 'overheard',
        confidence: 0.5,
      });

      const bKnowledge = graph.whatDoesCharKnow('B');
      expect(bKnowledge).toHaveLength(1);
      expect(bKnowledge[0]!.method).toBe('told');
      expect(bKnowledge[0]!.confidence).toBe(0.9);
      expect(bKnowledge[0]!.learnedAt).toBe(2);

      const cKnowledge = graph.whatDoesCharKnow('C');
      expect(cKnowledge).toHaveLength(1);
      expect(cKnowledge[0]!.method).toBe('overheard');
      expect(cKnowledge[0]!.confidence).toBe(0.5);
      expect(cKnowledge[0]!.learnedAt).toBe(4);
    });

    it('链式传播后，知识差距应正确反映信息不对称', () => {
      const sid1 = graph.addSecret('A', '仅 A 知道的秘密', 1);
      const sid2 = graph.addSecret('A', '将传递给所有人的秘密', 1);

      graph.propagate({
        secretId: sid2,
        secretContent: '将传递给所有人的秘密',
        from: 'A',
        to: 'B',
        chapter: 2,
        method: 'told',
        confidence: 0.9,
      });

      graph.propagate({
        secretId: sid2,
        secretContent: '将传递给所有人的秘密',
        from: 'B',
        to: 'C',
        chapter: 3,
        method: 'told',
        confidence: 0.7,
      });

      // A vs C：A 多知道 sid1，C 没有独有秘密
      const gapAC = graph.getKnowledgeGap('A', 'C');
      expect(gapAC.aKnowsBDoesnt).toHaveLength(1);
      expect(gapAC.aKnowsBDoesnt[0]!.secretId).toBe(sid1);
      expect(gapAC.bKnowsADoesnt).toHaveLength(0);

      // B vs C：两者都只知道 sid2，无差距
      const gapBC = graph.getKnowledgeGap('B', 'C');
      expect(gapBC.aKnowsBDoesnt).toHaveLength(0);
      expect(gapBC.bKnowsADoesnt).toHaveLength(0);
    });
  });

  // ==================== 信息扭曲（distortion） ====================

  describe('distortion — 信息扭曲', () => {
    it('传播时设置 distortion 后，应在角色的知识项中保留', () => {
      const secretId = graph.addSecret('张三', '真相是 X', 1);

      graph.propagate({
        secretId,
        secretContent: '真相是 X',
        from: '张三',
        to: '李四',
        chapter: 3,
        method: 'told',
        confidence: 0.6,
        distortion: '张三故意隐瞒了关键细节，李四以为真相是 Y',
      });

      const knowledge = graph.whatDoesCharKnow('李四');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0]!.distortion).toBe('张三故意隐瞒了关键细节，李四以为真相是 Y');
    });

    it('未设置 distortion 的传播，知识项的 distortion 应为 undefined', () => {
      const secretId = graph.addSecret('张三', '无扭曲的秘密', 1);

      graph.propagate({
        secretId,
        secretContent: '无扭曲的秘密',
        from: '张三',
        to: '李四',
        chapter: 2,
        method: 'told',
        confidence: 1,
      });

      const knowledge = graph.whatDoesCharKnow('李四');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0]!.distortion).toBeUndefined();
    });

    it('多次传播带不同 distortion 时，应保留最新一次的扭曲描述', () => {
      const secretId = graph.addSecret('A', '原始秘密', 1);

      graph.propagate({
        secretId,
        secretContent: '原始秘密',
        from: 'A',
        to: 'B',
        chapter: 2,
        method: 'told',
        confidence: 0.8,
        distortion: '第一次扭曲',
      });

      graph.propagate({
        secretId,
        secretContent: '原始秘密',
        from: 'C',
        to: 'B',
        chapter: 5,
        method: 'witnessed',
        confidence: 0.95,
        distortion: '第二次修正后的理解',
      });

      const knowledge = graph.whatDoesCharKnow('B');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0]!.distortion).toBe('第二次修正后的理解');
    });

    it('序列化往返后 distortion 应被完整保留', () => {
      const secretId = graph.addSecret('张三', '扭曲测试', 1);
      graph.propagate({
        secretId,
        secretContent: '扭曲测试',
        from: '张三',
        to: '李四',
        chapter: 2,
        method: 'told',
        confidence: 0.5,
        distortion: '信息在传播中发生了关键扭曲',
      });

      const restored = KnowledgeGraph.fromJSON(graph.toJSON());
      const knowledge = restored.whatDoesCharKnow('李四');
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0]!.distortion).toBe('信息在传播中发生了关键扭曲');
    });
  });
});
