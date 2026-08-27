import { randomUUID } from 'node:crypto';
import type { PlotBranchTree, PlotBranchNode } from './plot-branch-types.js';

/**
 * Add new branch nodes as children of a parent.
 */
export function addBranchNodes(
  tree: PlotBranchTree,
  parentId: string | null,
  chapterNumber: number,
  branches: Array<{
    title: string;
    description: string;
    impactPrediction?: string;
    characterImpacts?: Array<{ name: string; impact: string }>;
    riskLevel?: 'low' | 'medium' | 'high';
  }>,
): PlotBranchTree {
  const now = new Date().toISOString();
  const newNodes: PlotBranchNode[] = branches.map((b) => ({
    id: randomUUID(),
    parentId,
    chapterNumber,
    title: b.title,
    description: b.description,
    impactPrediction: b.impactPrediction ?? '',
    characterImpacts: b.characterImpacts ?? [],
    riskLevel: b.riskLevel ?? 'medium',
    status: 'proposed' as const,
    createdAt: now,
    updatedAt: now,
  }));
  return { ...tree, nodes: [...tree.nodes, ...newNodes] };
}

export function findBranchNode(tree: PlotBranchTree, nodeId: string): PlotBranchNode | null {
  return tree.nodes.find((node) => node.id === nodeId) ?? null;
}

/**
 * Mark a branch as selected and rebuild the active path.
 */
export function selectBranch(tree: PlotBranchTree, nodeId: string): PlotBranchTree {
  const nodeIndex = tree.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex === -1) return tree;

  const now = new Date().toISOString();
  const updatedNodes = tree.nodes.map((n) => {
    if (n.id === nodeId) {
      return { ...n, status: 'selected' as const, updatedAt: now };
    }
    return n;
  });

  // Rebuild active path: trace from root through selected nodes to this node
  const activePath = buildPathToNode(updatedNodes, nodeId);

  return { ...tree, nodes: updatedNodes, activePath };
}
/**
 * Mark a branch as abandoned.
 */
export function abandonBranch(tree: PlotBranchTree, nodeId: string): PlotBranchTree {
  const now = new Date().toISOString();
  const updatedNodes = tree.nodes.map((n) => {
    if (n.id === nodeId) {
      return { ...n, status: 'abandoned' as const, updatedAt: now };
    }
    return n;
  });
  // Remove from active path if present
  const activePath = tree.activePath.filter((id) => id !== nodeId);
  return { ...tree, nodes: updatedNodes, activePath };
}

/**
 * Backtrack to a previous branch point: deselect everything after the target node.
 */
export function backtrackTo(tree: PlotBranchTree, nodeId: string): PlotBranchTree {
  const idx = tree.activePath.indexOf(nodeId);
  if (idx === -1) return tree;

  const abandonIds = new Set(tree.activePath.slice(idx + 1));
  const now = new Date().toISOString();

  const updatedNodes = tree.nodes.map((n) => {
    if (abandonIds.has(n.id)) {
      return { ...n, status: 'abandoned' as const, updatedAt: now };
    }
    return n;
  });

  const activePath = tree.activePath.slice(0, idx + 1);
  return { ...tree, nodes: updatedNodes, activePath };
}

/**
 * Mark a branch as explored with preview content.
 */
export function markExplored(tree: PlotBranchTree, nodeId: string, previewContent: string): PlotBranchTree {
  const now = new Date().toISOString();
  const updatedNodes = tree.nodes.map((n) => {
    if (n.id === nodeId) {
      return { ...n, status: 'explored' as const, previewContent, updatedAt: now };
    }
    return n;
  });
  return { ...tree, nodes: updatedNodes };
}

export function commitBranch(
  tree: PlotBranchTree,
  nodeId: string,
  committedChapterNumber: number,
): PlotBranchTree {
  const selectedTree = selectBranch(tree, nodeId);
  const now = new Date().toISOString();
  return {
    ...selectedTree,
    nodes: selectedTree.nodes.map((node) => (
      node.id === nodeId
        ? {
          ...node,
          status: 'selected' as const,
          committedChapterNumber,
          updatedAt: now,
        }
        : node
    )),
  };
}

/**
 * Build a simple graph structure for visualization (e.g. ECharts tree).
 */
export function buildTreeGraph(tree: PlotBranchTree): {
  nodes: Array<{ id: string; label: string; chapter: number; status: string }>;
  edges: Array<{ source: string; target: string }>;
} {
  const nodes = tree.nodes.map((n) => ({
    id: n.id,
    label: n.title,
    chapter: n.chapterNumber,
    status: n.status,
  }));

  const edges = tree.nodes
    .filter((n) => n.parentId !== null)
    .map((n) => ({
      source: n.parentId as string,
      target: n.id,
    }));

  return { nodes, edges };
}

/**
 * Internal helper: trace from a node back to root to build the active path.
 */
function buildPathToNode(nodes: PlotBranchNode[], targetId: string): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  let current = nodeMap.get(targetId);

  while (current) {
    path.unshift(current.id);
    current = current.parentId ? nodeMap.get(current.parentId) : undefined;
  }

  return path;
}
