import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NarrativeGraph } from './narrative-graph.js';
import { buildNarrativeGraph } from './graph-builder.js';
import type { GraphNode, GraphEdge } from './types.js';
import type { FactGraph } from '../fact-graph-types.js';

// ── 辅助工厂 ─────────────────────────────────────────────────────

function makeNode(
  id: string,
  type: GraphNode['type'] = 'character',
  chapters: number[] = [1],
): GraphNode {
  return { id, type, label: id, chapters, attributes: {} };
}

function makeEdge(
  sourceId: string,
  targetId: string,
  type: GraphEdge['type'] = 'interacts_with',
  chapter = 1,
): GraphEdge {
  return {
    id: randomUUID(),
    type,
    sourceId,
    targetId,
    chapter,
    weight: 1,
    label: `${sourceId} → ${targetId}`,
  };
}

/** 构建只含必填字段的空 FactGraph 骨架 */
function emptyFactGraph(): FactGraph {
  return {
    novelId: randomUUID(),
    lastUpdatedChapter: 0,
    characterAppearances: [],
    itemTimeline: [],
    locationVisits: [],
    timelineEvents: [],
    relationshipChanges: [],
    characterStateChanges: [],
    factEvents: [],
    updatedAt: new Date().toISOString(),
  };
}

// ── NarrativeGraph 核心类测试 ────────────────────────────────────

describe('NarrativeGraph', () => {
  // 1. addNode + getNode
  it('添加节点后通过 getNode 返回同一节点', () => {
    const graph = new NarrativeGraph();
    const node = makeNode('char:张三');

    graph.addNode(node);

    const result = graph.getNode('char:张三');
    expect(result).toBeDefined();
    expect(result!.id).toBe('char:张三');
    expect(result!.type).toBe('character');
    expect(result!.chapters).toEqual([1]);
  });

  // 2. addNode 重复节点合并 chapters
  it('重复添加同 ID 节点时正确合并 chapters 数组', () => {
    const graph = new NarrativeGraph();

    graph.addNode(makeNode('char:李四', 'character', [1, 3]));
    graph.addNode(makeNode('char:李四', 'character', [2, 3, 5]));

    const node = graph.getNode('char:李四')!;
    expect(node.chapters).toEqual([1, 2, 3, 5]);
  });

  // 3. addEdge 同时更新出边和入边邻接表
  it('添加边后同时出现在出边邻接和入边反向邻接中', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:A'));
    graph.addNode(makeNode('loc:B', 'location'));

    const edge = makeEdge('char:A', 'loc:B', 'appears_at');
    graph.addEdge(edge);

    // 出边方向：A 的 out 边应该包含这条
    const outEdges = graph.edgesOf('char:A', 'out');
    expect(outEdges).toHaveLength(1);
    expect(outEdges[0]!.targetId).toBe('loc:B');

    // 入边方向：B 的 in 边应该包含这条
    const inEdges = graph.edgesOf('loc:B', 'in');
    expect(inEdges).toHaveLength(1);
    expect(inEdges[0]!.sourceId).toBe('char:A');

    expect(graph.edgeCount).toBe(1);
  });

  // 4. neighbors 返回正确邻居，支持按边类型过滤
  it('neighbors() 返回出边邻居节点，支持 edgeType 过滤', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:X'));
    graph.addNode(makeNode('loc:Y', 'location'));
    graph.addNode(makeNode('char:Z'));

    graph.addEdge(makeEdge('char:X', 'loc:Y', 'appears_at'));
    graph.addEdge(makeEdge('char:X', 'char:Z', 'interacts_with'));

    // 不过滤：应返回 2 个邻居
    const all = graph.neighbors('char:X');
    expect(all).toHaveLength(2);
    const allIds = all.map((n) => n.id).sort();
    expect(allIds).toEqual(['char:Z', 'loc:Y']);

    // 按 appears_at 过滤：只返回 loc:Y
    const locOnly = graph.neighbors('char:X', 'appears_at');
    expect(locOnly).toHaveLength(1);
    expect(locOnly[0]!.id).toBe('loc:Y');
  });

  // 5. edgesOf 支持 out / in / both 方向
  it('edgesOf() 按 out、in、both 方向正确过滤边', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:A'));
    graph.addNode(makeNode('char:B'));

    graph.addEdge(makeEdge('char:A', 'char:B', 'relationship'));
    graph.addEdge(makeEdge('char:B', 'char:A', 'relationship'));

    expect(graph.edgesOf('char:A', 'out')).toHaveLength(1);
    expect(graph.edgesOf('char:A', 'in')).toHaveLength(1);
    expect(graph.edgesOf('char:A', 'both')).toHaveLength(2);
    // 默认是 both
    expect(graph.edgesOf('char:A')).toHaveLength(2);
  });

  // 6. involvedTogether 查找两个角色间的双向边
  it('involvedTogether() 返回两角色之间的所有双向边', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:甲'));
    graph.addNode(makeNode('char:乙'));
    graph.addNode(makeNode('char:丙'));

    graph.addEdge(makeEdge('char:甲', 'char:乙', 'relationship'));
    graph.addEdge(makeEdge('char:乙', 'char:甲', 'interacts_with'));
    graph.addEdge(makeEdge('char:甲', 'char:丙', 'relationship')); // 不相关

    const edges = graph.involvedTogether('char:甲', 'char:乙');
    expect(edges).toHaveLength(2);

    const sourceIds = edges.map((e) => e.sourceId).sort();
    expect(sourceIds).toEqual(['char:乙', 'char:甲']);
  });

  // 7. shortestPath A→B→C 正确返回路径序列
  it('shortestPath() 返回 A→B→C 的最短路径节点序列', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:A'));
    graph.addNode(makeNode('char:B'));
    graph.addNode(makeNode('char:C'));

    // A→B, B→C（有向边，但 BFS 视为无向图）
    graph.addEdge(makeEdge('char:A', 'char:B'));
    graph.addEdge(makeEdge('char:B', 'char:C'));

    const path = graph.shortestPath('char:A', 'char:C');
    expect(path).toHaveLength(3);
    expect(path.map((n) => n.id)).toEqual(['char:A', 'char:B', 'char:C']);
  });

  // 8. shortestPath 受 maxHops 限制时返回空数组
  it('shortestPath() 在 maxHops 不足时返回空数组', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:A'));
    graph.addNode(makeNode('char:B'));
    graph.addNode(makeNode('char:C'));

    graph.addEdge(makeEdge('char:A', 'char:B'));
    graph.addEdge(makeEdge('char:B', 'char:C'));

    // 需要 2 跳，但限制为 1 跳
    const path = graph.shortestPath('char:A', 'char:C', 1);
    expect(path).toEqual([]);
  });

  // 9. nodesByType 按类型过滤节点
  it('nodesByType() 正确按类型过滤节点', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:A', 'character'));
    graph.addNode(makeNode('char:B', 'character'));
    graph.addNode(makeNode('loc:X', 'location'));
    graph.addNode(makeNode('item:W', 'item'));

    const characters = graph.nodesByType('character');
    expect(characters).toHaveLength(2);
    expect(characters.map((n) => n.id).sort()).toEqual(['char:A', 'char:B']);

    const locations = graph.nodesByType('location');
    expect(locations).toHaveLength(1);
    expect(locations[0]!.id).toBe('loc:X');

    const factions = graph.nodesByType('faction');
    expect(factions).toHaveLength(0);
  });

  // 10. degree 返回正确的度数（出度 + 入度）
  it('degree() 返回节点的出度加入度之和', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeNode('char:中心'));
    graph.addNode(makeNode('char:A'));
    graph.addNode(makeNode('char:B'));
    graph.addNode(makeNode('char:C'));

    graph.addEdge(makeEdge('char:中心', 'char:A')); // 出
    graph.addEdge(makeEdge('char:中心', 'char:B')); // 出
    graph.addEdge(makeEdge('char:C', 'char:中心')); // 入

    expect(graph.degree('char:中心')).toBe(3);
    expect(graph.degree('char:A')).toBe(1);
    // 不存在的节点度数为 0
    expect(graph.degree('char:不存在')).toBe(0);
  });
});

// ── buildNarrativeGraph 构建函数测试 ────────────────────────────

describe('buildNarrativeGraph', () => {
  // 11. 从 characterAppearances 构建角色节点 + 地点节点 + appears_at 边
  it('从 characterAppearances 生成角色节点、地点节点和 appears_at 边', () => {
    const fg = emptyFactGraph();
    fg.characterAppearances = [
      {
        characterName: '张三',
        chapterNumber: 1,
        location: '长安城',
        action: '走入',
        mentionType: 'onstage',
        confidence: 0.9,
        evidence: '',
        sentenceIndex: 0,
      },
      {
        characterName: '李四',
        chapterNumber: 2,
        location: '洛阳',
        action: '观望',
        mentionType: 'reference',
        confidence: 0.8,
        evidence: '',
        sentenceIndex: 0,
      },
    ];

    const graph = buildNarrativeGraph(fg);

    // 2 个角色节点
    const characters = graph.nodesByType('character');
    expect(characters).toHaveLength(2);
    const charLabels = characters.map((n) => n.label).sort();
    expect(charLabels).toEqual(['张三', '李四']);

    // 2 个地点节点
    const locations = graph.nodesByType('location');
    expect(locations).toHaveLength(2);

    // 每个角色到对应地点有一条 appears_at 边
    const zhangSanEdges = graph.edgesOf('char:张三', 'out');
    expect(zhangSanEdges).toHaveLength(1);
    expect(zhangSanEdges[0]!.type).toBe('appears_at');
    expect(zhangSanEdges[0]!.targetId).toBe('loc:长安城');

    // 张三的邻居是长安城
    const neighbors = graph.neighbors('char:张三');
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0]!.id).toBe('loc:长安城');
  });

  // 12. 从 relationshipChanges 构建关系边
  it('从 relationshipChanges 生成 relationship 类型边', () => {
    const fg = emptyFactGraph();
    fg.relationshipChanges = [
      {
        sourceCharacterName: '萧炎',
        targetCharacterName: '纳兰嫣然',
        chapterNumber: 5,
        previousRelation: '未婚夫妻',
        newRelation: '解除婚约',
        trigger: '三年之约',
      },
    ];

    const graph = buildNarrativeGraph(fg);

    // 两个角色节点应存在
    expect(graph.getNode('char:萧炎')).toBeDefined();
    expect(graph.getNode('char:纳兰嫣然')).toBeDefined();

    // 有一条 relationship 边
    const edges = graph.edgesOf('char:萧炎', 'out');
    expect(edges).toHaveLength(1);
    expect(edges[0]!.type).toBe('relationship');
    expect(edges[0]!.targetId).toBe('char:纳兰嫣然');
    expect(edges[0]!.label).toBe('解除婚约');
    expect(edges[0]!.chapter).toBe(5);

    // involvedTogether 能查到
    const together = graph.involvedTogether('char:萧炎', 'char:纳兰嫣然');
    expect(together).toHaveLength(1);
  });
});
