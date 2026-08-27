/**
 * NarrativeGraph — 叙事图谱核心类
 *
 * 基于邻接表的有向图，提供 O(k) 邻居查询、BFS 最短路径、
 * 双向边索引等能力。在 FactGraph 扁平数组之上提供结构化图查询。
 */

import type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  EdgeDirection,
} from './types.js';
import { DEFAULT_MAX_HOPS } from './types.js';

// ── 工具函数 ─────────────────────────────────────────────────────

/** 合并章节数组并去重排序 */
function mergeChapters(existing: number[], incoming: number[]): number[] {
  const set = new Set(existing);
  for (const ch of incoming) {
    set.add(ch);
  }
  return [...set].sort((a, b) => a - b);
}

// ── NarrativeGraph ───────────────────────────────────────────────

export class NarrativeGraph {
  /** 节点映射：nodeId → GraphNode */
  private nodes = new Map<string, GraphNode>();

  /** 出边邻接表：sourceId → GraphEdge[] */
  private adjacency = new Map<string, GraphEdge[]>();

  /** 入边反向邻接表：targetId → GraphEdge[] */
  private reverseAdj = new Map<string, GraphEdge[]>();

  /** 全局边计数 */
  private _edgeCount = 0;

  // ── 节点操作 ─────────────────────────────────────────────────

  /**
   * 添加节点。若节点已存在，合并 chapters 数组（去重）。
   */
  addNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);
    if (existing) {
      existing.chapters = mergeChapters(existing.chapters, node.chapters);
      // 合并属性（新值覆盖旧值）
      Object.assign(existing.attributes, node.attributes);
      return;
    }
    this.nodes.set(node.id, {
      ...node,
      chapters: [...node.chapters].sort((a, b) => a - b),
    });
  }

  /**
   * 添加边。同时更新出边邻接表和入边反向邻接表。
   */
  addEdge(edge: GraphEdge): void {
    // 出边
    const outEdges = this.adjacency.get(edge.sourceId);
    if (outEdges) {
      outEdges.push(edge);
    } else {
      this.adjacency.set(edge.sourceId, [edge]);
    }

    // 入边
    const inEdges = this.reverseAdj.get(edge.targetId);
    if (inEdges) {
      inEdges.push(edge);
    } else {
      this.reverseAdj.set(edge.targetId, [edge]);
    }

    this._edgeCount++;
  }

  // ── 节点查询 ─────────────────────────────────────────────────

  /** 按 ID 获取节点 */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /** 判断节点是否存在 */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /** 获取指定类型的所有节点 */
  nodesByType(type: NodeType): GraphNode[] {
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type) {
        result.push(node);
      }
    }
    return result;
  }

  // ── 边查询 ───────────────────────────────────────────────────

  /**
   * 获取节点的出边邻居节点，可选按边类型过滤。
   * 仅返回存在于图中的目标节点。
   */
  neighbors(nodeId: string, edgeType?: EdgeType): GraphNode[] {
    const outEdges = this.adjacency.get(nodeId) ?? [];
    const filtered = edgeType
      ? outEdges.filter((e) => e.type === edgeType)
      : outEdges;

    const seen = new Set<string>();
    const result: GraphNode[] = [];

    for (const edge of filtered) {
      if (seen.has(edge.targetId)) continue;
      seen.add(edge.targetId);

      const target = this.nodes.get(edge.targetId);
      if (target) {
        result.push(target);
      }
    }

    return result;
  }

  /**
   * 获取节点的所有边，按方向过滤。
   * - 'out'：仅出边
   * - 'in'：仅入边
   * - 'both'：全部（默认）
   */
  edgesOf(nodeId: string, direction: EdgeDirection = 'both'): GraphEdge[] {
    const out = direction === 'in' ? [] : (this.adjacency.get(nodeId) ?? []);
    const inc = direction === 'out' ? [] : (this.reverseAdj.get(nodeId) ?? []);
    return [...out, ...inc];
  }

  /**
   * 查找两个角色之间的所有边（双向）。
   * 返回 charA→charB 和 charB→charA 的所有边。
   */
  involvedTogether(charA: string, charB: string): GraphEdge[] {
    const result: GraphEdge[] = [];

    // charA → charB
    const outA = this.adjacency.get(charA) ?? [];
    for (const edge of outA) {
      if (edge.targetId === charB) {
        result.push(edge);
      }
    }

    // charB → charA
    const outB = this.adjacency.get(charB) ?? [];
    for (const edge of outB) {
      if (edge.targetId === charA) {
        result.push(edge);
      }
    }

    return result;
  }

  // ── 图算法 ───────────────────────────────────────────────────

  /**
   * BFS 最短路径，返回从 fromId 到 toId 的节点路径。
   * 无法在 maxHops 跳内到达时返回空数组。
   * 将图视为无向图（同时遍历出边和入边）。
   */
  shortestPath(
    fromId: string,
    toId: string,
    maxHops: number = DEFAULT_MAX_HOPS,
  ): GraphNode[] {
    if (fromId === toId) {
      const node = this.nodes.get(fromId);
      return node ? [node] : [];
    }

    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
      return [];
    }

    // BFS：parent 记录路径回溯
    const parent = new Map<string, string>();
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number }> = [];

    visited.add(fromId);
    queue.push({ nodeId: fromId, depth: 0 });

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxHops) continue;

      // 收集所有邻居（出边目标 + 入边来源，视为无向图）
      const neighborIds = this.collectNeighborIds(current.nodeId);

      for (const neighborId of neighborIds) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        parent.set(neighborId, current.nodeId);

        if (neighborId === toId) {
          return this.reconstructPath(fromId, toId, parent);
        }

        queue.push({ nodeId: neighborId, depth: current.depth + 1 });
      }
    }

    return [];
  }

  // ── 度数统计 ─────────────────────────────────────────────────

  /** 节点的度数（出度 + 入度） */
  degree(nodeId: string): number {
    const outDegree = this.adjacency.get(nodeId)?.length ?? 0;
    const inDegree = this.reverseAdj.get(nodeId)?.length ?? 0;
    return outDegree + inDegree;
  }

  /** 节点总数 */
  get nodeCount(): number {
    return this.nodes.size;
  }

  /** 边总数 */
  get edgeCount(): number {
    return this._edgeCount;
  }

  // ── 私有辅助 ─────────────────────────────────────────────────

  /** 收集节点的所有邻居 ID（出边目标 + 入边来源） */
  private collectNeighborIds(nodeId: string): Set<string> {
    const ids = new Set<string>();
    const outEdges = this.adjacency.get(nodeId) ?? [];
    for (const e of outEdges) {
      ids.add(e.targetId);
    }
    const inEdges = this.reverseAdj.get(nodeId) ?? [];
    for (const e of inEdges) {
      ids.add(e.sourceId);
    }
    return ids;
  }

  /** 从 BFS parent 映射回溯重建路径 */
  private reconstructPath(
    fromId: string,
    toId: string,
    parent: Map<string, string>,
  ): GraphNode[] {
    const path: GraphNode[] = [];
    let current: string | undefined = toId;

    while (current !== undefined) {
      const node = this.nodes.get(current);
      if (node) {
        path.push(node);
      }
      if (current === fromId) break;
      current = parent.get(current);
    }

    path.reverse();
    return path;
  }
}
