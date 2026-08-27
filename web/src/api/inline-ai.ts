import { getTransientUserApiHeaderForNovelId } from '../utils/user-api-local';
import { getSessionAccessToken } from '../utils/auth-session';

// ==================== 内联 AI 文本操作（SSE 流式）====================

export type InlineOperation =
  | 'continue'
  | 'rewrite'
  | 'expand'
  | 'polish'
  | 'compress'
  | 'dialogue'
  | 'describe'
  | 'custom';

export interface InlineAIParams {
  novelId?: string;
  chapterNumber?: number;
  operation: InlineOperation;
  text: string;
  context?: string;
  instruction?: string;
}

export interface InlineAIChunk {
  type: 'chunk';
  content: string;
}

export interface InlineAIDone {
  type: 'done';
  content: string;
}

export interface InlineAIError {
  type: 'error';
  message: string;
}

export type InlineAIEvent = InlineAIChunk | InlineAIDone | InlineAIError;

/**
 * 内联 AI 文本操作（SSE 流式）
 * @returns abort 函数
 */
export function streamInlineAI(
  params: InlineAIParams,
  onEvent: (event: InlineAIEvent) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const transientHeader = params.novelId ? getTransientUserApiHeaderForNovelId(params.novelId) : null;
      const accessToken = getSessionAccessToken();
      const response = await fetch('/api/generate/inline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(transientHeader ? { 'x-nw-user-api-model': transientHeader } : {}),
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '请求失败' }));
        onEvent({ type: 'error', message: errorData.error || `HTTP ${response.status}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent({ type: 'error', message: '流式响应不可用' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as InlineAIEvent;
              onEvent(data);
            } catch {
              // 忽略解析失败
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: '连接中断' });
      }
    }
  })();

  return () => controller.abort();
}

// ==================== 补全说话人标记 ====================

/**
 * AI 自动为已有章节补全 `(#角色名)` 说话人标记（SSE 流式）
 * @returns abort 函数
 */
export function streamBackfillSpeakers(
  params: { novelId: string; chapterNumber: number },
  onEvent: (event: InlineAIEvent) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const transientHeader = getTransientUserApiHeaderForNovelId(params.novelId);
      const accessToken = getSessionAccessToken();
      const response = await fetch('/api/generate/backfill-speakers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(transientHeader ? { 'x-nw-user-api-model': transientHeader } : {}),
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '请求失败' }));
        onEvent({ type: 'error', message: errorData.error || `HTTP ${response.status}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent({ type: 'error', message: '流式响应不可用' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const emitSseLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) return;
        const payload = line.replace(/^data:\s*/, '');
        if (!payload) return;
        try {
          const data = JSON.parse(payload) as InlineAIEvent;
          onEvent(data);
        } catch {
          // 忽略解析失败
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          emitSseLine(line);
        }
      }

      // flush 末尾缓冲，避免最后一个 done 事件被分片吞掉
      buffer += decoder.decode();
      if (buffer) {
        const lines = buffer.split(/\r?\n/);
        for (const line of lines) {
          emitSseLine(line);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: '连接中断' });
      }
    }
  })();

  return () => controller.abort();
}
