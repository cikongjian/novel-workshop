import { http, AI_TIMEOUT } from './http';
import type {
  PlotBranchTree,
  PlotBranchDraftInput,
  PlotBranchAddResult,
  PlotBranchApplyResult,
  PlotBranchForkResult,
  PlotBranchPreviewResult,
} from '../types';

// ==================== 剧情分支 ====================

export async function getPlotBranchTree(novelId: string): Promise<PlotBranchTree> {
  const { data } = await http.get(`/novels/${novelId}/plot-branches`);
  return data;
}

export async function selectPlotBranch(novelId: string, nodeId: string): Promise<PlotBranchTree> {
  const { data } = await http.post(`/novels/${novelId}/plot-branches/select`, { nodeId });
  return data;
}

export async function abandonPlotBranch(novelId: string, nodeId: string): Promise<PlotBranchTree> {
  const { data } = await http.post(`/novels/${novelId}/plot-branches/abandon`, { nodeId });
  return data;
}

export async function backtrackPlotBranch(novelId: string, nodeId: string): Promise<PlotBranchTree> {
  const { data } = await http.post(`/novels/${novelId}/plot-branches/backtrack`, { nodeId });
  return data;
}

export async function explorePlotBranch(novelId: string, nodeId: string, previewContent: string): Promise<PlotBranchTree> {
  const { data } = await http.post(`/novels/${novelId}/plot-branches/explore`, { nodeId, previewContent });
  return data;
}

export async function addPlotBranchNodes(
  novelId: string,
  params: {
    parentId?: string | null;
    chapterNumber: number;
    branches: PlotBranchDraftInput[];
  },
): Promise<PlotBranchAddResult> {
  const { data } = await http.post<PlotBranchAddResult>(`/novels/${novelId}/plot-branches/add`, params);
  return data;
}

export async function applyPlotBranchToOutline(
  novelId: string,
  nodeId: string,
): Promise<PlotBranchApplyResult> {
  const { data } = await http.post<PlotBranchApplyResult>(`/novels/${novelId}/plot-branches/apply`, { nodeId });
  return data;
}

export async function forkPlotBranch(
  novelId: string,
  nodeId: string,
  newTitle?: string,
): Promise<PlotBranchForkResult> {
  const { data } = await http.post<PlotBranchForkResult>(`/novels/${novelId}/plot-branches/fork`, { nodeId, newTitle });
  return data;
}

export async function generatePlotBranchPreview(
  novelId: string,
  nodeId: string,
): Promise<PlotBranchPreviewResult> {
  const { data } = await http.post<PlotBranchPreviewResult>(
    `/novels/${novelId}/plot-branches/generate-preview`,
    { nodeId },
    { timeout: AI_TIMEOUT },
  );
  return data;
}
