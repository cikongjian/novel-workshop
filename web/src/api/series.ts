import { http } from './http';
import type { SeriesMetadata, SeriesBlueprint, BookBlueprint } from '../types';

// ==================== 系列蓝图 API ====================

/** 列出所有系列 */
export async function fetchSeriesList(): Promise<SeriesMetadata[]> {
  const { data } = await http.get<SeriesMetadata[]>('/series');
  return data;
}

/** 获取单个系列 */
export async function fetchSeries(seriesId: string): Promise<SeriesMetadata> {
  const { data } = await http.get<SeriesMetadata>(`/series/${seriesId}`);
  return data;
}

/** 创建系列 */
export async function createSeries(params: {
  title: string;
  description?: string;
  genre?: string;
  masterPlan?: string;
}): Promise<SeriesMetadata> {
  const { data } = await http.post<SeriesMetadata>('/series', params);
  return data;
}

/** 添加小说到系列 */
export async function addNovelToSeries(
  seriesId: string,
  novel: { novelId: string; title: string; timelineSpan?: string; status?: string },
): Promise<SeriesMetadata> {
  const { data } = await http.post<SeriesMetadata>(`/series/${seriesId}/novels`, novel);
  return data;
}

/** 更新系列中的小说元信息 */
export async function updateNovelInSeries(
  seriesId: string,
  novelId: string,
  updates: { title?: string; timelineSpan?: string; status?: 'planning' | 'writing' | 'completed'; legacy?: string[]; order?: number },
): Promise<SeriesMetadata> {
  const { data } = await http.put<SeriesMetadata>(`/series/${seriesId}/novels/${novelId}`, updates);
  return data;
}

/** 从系列中移除小说 */
export async function removeNovelFromSeries(seriesId: string, novelId: string): Promise<SeriesMetadata> {
  const { data } = await http.delete<SeriesMetadata>(`/series/${seriesId}/novels/${novelId}`);
  return data;
}

/** 整体更新系列蓝图 */
export async function updateBlueprint(seriesId: string, blueprint: SeriesBlueprint): Promise<SeriesBlueprint> {
  const { data } = await http.put<SeriesBlueprint>(`/series/${seriesId}/blueprint`, blueprint);
  return data;
}
