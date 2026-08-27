import { http } from './http';
import type { Scene, StyleDNA } from '../types';

// ==================== 风格 DNA ====================

export async function getStyleDna(novelId: string): Promise<StyleDNA | null> {
  const { data } = await http.get(`/novels/${novelId}/style-dna`);
  return data;
}

export async function analyzeStyleDna(novelId: string, params: {
  sampleText: string;
  sampleName: string;
  mode: 'replace' | 'merge';
}): Promise<StyleDNA> {
  const { data } = await http.post(`/novels/${novelId}/style-dna/analyze`, params, { timeout: 30000 });
  return data;
}

export async function updateStyleDna(novelId: string, updates: {
  enabled?: boolean;
  userNotes?: string;
  name?: string;
}): Promise<StyleDNA> {
  const { data } = await http.put(`/novels/${novelId}/style-dna`, updates);
  return data;
}

export async function deleteStyleDna(novelId: string): Promise<void> {
  await http.delete(`/novels/${novelId}/style-dna`);
}

// ==================== 场景 ====================

export async function fetchScenes(novelId: string, chapterNumber: number): Promise<Scene[]> {
  const { data } = await http.get(`/novels/${novelId}/chapters/${chapterNumber}/scenes`);
  return data;
}

export async function updateScene(novelId: string, chapterNumber: number, sceneNumber: number, updates: Partial<Scene>): Promise<Scene> {
  const { data } = await http.put(`/novels/${novelId}/chapters/${chapterNumber}/scenes/${sceneNumber}`, updates);
  return data;
}

export async function deleteScene(novelId: string, chapterNumber: number, sceneNumber: number): Promise<void> {
  await http.delete(`/novels/${novelId}/chapters/${chapterNumber}/scenes/${sceneNumber}`);
}

export async function initScenesFromOutline(novelId: string, chapterNumber: number): Promise<Scene[]> {
  const { data } = await http.post(`/novels/${novelId}/chapters/${chapterNumber}/scenes/init-from-outline`);
  return data;
}
