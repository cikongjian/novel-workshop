import { describe, it, expect } from 'vitest';

import { NarrativeGraph } from './narrative-graph/narrative-graph.js';
import type { RelationshipVector } from './relationship-vector.js';
import type { GraphNode, GraphEdge } from './narrative-graph/types.js';
import {
  detectTriangles,
  detectStructuralHoles,
  buildStructureHintsContext,
  type RelationshipTriangle,
  type StructuralHole,
} from './relationship-structures.js';

// ── Test helpers ──────────────────────────────────────────────────

function makeCharNode(id: string, label: string, chapters: number[] = []): GraphNode {
  return { id, type: 'character', label, chapters, attributes: {} };
}

function makeEdge(
  sourceId: string,
  targetId: string,
  chapter: number = 1,
): GraphEdge {
  return {
    id: `edge-${sourceId}-${targetId}-${chapter}`,
    type: 'interacts_with',
    sourceId,
    targetId,
    chapter,
    weight: 1.0,
    label: `${sourceId} interacts with ${targetId}`,
  };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('↔');
}

function zeroVector(): RelationshipVector {
  return { trust: 0, affection: 0, respect: 0, obligation: 0, fear: 0, rivalry: 0 };
}

function buildVectorMap(
  entries: Array<{ a: string; b: string; v: Partial<RelationshipVector> }>,
): Map<string, RelationshipVector> {
  const map = new Map<string, RelationshipVector>();
  for (const { a, b, v } of entries) {
    map.set(pairKey(a, b), { ...zeroVector(), ...v });
  }
  return map;
}

function buildGraphWithCharacters(
  chars: Array<{ id: string; label: string; chapters: number[] }>,
  edges?: Array<{ sourceId: string; targetId: string; chapter?: number }>,
): NarrativeGraph {
  const graph = new NarrativeGraph();
  for (const c of chars) {
    graph.addNode(makeCharNode(c.id, c.label, c.chapters));
  }
  if (edges) {
    for (const e of edges) {
      graph.addEdge(makeEdge(e.sourceId, e.targetId, e.chapter ?? 1));
    }
  }
  return graph;
}

// ── detectTriangles ─────────────────────────────────────────────

describe('detectTriangles', () => {
  it('returns empty array when graph has fewer than 3 characters', () => {
    const graph = buildGraphWithCharacters([
      { id: 'char:A', label: 'A', chapters: [1] },
      { id: 'char:B', label: 'B', chapters: [1] },
    ]);
    const vectors = new Map<string, RelationshipVector>();
    expect(detectTriangles(graph, vectors)).toEqual([]);
  });

  it('returns empty array when no vectors match any triangle pattern', () => {
    const graph = buildGraphWithCharacters([
      { id: 'char:A', label: 'A', chapters: [1] },
      { id: 'char:B', label: 'B', chapters: [1] },
      { id: 'char:C', label: 'C', chapters: [1] },
    ]);
    const vectors = new Map<string, RelationshipVector>();
    expect(detectTriangles(graph, vectors)).toEqual([]);
  });

  describe('love_triangle', () => {
    it('detects love triangle when two pairs have high affection and third has rivalry', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // Alice-Bob: high affection, Alice-Carol: high affection, Bob-Carol: high rivalry
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { affection: 50 } },
        { a: 'Alice', b: 'Carol', v: { affection: 50 } },
        { a: 'Bob', b: 'Carol', v: { rivalry: 60 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('love_triangle');
      expect(result[0].characters).toEqual(['Alice', 'Bob', 'Carol']);
      expect(result[0].tensionScore).toBeGreaterThan(0);
      expect(result[0].tensionScore).toBeLessThanOrEqual(100);
      expect(result[0].description).toContain('情感三角');
    });

    it('does not detect love triangle when affection is below threshold', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // affection=20 is below threshold of 30
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { affection: 20 } },
        { a: 'Alice', b: 'Carol', v: { affection: 20 } },
        { a: 'Bob', b: 'Carol', v: { rivalry: 60 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(0);
    });

    it('caps tensionScore at 100', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // Extreme values: |90| + |90| + 100 = 280 → capped to 100
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { affection: 90 } },
        { a: 'Alice', b: 'Carol', v: { affection: 90 } },
        { a: 'Bob', b: 'Carol', v: { rivalry: 100 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].tensionScore).toBe(100);
    });
  });

  describe('betrayal_setup', () => {
    it('detects betrayal when AB has high trust and AC has deeply negative trust', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // Alice trusts Bob (>30), but Alice-Carol trust is very negative (<-30)
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { trust: 50 } },
        { a: 'Alice', b: 'Carol', v: { trust: -50 } },
        { a: 'Bob', b: 'Carol', v: { trust: 0 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('betrayal_setup');
      expect(result[0].description).toContain('背叛');
    });

    it('detects betrayal when BC has deeply negative trust', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // Alice trusts Bob, Bob-Carol trust is deeply negative
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { trust: 50 } },
        { a: 'Alice', b: 'Carol', v: { trust: 10 } },
        { a: 'Bob', b: 'Carol', v: { trust: -50 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('betrayal_setup');
    });

    it('does not detect betrayal when original trust is below threshold', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // AB trust=20, below threshold of 30
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { trust: 20 } },
        { a: 'Alice', b: 'Carol', v: { trust: -50 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(0);
    });
  });

  describe('power_struggle', () => {
    it('detects power struggle with high rivalry and fear', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alpha', chapters: [1] },
        { id: 'char:B', label: 'Beta', chapters: [1] },
        { id: 'char:C', label: 'Gamma', chapters: [1] },
      ]);
      // Alpha-Beta: high rivalry (>50), Beta-Gamma or Alpha-Gamma: high fear (>30)
      const vectors = buildVectorMap([
        { a: 'Alpha', b: 'Beta', v: { rivalry: 70 } },
        { a: 'Beta', b: 'Gamma', v: { fear: 50 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('power_struggle');
      expect(result[0].description).toContain('权力对抗');
      expect(result[0].description).toContain('夹缝');
    });

    it('detects power struggle when AC has high fear instead of BC', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alpha', chapters: [1] },
        { id: 'char:B', label: 'Beta', chapters: [1] },
        { id: 'char:C', label: 'Gamma', chapters: [1] },
      ]);
      const vectors = buildVectorMap([
        { a: 'Alpha', b: 'Beta', v: { rivalry: 70 } },
        { a: 'Alpha', b: 'Gamma', v: { fear: 50 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('power_struggle');
    });

    it('does not detect power struggle when rivalry is below threshold', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alpha', chapters: [1] },
        { id: 'char:B', label: 'Beta', chapters: [1] },
        { id: 'char:C', label: 'Gamma', chapters: [1] },
      ]);
      // rivalry=40, below threshold of 50
      const vectors = buildVectorMap([
        { a: 'Alpha', b: 'Beta', v: { rivalry: 40 } },
        { a: 'Beta', b: 'Gamma', v: { fear: 50 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(0);
    });
  });

  describe('mediator', () => {
    it('detects mediator when one character has trust with two who distrust each other', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // Alice mediates: Alice-Bob trust>20, Alice-Carol trust>20, Bob-Carol trust<0
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { trust: 40 } },
        { a: 'Alice', b: 'Carol', v: { trust: 40 } },
        { a: 'Bob', b: 'Carol', v: { trust: -20 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('mediator');
      expect(result[0].description).toContain('调解者');
      expect(result[0].description).toContain('Alice');
    });

    it('identifies the correct mediator regardless of node order', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:X', label: 'X', chapters: [1] },
        { id: 'char:Y', label: 'Y', chapters: [1] },
        { id: 'char:Z', label: 'Z', chapters: [1] },
      ]);
      // Z is the mediator: Z-X trust>20, Z-Y trust>20, X-Y trust<0
      const vectors = buildVectorMap([
        { a: 'X', b: 'Z', v: { trust: 30 } },
        { a: 'Y', b: 'Z', v: { trust: 30 } },
        { a: 'X', b: 'Y', v: { trust: -10 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('mediator');
      expect(result[0].description).toContain('Z');
      expect(result[0].description).toContain('调解者');
    });

    it('does not detect mediator when trust is below threshold', () => {
      const graph = buildGraphWithCharacters([
        { id: 'char:A', label: 'Alice', chapters: [1] },
        { id: 'char:B', label: 'Bob', chapters: [1] },
        { id: 'char:C', label: 'Carol', chapters: [1] },
      ]);
      // trust=10, below threshold of 20
      const vectors = buildVectorMap([
        { a: 'Alice', b: 'Bob', v: { trust: 10 } },
        { a: 'Alice', b: 'Carol', v: { trust: 10 } },
        { a: 'Bob', b: 'Carol', v: { trust: -20 } },
      ]);

      const result = detectTriangles(graph, vectors);
      expect(result).toHaveLength(0);
    });
  });

  it('returns triangles sorted by tensionScore descending', () => {
    const graph = buildGraphWithCharacters([
      { id: 'char:A', label: 'A', chapters: [1] },
      { id: 'char:B', label: 'B', chapters: [1] },
      { id: 'char:C', label: 'C', chapters: [1] },
      { id: 'char:D', label: 'D', chapters: [1] },
    ]);
    // Triangle A-B-C: love_triangle with moderate values
    // Triangle A-B-D: love_triangle with higher values
    const vectors = buildVectorMap([
      { a: 'A', b: 'B', v: { affection: 40 } },
      { a: 'A', b: 'C', v: { affection: 40 } },
      { a: 'B', b: 'C', v: { rivalry: 45 } },
      { a: 'A', b: 'D', v: { affection: 80 } },
      { a: 'B', b: 'D', v: { rivalry: 90 } },
    ]);

    const result = detectTriangles(graph, vectors);
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].tensionScore).toBeGreaterThanOrEqual(result[i].tensionScore);
    }
  });

  it('classifies a triangle with priority: love > betrayal > power > mediator', () => {
    // When a triangle matches love_triangle, that classification takes precedence
    const graph = buildGraphWithCharacters([
      { id: 'char:A', label: 'A', chapters: [1] },
      { id: 'char:B', label: 'B', chapters: [1] },
      { id: 'char:C', label: 'C', chapters: [1] },
    ]);
    // High affection + rivalry = love_triangle even if trust is also high
    const vectors = buildVectorMap([
      { a: 'A', b: 'B', v: { affection: 50, trust: 50 } },
      { a: 'A', b: 'C', v: { affection: 50, trust: -50 } },
      { a: 'B', b: 'C', v: { rivalry: 60 } },
    ]);

    const result = detectTriangles(graph, vectors);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('love_triangle');
  });

  it('uses node labels (not ids) for vector lookup', () => {
    const graph = buildGraphWithCharacters([
      { id: 'char:alice', label: 'Alice', chapters: [1] },
      { id: 'char:bob', label: 'Bob', chapters: [1] },
      { id: 'char:carol', label: 'Carol', chapters: [1] },
    ]);
    // Vectors keyed by label, not by id
    const vectors = buildVectorMap([
      { a: 'Alice', b: 'Bob', v: { trust: 40 } },
      { a: 'Alice', b: 'Carol', v: { trust: 40 } },
      { a: 'Bob', b: 'Carol', v: { trust: -10 } },
    ]);

    const result = detectTriangles(graph, vectors);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('mediator');
  });

  it('handles missing vectors gracefully (treats as zero vector)', () => {
    const graph = buildGraphWithCharacters([
      { id: 'char:A', label: 'A', chapters: [1] },
      { id: 'char:B', label: 'B', chapters: [1] },
      { id: 'char:C', label: 'C', chapters: [1] },
    ]);
    // Only one vector provided, not enough to trigger any pattern
    const vectors = buildVectorMap([
      { a: 'A', b: 'B', v: { trust: 50 } },
    ]);

    const result = detectTriangles(graph, vectors);
    expect(result).toHaveLength(0);
  });

  it('returns null for triangle with all-zero vectors (no pattern match)', () => {
    const graph = buildGraphWithCharacters([
      { id: 'char:A', label: 'A', chapters: [1] },
      { id: 'char:B', label: 'B', chapters: [1] },
      { id: 'char:C', label: 'C', chapters: [1] },
    ]);
    const vectors = buildVectorMap([
      { a: 'A', b: 'B', v: {} },
      { a: 'A', b: 'C', v: {} },
      { a: 'B', b: 'C', v: {} },
    ]);

    const result = detectTriangles(graph, vectors);
    expect(result).toHaveLength(0);
  });
});

// ── detectStructuralHoles ───────────────────────────────────────

describe('detectStructuralHoles', () => {
  it('returns empty array when all characters are well-connected and recent', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'A', chapters: [1, 2, 3] },
        { id: 'char:B', label: 'B', chapters: [1, 2, 3] },
        { id: 'char:C', label: 'C', chapters: [1, 2, 3] },
      ],
      [
        // Each character has >= 2 edges
        { sourceId: 'char:A', targetId: 'char:B', chapter: 1 },
        { sourceId: 'char:A', targetId: 'char:C', chapter: 2 },
        { sourceId: 'char:B', targetId: 'char:C', chapter: 3 },
        { sourceId: 'char:C', targetId: 'char:A', chapter: 3 },
        { sourceId: 'char:B', targetId: 'char:A', chapter: 2 },
        { sourceId: 'char:C', targetId: 'char:B', chapter: 1 },
      ],
    );

    const result = detectStructuralHoles(graph, 3);
    expect(result).toHaveLength(0);
  });

  it('detects low-degree characters (fewer than 2 edges)', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'Alice', chapters: [1, 2, 3] },
        { id: 'char:B', label: 'Bob', chapters: [1, 2, 3] },
        { id: 'char:C', label: 'Loner', chapters: [3] },
      ],
      [
        // A and B are well-connected
        { sourceId: 'char:A', targetId: 'char:B', chapter: 1 },
        { sourceId: 'char:B', targetId: 'char:A', chapter: 2 },
        // C has only 1 edge (below threshold of 2)
        { sourceId: 'char:C', targetId: 'char:A', chapter: 3 },
      ],
    );

    const result = detectStructuralHoles(graph, 3);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const loner = result.find(h => h.character === 'Loner');
    expect(loner).toBeDefined();
    expect(loner!.chaptersSinceLastInteraction).toBe(0); // 3 - 3 = 0
  });

  it('detects silent characters (5+ chapters since last appearance)', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'Active', chapters: [1, 2, 10] },
        { id: 'char:B', label: 'Ghost', chapters: [1, 2] },
      ],
      [
        { sourceId: 'char:A', targetId: 'char:B', chapter: 1 },
        { sourceId: 'char:B', targetId: 'char:A', chapter: 2 },
        // Additional edges to avoid low-degree detection for A
        { sourceId: 'char:A', targetId: 'char:B', chapter: 2 },
      ],
    );

    const result = detectStructuralHoles(graph, 10);
    const ghost = result.find(h => h.character === 'Ghost');
    expect(ghost).toBeDefined();
    expect(ghost!.chaptersSinceLastInteraction).toBe(8); // 10 - 2 = 8
    expect(ghost!.narrativePotential).toBe('medium');
  });

  it('assigns "high" potential when both low-degree AND silent', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'Active', chapters: [1, 2, 10] },
        { id: 'char:B', label: 'Forgotten', chapters: [1] },
        { id: 'char:C', label: 'Helper', chapters: [1, 10] },
      ],
      [
        // Forgotten has only 1 outgoing edge → degree=1, low degree
        // and was last seen chapter 1 → silent at chapter 10
        { sourceId: 'char:B', targetId: 'char:A', chapter: 1 },
        // Give Active and Helper enough edges so they don't flag
        { sourceId: 'char:A', targetId: 'char:C', chapter: 1 },
        { sourceId: 'char:C', targetId: 'char:A', chapter: 10 },
      ],
    );

    const result = detectStructuralHoles(graph, 10);
    const forgotten = result.find(h => h.character === 'Forgotten');
    expect(forgotten).toBeDefined();
    expect(forgotten!.narrativePotential).toBe('high');
    expect(forgotten!.chaptersSinceLastInteraction).toBe(9); // 10 - 1 = 9
  });

  it('assigns "low" potential when only low-degree but not silent', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'Active', chapters: [1, 2, 3] },
        { id: 'char:B', label: 'Introvert', chapters: [3] },
      ],
      [
        // Introvert has only 1 edge (low degree) but appeared recently
        { sourceId: 'char:B', targetId: 'char:A', chapter: 3 },
      ],
    );

    const result = detectStructuralHoles(graph, 3);
    const introvert = result.find(h => h.character === 'Introvert');
    expect(introvert).toBeDefined();
    expect(introvert!.narrativePotential).toBe('low');
  });

  it('includes nearest character connections (up to 3)', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'A', chapters: [1] },
        { id: 'char:B', label: 'B', chapters: [1] },
        { id: 'char:C', label: 'C', chapters: [1] },
        { id: 'char:D', label: 'D', chapters: [1] },
        { id: 'char:E', label: 'Loner', chapters: [1] },
      ],
      [
        // Loner connects to A only (low degree)
        { sourceId: 'char:E', targetId: 'char:A', chapter: 1 },
      ],
    );

    const result = detectStructuralHoles(graph, 1);
    const loner = result.find(h => h.character === 'Loner');
    expect(loner).toBeDefined();
    // neighbors returns outgoing edges; A is the only character neighbor
    expect(loner!.nearestConnections.length).toBeLessThanOrEqual(3);
  });

  it('sorts results by narrativePotential: high > medium > low', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'Active', chapters: [1, 2, 10] },
        { id: 'char:B', label: 'LowOnly', chapters: [10] },     // low degree, recent
        { id: 'char:C', label: 'SilentOnly', chapters: [2] },    // has edges, silent
        { id: 'char:D', label: 'Both', chapters: [1] },          // low degree + silent
      ],
      [
        // Active has many connections
        { sourceId: 'char:A', targetId: 'char:B', chapter: 10 },
        { sourceId: 'char:A', targetId: 'char:C', chapter: 2 },
        { sourceId: 'char:A', targetId: 'char:D', chapter: 1 },
        // LowOnly: 1 edge (low degree), chapter 10 (not silent)
        { sourceId: 'char:B', targetId: 'char:A', chapter: 10 },
        // SilentOnly: 2 edges (not low), chapter 2 (silent at ch10)
        { sourceId: 'char:C', targetId: 'char:A', chapter: 2 },
        // Both: 1 edge (low degree), chapter 1 (silent at ch10)
        { sourceId: 'char:D', targetId: 'char:A', chapter: 1 },
      ],
    );

    const result = detectStructuralHoles(graph, 10);
    // Filter to only our three test subjects
    const subjects = result.filter(h => ['LowOnly', 'SilentOnly', 'Both'].includes(h.character));
    expect(subjects.length).toBeGreaterThanOrEqual(2);

    const potentialOrder = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < subjects.length; i++) {
      expect(potentialOrder[subjects[i - 1].narrativePotential])
        .toBeLessThanOrEqual(potentialOrder[subjects[i].narrativePotential]);
    }
  });

  it('handles character with empty chapters array (defaults to chapter 0)', () => {
    const graph = buildGraphWithCharacters(
      [
        { id: 'char:A', label: 'NoChapter', chapters: [] },
      ],
      [],
    );

    const result = detectStructuralHoles(graph, 5);
    const noChapter = result.find(h => h.character === 'NoChapter');
    expect(noChapter).toBeDefined();
    // Math.max(...[]) for empty falls back to [0] per code, so latest=0, chapters since=5
    expect(noChapter!.chaptersSinceLastInteraction).toBe(5);
  });

  it('only considers character-type neighbors for nearestConnections', () => {
    const graph = new NarrativeGraph();
    graph.addNode(makeCharNode('char:A', 'A', [1]));
    graph.addNode({ id: 'loc:Palace', type: 'location', label: 'Palace', chapters: [1], attributes: {} });

    graph.addEdge(makeEdge('char:A', 'loc:Palace', 1));

    const result = detectStructuralHoles(graph, 1);
    const charA = result.find(h => h.character === 'A');
    expect(charA).toBeDefined();
    // Palace is a location, not character, so it should be excluded from nearestConnections
    expect(charA!.nearestConnections).toEqual([]);
  });
});

// ── buildStructureHintsContext ───────────────────────────────────

describe('buildStructureHintsContext', () => {
  it('returns empty string when no triangles and no holes', () => {
    const result = buildStructureHintsContext([], []);
    expect(result).toBe('');
  });

  it('includes triangle descriptions with type and tension', () => {
    const triangles: RelationshipTriangle[] = [
      {
        characters: ['Alice', 'Bob', 'Carol'],
        type: 'love_triangle',
        tensionScore: 80,
        description: 'Alice与Bob、Carol之间存在情感三角，Bob与Carol存在竞争',
      },
    ];

    const result = buildStructureHintsContext(triangles, []);
    expect(result).toContain('【关系结构提示】');
    expect(result).toContain('[love_triangle]');
    expect(result).toContain('张力80');
    expect(result).toContain('情感三角');
  });

  it('limits triangles to top 3', () => {
    const triangles: RelationshipTriangle[] = Array.from({ length: 5 }, (_, i) => ({
      characters: [`A${i}`, `B${i}`, `C${i}`] as [string, string, string],
      type: 'mediator' as const,
      tensionScore: 50 - i,
      description: `Triangle ${i}`,
    }));

    const result = buildStructureHintsContext(triangles, []);
    const lines = result.split('\n');
    // 1 header + 3 triangle lines
    expect(lines).toHaveLength(4);
  });

  it('includes structural hole info for high and medium potential', () => {
    const holes: StructuralHole[] = [
      {
        character: 'Ghost',
        nearestConnections: ['Alice'],
        chaptersSinceLastInteraction: 8,
        narrativePotential: 'high',
      },
      {
        character: 'Shy',
        nearestConnections: ['Bob'],
        chaptersSinceLastInteraction: 6,
        narrativePotential: 'medium',
      },
    ];

    const result = buildStructureHintsContext([], holes);
    expect(result).toContain('Ghost已8章未互动');
    expect(result).toContain('Shy已6章未互动');
    expect(result).toContain('重新登场');
  });

  it('excludes low-potential holes from output', () => {
    const holes: StructuralHole[] = [
      {
        character: 'LowPriority',
        nearestConnections: [],
        chaptersSinceLastInteraction: 2,
        narrativePotential: 'low',
      },
    ];

    const result = buildStructureHintsContext([], holes);
    expect(result).toBe('');
    expect(result).not.toContain('LowPriority');
  });

  it('limits hole output to top 2 non-low entries', () => {
    const holes: StructuralHole[] = Array.from({ length: 5 }, (_, i) => ({
      character: `Char${i}`,
      nearestConnections: [],
      chaptersSinceLastInteraction: 10 + i,
      narrativePotential: 'high' as const,
    }));

    const result = buildStructureHintsContext([], holes);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });

  it('combines triangles and holes in one output', () => {
    const triangles: RelationshipTriangle[] = [
      {
        characters: ['A', 'B', 'C'],
        type: 'power_struggle',
        tensionScore: 70,
        description: 'A与B权力对抗，C处于夹缝',
      },
    ];
    const holes: StructuralHole[] = [
      {
        character: 'D',
        nearestConnections: ['A'],
        chaptersSinceLastInteraction: 7,
        narrativePotential: 'medium',
      },
    ];

    const result = buildStructureHintsContext(triangles, holes);
    expect(result).toContain('【关系结构提示】');
    expect(result).toContain('[power_struggle]');
    expect(result).toContain('D已7章未互动');
    const lines = result.split('\n');
    // 1 header + 1 triangle + 1 hole = 3 lines
    expect(lines).toHaveLength(3);
  });
});
