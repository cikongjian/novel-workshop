import { http } from './http';
import type { FactGraph, Contradiction } from '../types';

// ==================== 事实图谱 ====================

export async function getFactGraph(novelId: string): Promise<FactGraph> {
  const { data } = await http.get(`/novels/${novelId}/fact-graph`);
  return data;
}

export async function getFactGraphContradictions(novelId: string): Promise<Contradiction[]> {
  const { data } = await http.get(`/novels/${novelId}/fact-graph/contradictions`);
  return data;
}

export async function regenerateFactGraph(novelId: string): Promise<FactGraph> {
  const { data } = await http.post(`/novels/${novelId}/fact-graph/rebuild`, {}, { timeout: 120000 });
  return data;
}
