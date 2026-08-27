import { http } from './http';
import type { NovelCostData, ChapterCostSummary } from '../types';

// ==================== 成本追踪 ====================

export async function getNovelCostData(novelId: string): Promise<NovelCostData> {
  const { data } = await http.get(`/novels/${novelId}/cost`);
  return data;
}

export async function getChapterCost(novelId: string, chapterNumber: number): Promise<ChapterCostSummary | null> {
  const { data } = await http.get(`/novels/${novelId}/cost/chapter/${chapterNumber}`);
  return data;
}

