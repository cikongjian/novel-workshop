/**
 * 角色实时对话 API 封装
 */
import { http } from './http';
import { getSessionAccessToken } from '../utils/auth-session';

export interface ChatMessage {
  id: string;
  role: 'reader' | 'character';
  content: string;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  novelId: string;
  characterId: string;
  readerId: string;
  messages: ChatMessage[];
  createdAt: number;
  lastActiveAt: number;
}

export interface ChatStats {
  totalSessions: number;
  totalMessages: number;
  characterStats: { characterId: string; sessionCount: number; messageCount: number }[];
}

/** 获取或创建会话 */
export async function fetchSession(novelId: string, characterId: string): Promise<ChatSession> {
  const res = await http.get(`/character-chat/sessions/${novelId}/${characterId}`);
  return res.data;
}

/** 清空会话 */
export async function clearSession(sessionId: string): Promise<void> {
  await http.delete(`/character-chat/${sessionId}`);
}

/** 获取作者侧统计 */
export async function fetchChatStats(novelId: string): Promise<ChatStats> {
  const res = await http.get(`/character-chat/stats/${novelId}`);
  return res.data;
}

/**
 * 发送消息并流式接收角色回复。
 * 使用 fetch + ReadableStream 解析 SSE。
 */
export async function sendMessageStream(
  sessionId: string,
  message: string,
  callbacks: {
    onChunk: (chunk: string) => void;
    onDone: (fullContent: string) => void;
    onError: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  try {
    const token = getSessionAccessToken();
    const res = await fetch(`/api/character-chat/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ message }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '发送失败' }));
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
            callbacks.onDone(data.content);
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
