import { http } from './http';
import type { ContentAudit, PaginatedResponse } from './types';

const BASE_URL = '/audit';

/**
 * 获取待审核列表（管理员）
 */
export async function getPendingAudits(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<ContentAudit>> {
  const response = await http.get(`${BASE_URL}/admin/pending`, {
    params: { page, pageSize },
  });
  return response.data;
}

/**
 * 通过审核（管理员）
 */
export async function approveAudit(id: string): Promise<{ success: boolean }> {
  const response = await http.post(`${BASE_URL}/admin/${id}/approve`);
  return response.data;
}

/**
 * 拒绝审核（管理员）
 */
export async function rejectAudit(id: string, reason: string): Promise<{ success: boolean }> {
  const response = await http.post(`${BASE_URL}/admin/${id}/reject`, { reason });
  return response.data;
}

/**
 * 获取审核统计（管理员）
 */
export async function getAuditStats(): Promise<{
  total: number;
  pass: number;
  review: number;
  reject: number;
  byType: Record<string, number>;
}> {
  const response = await http.get(`${BASE_URL}/admin/stats`);
  return response.data;
}
