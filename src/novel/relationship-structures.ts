/**
 * 关系三角与结构洞检测
 *
 * 分析角色间关系网络中的三角结构（情感三角、权力博弈、调解者等）
 * 和结构洞（孤立角色），为剧情编排提供结构性洞察。
 */

import type { RelationshipVector } from './relationship-vector.js';
import type { NarrativeGraph } from './narrative-graph/narrative-graph.js';
import type { GraphEdge } from './narrative-graph/types.js';

// ── 常量 ──────────────────────────────────────────────────────────

const MIN_INTERACTION_CHAPTERS = 2;
const STRUCTURAL_HOLE_DEGREE_THRESHOLD = 2;
const STRUCTURAL_HOLE_SILENCE_THRESHOLD = 5;

/** 三角分类阈值 */
const LOVE_TRIANGLE_AFFECTION_THRESHOLD = 30;
const LOVE_TRIANGLE_RIVALRY_THRESHOLD = 40;
const BETRAYAL_TRUST_THRESHOLD = -30;
const BETRAYAL_ORIGINAL_TRUST_THRESHOLD = 30;
const POWER_RIVALRY_THRESHOLD = 50;
const POWER_FEAR_THRESHOLD = 30;
const MEDIATOR_TRUST_THRESHOLD = 20;

// ── 类型 ──────────────────────────────────────────────────────────

export type TriangleType = 'love_triangle' | 'betrayal_setup' | 'power_struggle' | 'mediator';

export interface RelationshipTriangle {
  characters: [string, string, string];
  type: TriangleType;
  tensionScore: number;
  description: string;
}

export interface StructuralHole {
  character: string;
  nearestConnections: string[];
  chaptersSinceLastInteraction: number;
  narrativePotential: 'high' | 'medium' | 'low';
}

// ── 关系向量索引 ─────────────────────────────────────────────────

type VectorMap = Map<string, RelationshipVector>;

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('↔');
}

// ── 三角检测 ──────────────────────────────────────────────────────

function classifyTriangle(
  a: string, b: string, c: string,
  vectors: VectorMap,
): RelationshipTriangle | null {
  const ab = vectors.get(pairKey(a, b));
  const bc = vectors.get(pairKey(b, c));
  const ac = vectors.get(pairKey(a, c));

  if (!ab && !bc && !ac) return null;

  // Helper: get a vector or zeros
  const v = (key: string | undefined): RelationshipVector =>
    (key ? vectors.get(key) : undefined) ?? { trust: 0, affection: 0, respect: 0, obligation: 0, fear: 0, rivalry: 0 };

  const vAB = v(pairKey(a, b));
  const vBC = v(pairKey(b, c));
  const vAC = v(pairKey(a, c));

  // Love triangle: two pairs have high affection, and rivalry exists
  if (
    vAB.affection > LOVE_TRIANGLE_AFFECTION_THRESHOLD &&
    vAC.affection > LOVE_TRIANGLE_AFFECTION_THRESHOLD &&
    vBC.rivalry > LOVE_TRIANGLE_RIVALRY_THRESHOLD
  ) {
    const tension = Math.abs(vAB.affection) + Math.abs(vAC.affection) + vBC.rivalry;
    return {
      characters: [a, b, c],
      type: 'love_triangle',
      tensionScore: Math.min(100, tension),
      description: `${a}与${b}、${c}之间存在情感三角，${b}与${c}存在竞争`,
    };
  }

  // Betrayal setup: AB trust is positive but AC or BC has deep negative trust
  if (
    vAB.trust > BETRAYAL_ORIGINAL_TRUST_THRESHOLD &&
    (vAC.trust < BETRAYAL_TRUST_THRESHOLD || vBC.trust < BETRAYAL_TRUST_THRESHOLD)
  ) {
    const betrayer = vAC.trust < BETRAYAL_TRUST_THRESHOLD ? c : b;
    const tension = Math.abs(vAB.trust) + Math.abs(Math.min(vAC.trust, vBC.trust));
    return {
      characters: [a, b, c],
      type: 'betrayal_setup',
      tensionScore: Math.min(100, tension),
      description: `${a}信任${b === betrayer ? c : b}，但${betrayer}可能背叛`,
    };
  }

  // Power struggle: high rivalry between multiple pairs
  if (
    vAB.rivalry > POWER_RIVALRY_THRESHOLD &&
    (vBC.fear > POWER_FEAR_THRESHOLD || vAC.fear > POWER_FEAR_THRESHOLD)
  ) {
    const tension = vAB.rivalry + Math.max(vBC.fear, vAC.fear);
    return {
      characters: [a, b, c],
      type: 'power_struggle',
      tensionScore: Math.min(100, tension),
      description: `${a}与${b}权力对抗，${c}处于夹缝`,
    };
  }

  // Mediator: one character has positive trust with both others who distrust each other
  for (const [mid, left, right] of [[a, b, c], [b, a, c], [c, a, b]] as [string, string, string][]) {
    const vMidLeft = v(pairKey(mid, left));
    const vMidRight = v(pairKey(mid, right));
    const vLeftRight = v(pairKey(left, right));

    if (
      vMidLeft.trust > MEDIATOR_TRUST_THRESHOLD &&
      vMidRight.trust > MEDIATOR_TRUST_THRESHOLD &&
      vLeftRight.trust < 0
    ) {
      const tension = vMidLeft.trust + vMidRight.trust - vLeftRight.trust;
      return {
        characters: [left, mid, right],
        type: 'mediator',
        tensionScore: Math.min(100, Math.abs(tension)),
        description: `${mid}在${left}与${right}的对立中充当调解者`,
      };
    }
  }

  return null;
}

/**
 * Detect relationship triangles from NarrativeGraph and relationship vectors.
 * @param graph The narrative graph for topology
 * @param vectors Map of pair-key → RelationshipVector
 */
export function detectTriangles(
  graph: NarrativeGraph,
  vectors: VectorMap,
): RelationshipTriangle[] {
  const charNodes = graph.nodesByType('character');
  const charIds = charNodes.map(n => n.id);
  const triangles: RelationshipTriangle[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < charIds.length; i++) {
    for (let j = i + 1; j < charIds.length; j++) {
      for (let k = j + 1; k < charIds.length; k++) {
        const a = charNodes[i].label;
        const b = charNodes[j].label;
        const c = charNodes[k].label;
        const key = [a, b, c].sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);

        const triangle = classifyTriangle(a, b, c, vectors);
        if (triangle) triangles.push(triangle);
      }
    }
  }

  return triangles.sort((a, b) => b.tensionScore - a.tensionScore);
}

/**
 * Detect structural holes: characters with low connectivity
 * or long silence periods.
 */
export function detectStructuralHoles(
  graph: NarrativeGraph,
  currentChapter: number,
): StructuralHole[] {
  const charNodes = graph.nodesByType('character');
  const holes: StructuralHole[] = [];

  for (const node of charNodes) {
    const edges = graph.edgesOf(node.id, 'both');
    const degree = edges.length;

    // Find the latest chapter this character appears in
    const latestChapter = Math.max(...(node.chapters.length > 0 ? node.chapters : [0]));
    const chaptersSince = currentChapter - latestChapter;

    // Get nearest connected character names
    const neighbors = graph.neighbors(node.id)
      .filter(n => n.type === 'character')
      .map(n => n.label)
      .slice(0, 3);

    const isLowDegree = degree < STRUCTURAL_HOLE_DEGREE_THRESHOLD;
    const isSilent = chaptersSince >= STRUCTURAL_HOLE_SILENCE_THRESHOLD;

    if (isLowDegree || isSilent) {
      let potential: StructuralHole['narrativePotential'] = 'low';
      if (isLowDegree && isSilent) potential = 'high';
      else if (isSilent) potential = 'medium';

      holes.push({
        character: node.label,
        nearestConnections: neighbors,
        chaptersSinceLastInteraction: chaptersSince,
        narrativePotential: potential,
      });
    }
  }

  return holes.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.narrativePotential] - order[b.narrativePotential];
  });
}

/** Format triangle and hole analysis as prompt context text */
export function buildStructureHintsContext(
  triangles: RelationshipTriangle[],
  holes: StructuralHole[],
): string {
  const lines: string[] = [];

  if (triangles.length > 0) {
    lines.push('【关系结构提示】');
    for (const t of triangles.slice(0, 3)) {
      lines.push(`- [${t.type}] ${t.description}（张力${t.tensionScore}）`);
    }
  }

  if (holes.length > 0) {
    const topHoles = holes.filter(h => h.narrativePotential !== 'low').slice(0, 2);
    for (const h of topHoles) {
      lines.push(`- ${h.character}已${h.chaptersSinceLastInteraction}章未互动，可安排重新登场`);
    }
  }

  return lines.join('\n');
}
