import type {
  PlotBranchDraftInput,
  PlotBranchNode,
  PlotBranchTree,
} from '../types';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRiskLevel(value: unknown): PlotBranchDraftInput['riskLevel'] {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function normalizeCharacterImpacts(
  value: unknown,
): Array<{ name: string; impact: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return null;
        const [name, ...rest] = trimmed.split(/[:：]/);
        const impact = rest.join('：').trim();
        return {
          name: name?.trim() || '未命名角色',
          impact: impact || trimmed,
        };
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = asString(record.name);
      const impact = asString(record.impact);
      if (!name || !impact) return null;
      return { name, impact };
    })
    .filter((item): item is { name: string; impact: string } => Boolean(item));
}

export function parseCharacterImpactsText(value: string): Array<{ name: string; impact: string }> {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split(/[:：]/);
      return {
        name: (name || '').trim(),
        impact: rest.join('：').trim(),
      };
    })
    .filter(item => item.name && item.impact);
}

export function normalizePlotBranchDraft(input: Record<string, unknown>): PlotBranchDraftInput | null {
  const title = asString(input.title);
  const description = asString(input.description);
  if (!title || !description) return null;

  const impactPrediction = asString(input.impactPrediction) || asString(input.impact);
  const characterImpacts = normalizeCharacterImpacts(input.characterImpacts);

  return {
    title,
    description,
    impactPrediction,
    characterImpacts,
    riskLevel: normalizeRiskLevel(input.riskLevel),
  };
}

function getActiveNodes(tree: PlotBranchTree | null | undefined): PlotBranchNode[] {
  if (!tree) return [];
  const nodeMap = new Map(tree.nodes.map(node => [node.id, node]));
  return tree.activePath
    .map(id => nodeMap.get(id))
    .filter((node): node is PlotBranchNode => Boolean(node));
}

export function resolvePlotBranchParentId(
  tree: PlotBranchTree | null | undefined,
  chapterNumber: number,
  selectedNodeId?: string | null,
): string | null {
  if (selectedNodeId) return selectedNodeId;
  const candidates = getActiveNodes(tree)
    .filter(node => node.chapterNumber <= chapterNumber)
    .sort((left, right) => right.chapterNumber - left.chapterNumber);
  return candidates[0]?.id ?? null;
}

export function getDefaultPlotBranchChapter(
  tree: PlotBranchTree | null | undefined,
  selectedNode?: PlotBranchNode | null,
): number {
  if (selectedNode) return selectedNode.chapterNumber;
  const activeNodes = getActiveNodes(tree).sort((left, right) => right.chapterNumber - left.chapterNumber);
  return activeNodes[0]?.chapterNumber ?? 1;
}

export function getPlotBranchImpactText(branch: {
  impactPrediction?: string;
  impact?: string;
}): string {
  return branch.impactPrediction?.trim() || branch.impact?.trim() || '';
}
