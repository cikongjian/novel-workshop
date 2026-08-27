import { http } from './http';

// ==================== 数据备份 ====================

export type BackupInfo = {
  id: string;
  novelId: string;
  novelTitle: string;
  filename: string;
  size: number;
  createdAt: string;
};

export async function listAllBackups(): Promise<BackupInfo[]> {
  const { data } = await http.get<BackupInfo[]>('/backups');
  return data;
}

export async function createBackup(novelId: string): Promise<BackupInfo> {
  const { data } = await http.post<BackupInfo>(`/backups/novels/${novelId}`);
  return data;
}

export async function restoreBackup(novelId: string, backupId: string): Promise<{ message: string }> {
  const { data } = await http.post<{ message: string }>(`/backups/novels/${novelId}/${backupId}/restore`);
  return data;
}

export async function deleteBackup(novelId: string, backupId: string): Promise<void> {
  await http.delete(`/backups/novels/${novelId}/${backupId}`);
}

// ==================== 导出 / 导入（搬家） ====================

/**
 * 导出小说为 tar.gz（触发浏览器下载）。
 */
export async function exportNovelArchive(novelId: string): Promise<void> {
  const response = await http.get(`/backups/export/${novelId}`, {
    responseType: 'blob',
    timeout: 300_000,
  });

  // 检查响应是否为错误 JSON
  const contentType = response.headers['content-type'] as string | undefined;
  if (contentType?.includes('application/json')) {
    const text = await (response.data as Blob).text();
    const errorData = JSON.parse(text);
    throw new Error(errorData.detail || errorData.error || '导出失败');
  }

  const blob = new Blob([response.data as BlobPart], { type: 'application/gzip' });
  const disposition = response.headers['content-disposition'] as string | undefined;
  let filename = `novel-${novelId}.tar.gz`;
  if (disposition) {
    const match = disposition.match(/filename\*?="?([^";]+)"?/);
    if (match) filename = decodeURIComponent(match[1]);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 批量导出所有小说为单个 tar.gz（触发浏览器下载）。
 */
export async function exportAllNovelsArchive(): Promise<void> {
  const response = await http.get('/backups/export-all', {
    responseType: 'blob',
    timeout: 600_000,
  });

  // 检查响应是否为错误 JSON（服务器返回 500 时可能是 JSON 格式）
  const contentType = response.headers['content-type'] as string | undefined;
  if (contentType?.includes('application/json')) {
    // 将 blob 转为文本读取错误信息
    const text = await (response.data as Blob).text();
    const errorData = JSON.parse(text);
    throw new Error(errorData.detail || errorData.error || '导出失败');
  }

  const blob = new Blob([response.data as BlobPart], { type: 'application/gzip' });
  const disposition = response.headers['content-disposition'] as string | undefined;
  let filename = 'novel-workshop-all.tar.gz';
  if (disposition) {
    const match = disposition.match(/filename\*?="?([^";]+)"?/);
    if (match) filename = decodeURIComponent(match[1]);
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导入小说（上传 tar.gz 文件，自动兼容单本和批量归档）。
 */
export async function importNovel(file: File): Promise<{ novels?: Array<{ novelId: string; title: string }>; novelId?: string; title?: string; message: string }> {
  const { data } = await http.post<{ novels?: Array<{ novelId: string; title: string }>; novelId?: string; title?: string; message: string }>(
    '/backups/import',
    file,
    {
      headers: { 'Content-Type': 'application/gzip' },
      timeout: 600_000,
    },
  );
  return data;
}

// ==================== 向量记忆管理 ====================

export type MemoryStats = {
  totalChunks: number;
  categories: Record<string, number>;
  vectorEnabled: boolean;
  initialized: boolean;
};

export async function getNovelMemoryStats(novelId: string): Promise<MemoryStats> {
  const { data } = await http.get<MemoryStats>(`/novels/${novelId}/memory/stats`);
  return data;
}
