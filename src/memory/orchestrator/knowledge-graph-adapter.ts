/**
 * Knowledge Graph 适配器
 *
 * 从 KnowledgeGraph 加载焦点角色的知识状态（谁知道什么秘密），
 * 格式化为信息边界上下文注入 Agent prompt。
 *
 * MemorySource: 'knowledge_graph'
 */

import type {
  MemoryItem,
  MemorySource,
  MemorySourceAdapter,
  OrchestratorParams,
} from './types.js';
import { KnowledgeGraph } from '../../novel/knowledge-graph.js';
import fs from 'node:fs/promises';

// ── 常量 ──────────────────────────────────────────────────────────

const SOURCE: MemorySource = 'knowledge_graph';
const MAX_SECRETS_PER_CHARACTER = 6;
const MAX_TOTAL_ITEMS = 5;

// ── 数据接口 ──────────────────────────────────────────────────────

export interface KnowledgeGraphData {
  /** Path to the knowledge-graph.json file */
  knowledgeGraphPath(novelId: string): string;
  /** Map from characterId → characterName */
  getCharacterNames(novelId: string, characterIds: string[]): Promise<Map<string, string>>;
}

// ── 适配器 ──────────────────────────────────────────────────────────

export class KnowledgeGraphAdapter implements MemorySourceAdapter {
  readonly name = 'knowledge-graph';
  readonly sources: readonly MemorySource[] = [SOURCE];

  constructor(private readonly data: KnowledgeGraphData) {}

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    const graphPath = this.data.knowledgeGraphPath(params.novelId);

    let graph: KnowledgeGraph;
    try {
      const raw = await fs.readFile(graphPath, 'utf-8');
      graph = KnowledgeGraph.fromJSON(JSON.parse(raw));
    } catch {
      return []; // file doesn't exist yet
    }

    const focusIds = params.focusCharacterIds ?? [];
    const nameMap = focusIds.length > 0
      ? await this.data.getCharacterNames(params.novelId, focusIds)
      : new Map<string, string>();

    const focusNames = [...nameMap.values()];
    const items: MemoryItem[] = [];

    for (const charName of focusNames) {
      const knowledge = graph.whatDoesCharKnow(charName);
      if (knowledge.length === 0) continue;

      const lines: string[] = [`【${charName}的信息状态】`];
      const topSecrets = knowledge
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_SECRETS_PER_CHARACTER);

      for (const k of topSecrets) {
        const methodLabel = METHOD_LABELS[k.method] || k.method;
        lines.push(`- ${k.content}（${methodLabel}，第${k.learnedAt}章，置信${Math.round(k.confidence * 100)}%）`);
        if (k.distortion) {
          lines.push(`  ⚠ 信息失真：${k.distortion}`);
        }
      }

      // Add knowledge gaps with other focus characters
      for (const otherName of focusNames) {
        if (otherName === charName) continue;
        const gap = graph.getKnowledgeGap(charName, otherName);
        if (gap.aKnowsBDoesnt.length > 0) {
          lines.push(`- ${charName}知道但${otherName}不知道：${gap.aKnowsBDoesnt.slice(0, 2).map(k => k.content).join('；')}`);
        }
      }

      const text = lines.join('\n');
      items.push({
        id: `knowledge_graph:${charName}`,
        source: SOURCE,
        entityId: charName,
        chapterNumber: params.chapterNumber,
        text,
        charCount: text.length,
        relevance: 0.8,
        freshness: 0.7,
        isCritical: false,
        unresolvedWeight: 0,
        provenance: `KnowledgeGraph 角色知识状态: ${charName}`,
      });

      if (items.length >= MAX_TOTAL_ITEMS) break;
    }

    return items;
  }
}

// ── 辅助 ──────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  told: '被告知',
  overheard: '偷听',
  discovered: '发现',
  inferred: '推断',
  witnessed: '目击',
};
