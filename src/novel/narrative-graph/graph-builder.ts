/**
 * GraphBuilder — 从 FactGraph 构建 NarrativeGraph
 *
 * 遍历 FactGraph 的各扁平数组，创建节点和边，
 * 生成可进行 O(k) 邻接查询的叙事图谱。
 */

import { randomUUID } from 'node:crypto';
import type { FactGraph } from '../fact-graph-types.js';
import { NarrativeGraph } from './narrative-graph.js';
import type { GraphNode, GraphEdge, EdgeType } from './types.js';
import {
  NODE_PREFIX_CHARACTER,
  NODE_PREFIX_ITEM,
  NODE_PREFIX_LOCATION,
  NODE_PREFIX_EVENT,
  DEFAULT_EDGE_WEIGHT,
} from './types.js';

// ── 节点 ID 工厂 ─────────────────────────────────────────────────

function charId(name: string): string {
  return `${NODE_PREFIX_CHARACTER}${name}`;
}

function itemId(name: string): string {
  return `${NODE_PREFIX_ITEM}${name}`;
}

function locId(location: string): string {
  return `${NODE_PREFIX_LOCATION}${location}`;
}

function eventId(id: string): string {
  return `${NODE_PREFIX_EVENT}${id}`;
}

// ── 节点工厂 ─────────────────────────────────────────────────────

function makeCharacterNode(name: string, chapter: number): GraphNode {
  return {
    id: charId(name),
    type: 'character',
    label: name,
    chapters: [chapter],
    attributes: {},
  };
}

function makeItemNode(name: string, chapter: number): GraphNode {
  return {
    id: itemId(name),
    type: 'item',
    label: name,
    chapters: [chapter],
    attributes: {},
  };
}

function makeLocationNode(location: string, chapter: number): GraphNode {
  return {
    id: locId(location),
    type: 'location',
    label: location,
    chapters: [chapter],
    attributes: {},
  };
}

function makeEventNode(
  id: string,
  summary: string,
  chapter: number,
): GraphNode {
  return {
    id: eventId(id),
    type: 'event',
    label: summary,
    chapters: [chapter],
    attributes: {},
  };
}

// ── 边工厂 ───────────────────────────────────────────────────────

function makeEdge(
  type: EdgeType,
  sourceId: string,
  targetId: string,
  chapter: number,
  label: string,
  weight: number = DEFAULT_EDGE_WEIGHT,
): GraphEdge {
  return {
    id: randomUUID(),
    type,
    sourceId,
    targetId,
    chapter,
    weight,
    label,
  };
}

// ── 主构建函数 ───────────────────────────────────────────────────

/**
 * 从 FactGraph 的扁平数组构建 NarrativeGraph。
 *
 * 处理顺序：
 * 1. characterAppearances → 角色节点 + 地点节点 + appears_at 边
 * 2. itemTimeline → 物品节点 + possesses 边
 * 3. locationVisits → 地点节点 + appears_at 边
 * 4. timelineEvents → 事件节点 + interacts_with 边
 * 5. relationshipChanges → relationship 边
 * 6. characterStateChanges → state_change 边
 */
export function buildNarrativeGraph(factGraph: FactGraph): NarrativeGraph {
  const graph = new NarrativeGraph();

  processCharacterAppearances(graph, factGraph);
  processItemTimeline(graph, factGraph);
  processLocationVisits(graph, factGraph);
  processTimelineEvents(graph, factGraph);
  processRelationshipChanges(graph, factGraph);
  processCharacterStateChanges(graph, factGraph);

  return graph;
}

// ── 各数据源处理 ─────────────────────────────────────────────────

function processCharacterAppearances(
  graph: NarrativeGraph,
  factGraph: FactGraph,
): void {
  for (const app of factGraph.characterAppearances) {
    const chNode = makeCharacterNode(app.characterName, app.chapterNumber);
    graph.addNode(chNode);

    if (app.location) {
      const locNode = makeLocationNode(app.location, app.chapterNumber);
      graph.addNode(locNode);

      const edge = makeEdge(
        'appears_at',
        charId(app.characterName),
        locId(app.location),
        app.chapterNumber,
        `${app.characterName} 出现在 ${app.location}`,
      );
      graph.addEdge(edge);
    }
  }
}

function processItemTimeline(
  graph: NarrativeGraph,
  factGraph: FactGraph,
): void {
  for (const item of factGraph.itemTimeline) {
    const iNode = makeItemNode(item.itemName, item.chapterNumber);
    graph.addNode(iNode);

    if (item.holderName) {
      // 确保持有者角色节点存在
      const holderNode = makeCharacterNode(item.holderName, item.chapterNumber);
      graph.addNode(holderNode);

      const edge = makeEdge(
        'possesses',
        charId(item.holderName),
        itemId(item.itemName),
        item.chapterNumber,
        `${item.holderName} ${item.status} ${item.itemName}`,
      );
      graph.addEdge(edge);
    }
  }
}

function processLocationVisits(
  graph: NarrativeGraph,
  factGraph: FactGraph,
): void {
  for (const visit of factGraph.locationVisits) {
    const chNode = makeCharacterNode(visit.characterName, visit.chapterNumber);
    graph.addNode(chNode);

    const locNode = makeLocationNode(visit.location, visit.chapterNumber);
    graph.addNode(locNode);

    const edge = makeEdge(
      'appears_at',
      charId(visit.characterName),
      locId(visit.location),
      visit.chapterNumber,
      `${visit.characterName} 前往 ${visit.location}`,
    );
    graph.addEdge(edge);
  }
}

function processTimelineEvents(
  graph: NarrativeGraph,
  factGraph: FactGraph,
): void {
  for (const evt of factGraph.timelineEvents) {
    const evtNode = makeEventNode(evt.id, evt.summary, evt.chapterNumber);
    graph.addNode(evtNode);

    // 为每个涉及角色创建节点 + 到事件的边
    for (const charName of evt.involvedCharacterNames) {
      const chNode = makeCharacterNode(charName, evt.chapterNumber);
      graph.addNode(chNode);

      const edge = makeEdge(
        'interacts_with',
        charId(charName),
        eventId(evt.id),
        evt.chapterNumber,
        `${charName} 参与事件: ${evt.summary}`,
      );
      if (evt.attribution) {
        edge.attribution = evt.attribution;
      }
      graph.addEdge(edge);
    }

    // 若事件关联地点，创建地点节点 + 边
    if (evt.location) {
      const locNode = makeLocationNode(evt.location, evt.chapterNumber);
      graph.addNode(locNode);

      const edge = makeEdge(
        'appears_at',
        eventId(evt.id),
        locId(evt.location),
        evt.chapterNumber,
        `事件发生在 ${evt.location}`,
      );
      graph.addEdge(edge);
    }
  }
}

function processRelationshipChanges(
  graph: NarrativeGraph,
  factGraph: FactGraph,
): void {
  for (const rel of factGraph.relationshipChanges) {
    // 确保两个角色节点存在
    graph.addNode(makeCharacterNode(rel.sourceCharacterName, rel.chapterNumber));
    graph.addNode(makeCharacterNode(rel.targetCharacterName, rel.chapterNumber));

    const edge = makeEdge(
      'relationship',
      charId(rel.sourceCharacterName),
      charId(rel.targetCharacterName),
      rel.chapterNumber,
      rel.newRelation || `${rel.sourceCharacterName} → ${rel.targetCharacterName}`,
    );
    if (rel.attribution) {
      edge.attribution = rel.attribution;
    }
    graph.addEdge(edge);
  }
}

function processCharacterStateChanges(
  graph: NarrativeGraph,
  factGraph: FactGraph,
): void {
  for (const sc of factGraph.characterStateChanges) {
    // 确保角色节点存在
    graph.addNode(makeCharacterNode(sc.characterName, sc.chapterNumber));

    // state_change 边：角色指向自身，表示状态转变
    const label = sc.detail
      || `${sc.characterName}: ${sc.previousState || '?'} → ${sc.newState}`;
    const edge = makeEdge(
      'state_change',
      charId(sc.characterName),
      charId(sc.characterName),
      sc.chapterNumber,
      label,
    );
    if (sc.attribution) {
      edge.attribution = sc.attribution;
    }
    graph.addEdge(edge);
  }
}
