import { http } from './http';

// ==================== 批量操作控制 ====================

export async function pauseBatch(novelId: string): Promise<{ status: string }> {
  const { data } = await http.post('/generate/batch/pause', { novelId });
  return data;
}

export async function resumeBatch(novelId: string): Promise<{ status: string }> {
  const { data } = await http.post('/generate/batch/resume', { novelId });
  return data;
}

export async function retryFailedBatch(novelId: string): Promise<{ status: string; retryCount: number }> {
  const { data } = await http.post('/generate/batch/retry', { novelId });
  return data;
}

export async function forceResetBatch(novelId: string): Promise<{ status: string; hadJob: boolean }> {
  const { data } = await http.post('/generate/batch/reset-force', { novelId });
  return data;
}
