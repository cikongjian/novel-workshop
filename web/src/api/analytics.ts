import { http, AI_TIMEOUT } from './http';
import type { OutlineData } from '../types';

// ===== 增强功能 API =====

/** 生成大纲 */
export async function generateOutline(novelId: string, params: { targetChapters?: number; synopsis?: string }) {
  const { data } = await http.post(`/novels/${novelId}/outline/generate`, params, { timeout: AI_TIMEOUT });
  return data;
}

/** 从已写章节同步大纲 */
export async function syncOutline(novelId: string, options?: { force?: boolean; chapterNumbers?: number[] }): Promise<{ outline: OutlineData; added: number; updated?: number; message: string }> {
  const { data } = await http.post<{ outline: OutlineData; added: number; updated?: number; message: string }>(`/novels/${novelId}/outline/sync`, options);
  return data;
}

/** AI 分析章节，提取紧张度和关键事件 */
export async function analyzeOutline(novelId: string, options?: { chapterNumbers?: number[] }): Promise<{ outline: OutlineData; analyzed: number; chapters?: number[]; message: string }> {
  const { data } = await http.post<{ outline: OutlineData; analyzed: number; chapters?: number[]; message: string }>(`/novels/${novelId}/outline/analyze`, options, { timeout: AI_TIMEOUT });
  return data;
}

/** 剧情分支探索 */
export async function explorePlot(novelId: string, chapterNumber?: number) {
  const { data } = await http.post('/generate/explore-plot', { novelId, chapterNumber }, { timeout: AI_TIMEOUT });
  return data;
}

/** 角色交互式对话 */
export async function characterChat(novelId: string, characterId: string, message: string, history?: Array<{ role: string; content: string }>) {
  const { data } = await http.post('/generate/character-chat', { novelId, characterId, message, history }, { timeout: AI_TIMEOUT });
  return data;
}

/** 对话打磨 */
export async function polishDialogue(novelId: string, params: { chapterNumber?: number; text?: string }) {
  const { data } = await http.post('/generate/polish-dialogue', { novelId, ...params }, { timeout: AI_TIMEOUT });
  return data;
}

/** 营销文案生成 */
export type GenerateMarketingCopyResponse = {
  materials: unknown;
  billing: {
    ruleCode: string;
    estimatedPoints: number;
    bizType: string;
  } | null;
};

export async function generateMarketingCopy(novelId: string, types?: string[]): Promise<GenerateMarketingCopyResponse> {
  const { data } = await http.post<GenerateMarketingCopyResponse>('/generate/marketing-copy', { novelId, types }, { timeout: AI_TIMEOUT });
  return data;
}

/** 获取营销包装历史记录 */
export async function getMarketingPackages(novelId: string): Promise<import('../types').MarketingPackage[]> {
  const { data } = await http.get<import('../types').MarketingPackage[]>(`/novels/${novelId}/marketing-packages`);
  return data;
}

/** 智能创作建议 */
export async function getSuggestions(novelId: string, chapterNumber?: number) {
  const { data } = await http.post('/generate/suggestions', { novelId, chapterNumber }, { timeout: AI_TIMEOUT });
  return data;
}
