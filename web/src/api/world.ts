import { http } from './http';
import type { WorldEntry } from '../types';

export type WorldBibleDomain =
  | 'geography'
  | 'power'
  | 'faction'
  | 'history'
  | 'culture'
  | 'economy'
  | 'rule'
  | 'knowledge';

export interface WorldBibleCoverageItem {
  status: 'covered' | 'partial' | 'missing';
  note: string;
}

export interface WorldBibleProposalEntry {
  tempId?: string;
  name: string;
  category: WorldEntry['category'];
  description: string;
  storyRole?: 'anchor' | 'conflict' | 'mystery' | 'resource' | 'constraint';
  canonStatus: 'supported' | 'proposal';
  sourceBasis: string[];
  constraints: string[];
  consequences: string[];
  details: Record<string, string>;
  relatedNames: string[];
}

export interface WorldBiblePreview {
  summary: string;
  coverage: Record<WorldBibleDomain, WorldBibleCoverageItem>;
  entries: WorldBibleProposalEntry[];
}

export interface WorldBibleApplyResult {
  applied: true;
  summary: string;
  createdCount: number;
  updatedCount: number;
  skippedNames: string[];
  baselineSynced: boolean;
  entries: WorldEntry[];
}

export async function fetchWorldEntries(novelId: string): Promise<WorldEntry[]> {
  const { data } = await http.get<WorldEntry[]>(`/novels/${novelId}/world`);
  return data;
}

export async function createWorldEntry(
  novelId: string,
  params: Omit<WorldEntry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<WorldEntry> {
  const { data } = await http.post<WorldEntry>(`/novels/${novelId}/world`, params);
  return data;
}

export async function updateWorldEntry(
  novelId: string,
  entryId: string,
  params: Partial<WorldEntry>,
): Promise<WorldEntry> {
  const { data } = await http.put<WorldEntry>(`/novels/${novelId}/world/${entryId}`, params);
  return data;
}

export async function deleteWorldEntry(novelId: string, entryId: string): Promise<void> {
  await http.delete(`/novels/${novelId}/world/${entryId}`);
}

export async function previewWorldBible(novelId: string, maxItems = 20): Promise<WorldBiblePreview> {
  const { data } = await http.post<WorldBiblePreview>('/generate/world-bible/preview', {
    novelId,
    maxItems,
  });
  return data;
}

export async function applyWorldBible(
  novelId: string,
  entries: WorldBibleProposalEntry[],
  summary: string,
): Promise<WorldBibleApplyResult> {
  const { data } = await http.post<WorldBibleApplyResult>('/generate/world-bible/apply', {
    novelId,
    entries,
    summary,
  });
  return data;
}
