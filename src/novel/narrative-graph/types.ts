/**
 * NarrativeGraph 类型定义
 *
 * 叙事图谱的节点（实体）与边（关系）类型，
 * 构建在 FactGraph 扁平数组之上的 O(k) 邻接表结构。
 */

import type { FactAttribution } from '../fact-attribution.js';

// ── 节点类型 ─────────────────────────────────────────────────────

export type NodeType = 'character' | 'item' | 'location' | 'event' | 'faction';

// ── 边类型 ───────────────────────────────────────────────────────

export type EdgeType =
  | 'appears_at'
  | 'interacts_with'
  | 'possesses'
  | 'causes'
  | 'state_change'
  | 'relationship'
  | 'faction_member';

// ── 节点 ─────────────────────────────────────────────────────────

export interface GraphNode {
  /** 唯一标识，格式如 "char:张三" / "loc:太虚宫" */
  id: string;
  type: NodeType;
  /** 显示名称 */
  label: string;
  /** 该实体出现的章节列表（去重） */
  chapters: number[];
  /** 可扩展属性 */
  attributes: Record<string, unknown>;
}

// ── 边 ───────────────────────────────────────────────────────────

export interface GraphEdge {
  /** 唯一标识（UUID） */
  id: string;
  type: EdgeType;
  /** 起始节点 ID */
  sourceId: string;
  /** 目标节点 ID */
  targetId: string;
  /** 所属章节号 */
  chapter: number;
  /** 重要性权重，默认 1.0，越高越重要 */
  weight: number;
  /** 可读描述 */
  label: string;
  /** 事实归因（可选） */
  attribution?: FactAttribution;
}

// ── 边方向过滤 ───────────────────────────────────────────────────

export type EdgeDirection = 'out' | 'in' | 'both';

// ── 节点 ID 前缀常量 ─────────────────────────────────────────────

export const NODE_PREFIX_CHARACTER = 'char:' as const;
export const NODE_PREFIX_ITEM = 'item:' as const;
export const NODE_PREFIX_LOCATION = 'loc:' as const;
export const NODE_PREFIX_EVENT = 'event:' as const;
export const NODE_PREFIX_FACTION = 'faction:' as const;

// ── 默认值常量 ───────────────────────────────────────────────────

/** 边的默认权重 */
export const DEFAULT_EDGE_WEIGHT = 1.0;

/** BFS 最短路径默认最大跳数 */
export const DEFAULT_MAX_HOPS = 5;
