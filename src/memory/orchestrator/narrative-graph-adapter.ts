/**
 * Narrative Graph 适配器
 *
 * 从 FactGraph 实时构建 NarrativeGraph，查询焦点角色的邻居关系，
 * 格式化为上下文文本注入 Agent prompt。
 *
 * MemorySource: 'narrative_graph'
 */

import type {
  MemoryItem,
  MemorySource,
  MemorySourceAdapter,
  OrchestratorParams,
} from './types.js';
import type { FactGraph } from '../../novel/fact-graph-types.js';
import { buildNarrativeGraph } from '../../novel/narrative-graph/graph-builder.js';

// ── 常量 ──────────────────────────────────────────────────────────

const SOURCE: MemorySource = 'narrative_graph';
const MAX_NEIGHBORS_PER_CHARACTER = 8;
const MAX_TOTAL_ITEMS = 5;

// ── 数据接口 ──────────────────────────────────────────────────────

export interface NarrativeGraphData {
  loadFactGraph(novelId: string): Promise<FactGraph | null>;
  /** Map from characterId → characterName */
  getCharacterNames(novelId: string, characterIds: string[]): Promise<Map<string, string>>;
}

// ── 适配器 ──────────────────────────────────────────────────────────

export class NarrativeGraphAdapter implements MemorySourceAdapter {
  readonly name = 'narrative-graph';
  readonly sources: readonly MemorySource[] = [SOURCE];

  constructor(private readonly data: NarrativeGraphData) {}

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    const factGraph = await this.data.loadFactGraph(params.novelId);
    if (!factGraph) return [];

    const graph = buildNarrativeGraph(factGraph);
    if (graph.nodeCount === 0) return [];

    // Resolve focus character names
    const focusIds = params.focusCharacterIds ?? [];
    const nameMap = focusIds.length > 0
      ? await this.data.getCharacterNames(params.novelId, focusIds)
      : new Map<string, string>();

    const focusNames = [...nameMap.values()];
    const items: MemoryItem[] = [];

    for (const charName of focusNames) {
      const nodeId = `char:${charName}`;
      if (!graph.hasNode(nodeId)) continue;

      const neighbors = graph.neighbors(nodeId);
      if (neighbors.length === 0) continue;

      const lines: string[] = [`【${charName}的叙事关联】`];
      let count = 0;

      for (const neighbor of neighbors) {
        if (count >= MAX_NEIGHBORS_PER_CHARACTER) break;
        const edges = graph.involvedTogether(nodeId, neighbor.id);
        const latestChapter = Math.max(...edges.map(e => e.chapter), 0);
        const edgeLabels = edges
          .slice(0, 3)
          .map(e => e.label)
          .filter(Boolean)
          .join('；');

        lines.push(`- ${neighbor.label}（${neighbor.type}）：${edgeLabels || '有关联'}（第${latestChapter}章）`);
        count++;
      }

      const text = lines.join('\n');
      items.push({
        id: `narrative_graph:${charName}`,
        source: SOURCE,
        entityId: charName,
        chapterNumber: params.chapterNumber,
        text,
        charCount: text.length,
        relevance: 0.7,
        freshness: 0.6,
        isCritical: false,
        unresolvedWeight: 0,
        provenance: `NarrativeGraph 实时构建，焦点角色 ${charName}`,
      });

      if (items.length >= MAX_TOTAL_ITEMS) break;
    }

    return items;
  }
}
