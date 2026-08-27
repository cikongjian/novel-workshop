import { http } from './http';
import type { NovelGenre, PublishingOverview, PublishingRecommendationResponse } from '../types';

export async function recommendPublishingForDraft(params: {
  title?: string;
  genre: NovelGenre;
  synopsis?: string;
  targetChapters?: number;
  chapterCount?: number;
}): Promise<PublishingRecommendationResponse> {
  const { data } = await http.post<PublishingRecommendationResponse>('/publishing/recommend', params);
  return data;
}

export async function recommendPublishingForNovel(novelId: string): Promise<PublishingRecommendationResponse> {
  const { data } = await http.get<PublishingRecommendationResponse>(`/publishing/novels/${novelId}/recommendation`);
  return data;
}

export async function fetchSavedPublishingRecommendation(novelId: string): Promise<PublishingRecommendationResponse | null> {
  const { data } = await http.get<{ recommendation: PublishingRecommendationResponse | null }>(`/publishing/novels/${novelId}/latest`);
  return data.recommendation;
}

export async function clearSavedPublishingRecommendation(novelId: string): Promise<void> {
  await http.delete(`/publishing/novels/${novelId}/latest`);
}
