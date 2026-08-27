import { http } from './http';
import type { OfflineRequest } from './types';

const BASE_URL = '/admin/moderation';

/**
 * 下架全书（管理员）
 */
export async function offlineBook(request: OfflineRequest): Promise<{ success: boolean; message: string }> {
  const response = await http.post(`${BASE_URL}/offline-book`, request);
  return response.data;
}

/**
 * 重新上架全书（管理员）
 */
export async function reOnlineBook(novelId: string): Promise<{ success: boolean; message: string }> {
  const response = await http.post(`${BASE_URL}/reonline-book`, { novelId });
  return response.data;
}
