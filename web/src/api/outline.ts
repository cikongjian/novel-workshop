import { http } from './http';
import type { OutlineData, Foreshadowing } from '../types';

export type StoryTaskStatus = 'planned' | 'active' | 'critical' | 'blocked' | 'completed' | 'abandoned';
export type StoryTaskKind = 'arc' | 'chapter';
export type StoryTaskEdgeType = 'requires' | 'parallel' | 'converges' | 'advances' | 'assigned';

export interface StoryTaskNode {
  id: string;
  kind: StoryTaskKind;
  title: string;
  objective: string;
  status: StoryTaskStatus;
  progress: number;
  chapterNumber?: number;
  characterIds: string[];
  evidenceChapters: number[];
  blockerTaskIds: string[];
}

export interface StoryTaskCharacterNode {
  id: string;
  name: string;
  role: string;
  portraitImagePath?: string;
}

export interface StoryTaskEdge {
  id: string;
  type: StoryTaskEdgeType;
  sourceId: string;
  targetId: string;
  label: string;
}

export interface StoryTaskGraph {
  tasks: StoryTaskNode[];
  characters: StoryTaskCharacterNode[];
  edges: StoryTaskEdge[];
  summary: {
    totalTasks: number;
    activeTasks: number;
    blockedTasks: number;
    completedTasks: number;
    participantCount: number;
  };
}

// ==================== 大纲 ====================

export async function fetchOutline(novelId: string): Promise<OutlineData> {
  const { data } = await http.get<OutlineData>(`/novels/${novelId}/outline`);
  return data;
}

export async function fetchStoryTaskGraph(novelId: string): Promise<StoryTaskGraph> {
  const { data } = await http.get<StoryTaskGraph>(`/novels/${novelId}/outline/task-graph`);
  return data;
}

export async function updateOutline(
  novelId: string,
  params: Partial<OutlineData>,
): Promise<OutlineData> {
  const { data } = await http.put<OutlineData>(`/novels/${novelId}/outline`, params);
  return data;
}

// ==================== 伏笔逾期分析 ====================

export type ForeshadowingStatusItem = {
  item: {
    id: string;
    hint: string;
    plantedInChapter: number;
    resolution: string;
    resolvedInChapter?: number;
    isResolved: boolean;
    relatedPlotThreads: string[];
    priority: 'high' | 'medium' | 'low';
  };
  chaptersElapsed: number;
  isOverdue: boolean;
  urgency: 'critical' | 'warning' | 'normal';
};

export type ForeshadowingAnalysis = {
  overdue: ForeshadowingStatusItem[];
  active: ForeshadowingStatusItem[];
  resolved: Array<{
    id: string;
    hint: string;
    plantedInChapter: number;
    resolution: string;
    resolvedInChapter?: number;
    isResolved: boolean;
    priority: 'high' | 'medium' | 'low';
  }>;
};

export async function fetchForeshadowingStatus(novelId: string): Promise<ForeshadowingAnalysis> {
  const { data } = await http.get<ForeshadowingAnalysis>(`/novels/${novelId}/outline/foreshadowing-status`);
  return data;
}

export type UpdateForeshadowingBody = {
  isResolved?: boolean;
  resolution?: string;
  resolvedInChapter?: number;
  priority?: 'high' | 'medium' | 'low';
};

export async function updateForeshadowing(
  novelId: string,
  foreshadowingId: string,
  body: UpdateForeshadowingBody,
): Promise<Foreshadowing> {
  const { data } = await http.put<Foreshadowing>(
    `/novels/${novelId}/outline/foreshadowing/${foreshadowingId}`,
    body,
  );
  return data;
}

export async function batchResolveForeshadowing(
  novelId: string,
  ids?: string[],
): Promise<{ resolvedCount: number; total: number }> {
  const { data } = await http.post<{ resolvedCount: number; total: number }>(
    `/novels/${novelId}/outline/foreshadowing-batch-resolve`,
    ids ? { ids } : {},
  );
  return data;
}
