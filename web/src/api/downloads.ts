import { http } from './http';

export interface DownloadItem {
  id: string;
  platform: 'windows' | 'macos' | 'android' | 'ios' | 'linux';
  name: string;
  version: string;
  description: string;
  fileSize: string;
  directUrl: string;
  baiduPanUrl: string;
  baiduPanCode: string;
  enabled: boolean;
  updatedAt: string;
}

export interface DownloadConfig {
  items: DownloadItem[];
  notice: string;
}

export interface UploadResult {
  url: string;
  filename: string;
  fileSize: string;
}

/** 公开接口：获取已启用的下载列表 */
export async function fetchDownloadList(): Promise<DownloadConfig> {
  const { data } = await http.get<DownloadConfig>('/downloads');
  return data;
}

/** Admin：获取完整配置 */
export async function fetchDownloadConfig(): Promise<DownloadConfig> {
  const { data } = await http.get<DownloadConfig>('/downloads/config');
  return data;
}

/** Admin：保存配置 */
export async function saveDownloadConfig(config: DownloadConfig): Promise<DownloadConfig> {
  const { data } = await http.put<DownloadConfig>('/downloads/config', config);
  return data;
}

/** Admin：上传安装包 */
export async function uploadDownloadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await http.post<UploadResult>('/downloads/upload', formData);
  return data;
}

