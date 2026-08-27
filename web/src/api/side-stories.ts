/**
 * AI 番外生成 API 封装
 */
import { http } from './http';
import { getSessionAccessToken } from '../utils/auth-session';

export type SideStorySceneType = 'childhood' | 'daily' | 'what-if' | 'prequel' | 'custom';
export type SideStoryStatus = 'pending' | 'approved' | 'rejected' | 'published';

export interface SideStory {
  id: string;
  novelId: string;
  title: string;
  content: string;
  characterIds: string[];
  characterNames: string[];
  sceneType: SideStorySceneType;
  customScene?: string;
  wordCount: number;
  status: SideStoryStatus;
  generatedBy: string;
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  likes: string[];
}

export interface SideStoryConfig {
  novelId: string;
  enabledCharacterIds: string[];
  dailyLimitPerReader: number;
  autoPublish: boolean;
}

/** 列表 */
export async function fetchSideStories(novelId: string): Promise<SideStory[]> {
  const res = await http.get(`/side-stories/by-novel/${novelId}`);
  return res.data;
}

/** 详情 */
export async function fetchSideStory(id: string): Promise<SideStory> {
  const res = await http.get(`/side-stories/${id}`);
  return res.data;
}

/** 审核 */
export async function reviewSideStory(id: string, status: SideStoryStatus): Promise<SideStory> {
  const res = await http.post(`/side-stories/${id}/review`, { status });
  return res.data;
}

/** 点赞 */
export async function toggleSideStoryLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const res = await http.post(`/side-stories/${id}/like`);
  return res.data;
}

/** 删除 */
export async function deleteSideStory(id: string): Promise<void> {
  await http.delete(`/side-stories/${id}`);
}

/** 获取配置 */
export async function fetchSideStoryConfig(novelId: string): Promise<SideStoryConfig> {
  const res = await http.get(`/side-stories/config/${novelId}`);
  return res.data;
}

/** 更新配置 */
export async function updateSideStoryConfig(novelId: string, updates: Partial<SideStoryConfig>): Promise<SideStoryConfig> {
  const res = await http.put(`/side-stories/config/${novelId}`, updates);
  return res.data;
}

/**
 * 生成番外（SSE 流式）
 */
export async function generateSideStoryStream(
  params: {
    novelId: string;
    characterIds: string[];
    sceneType: SideStorySceneType;
    customScene?: string;
    wordCount?: number;
  },
  callbacks: {
    onChunk: (chunk: string) => void;
    onDone: (storyId: string, title: string, status: SideStoryStatus) => void;
    onError: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  try {
    const token = getSessionAccessToken();
    // 携带读者本地模式 AI Key（server 模式由后端自行读取）
    const { getTransientUserApiHeaderForDefaultProfile } = await import('../utils/user-api-local');
    const transientHeader = getTransientUserApiHeaderForDefaultProfile();
    const res = await fetch('/api/side-stories/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(transientHeader ? { 'x-nw-user-api-model': transientHeader } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(params),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '生成失败' }));
      callbacks.onError(err.error || `HTTP ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError('无法读取响应流');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.type === 'chunk') {
            callbacks.onChunk(data.content);
          } else if (data.type === 'done') {
            callbacks.onDone(data.storyId, data.title, data.status);
          } else if (data.type === 'error') {
            callbacks.onError(data.message);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    callbacks.onError(err instanceof Error ? err.message : '网络错误');
  }
}
