import { ref, onMounted, onUnmounted, unref } from 'vue';
import type { Ref } from 'vue';
import { ensureFreshAccessToken } from '../api/http';
import type { AgentEvent, BatchEvent, BatchFinalizeEvent } from '../types';
import { getWsBase, isMobileRoutePath } from '../utils/deploy-path';
import { getSessionAccessToken } from '../utils/auth-session';

/** 指数退避参数 */
const RECONNECT_BASE = 2000;
const RECONNECT_MAX = 30000;

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

/** 模块级共享状态，供外部组件直接导入 */
export const connectionStatus = ref<ConnectionStatus>('disconnected');
export const reconnectCountdown = ref(0);

export interface WebSocketOptions {
  subscription?: {
    novelId?: string | Ref<string | undefined>;
    chapterNumber?: number | null | Ref<number | null | undefined>;
  };
  /** 每个事件到达时立即回调，不经过 watch 延迟 */
  onEvent?: (event: AgentEvent) => void;
  /** 批量生成事件回调 */
  onBatchEvent?: (event: BatchEvent) => void;
  /** 批量定稿事件回调 */
  onBatchFinalizeEvent?: (event: BatchFinalizeEvent) => void;
  /** 自定义类型事件回调（batch-author-notes 等） */
  onCustomEvent?: (type: string, event: string, payload: Record<string, unknown>) => void;
  /** 新公告推送回调 */
  onAnnouncementNew?: (announcement: { id: string; title: string; type: string; priority: string }) => void;
  /** 重连时回调，用于清理旧状态 */
  onReconnect?: () => void;
  /** 移动端默认禁用 WebSocket；仅非生成类明确需要时才打开 */
  allowMobile?: boolean;
}

export function useWebSocket(options?: WebSocketOptions) {
  const isConnected = ref(false);
  const disabledOnMobile = isMobileRoutePath() && options?.allowMobile !== true;

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let isDestroyed = false;
  let reconnectAttempt = 0;
  let lastEventTimestamp = 0;

  function getWsUrl(): string {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();

    if (lastEventTimestamp > 0) {
      params.set('since', lastEventTimestamp.toString());
    }

    const token = getSessionAccessToken();
    if (token) {
      params.set('token', token);
    }

    const subscribedNovelId = unref(options?.subscription?.novelId);
    const subscribedChapterNumber = unref(options?.subscription?.chapterNumber);
    if (subscribedNovelId) {
      params.set('novelId', subscribedNovelId);
    }
    if (typeof subscribedChapterNumber === 'number' && Number.isFinite(subscribedChapterNumber) && subscribedChapterNumber > 0) {
      params.set('chapterNumber', String(subscribedChapterNumber));
    }

    const queryString = params.toString();
    return `${protocol}//${location.host}${getWsBase()}${queryString ? `?${queryString}` : ''}`;
  }

  async function connect() {
    if (isDestroyed) return;
    if (disabledOnMobile) {
      isConnected.value = false;
      connectionStatus.value = 'disconnected';
      return;
    }

    try {
      await ensureFreshAccessToken();
      if (isDestroyed) return;
      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        isConnected.value = true;
        connectionStatus.value = 'connected';
        reconnectAttempt = 0;
        reconnectCountdown.value = 0;
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // 更新最后事件时间戳
          if (msg.timestamp) {
            lastEventTimestamp = msg.timestamp;
          }

          if (msg.type === 'connected') {
            // 服务器连接确认帧
            lastEventTimestamp = msg.timestamp;
            return;
          }

          if (msg.type === 'event' && msg.payload) {
            const agentEvent: AgentEvent = {
              type: msg.event,
              agentRole: msg.payload.agentRole,
              novelId: msg.payload.novelId,
              chapterNumber: msg.payload.chapterNumber,
              data: msg.payload.data ?? '',
              timestamp: msg.payload.timestamp ?? new Date().toISOString(),
              usage: msg.payload.usage,
            };
            options?.onEvent?.(agentEvent);
          } else if (msg.type === 'batch' && msg.payload) {
            const batchEvent: BatchEvent = msg.payload;
            options?.onBatchEvent?.(batchEvent);
          } else if (msg.type === 'batch-finalize' && msg.payload) {
            const finalizeEvent: BatchFinalizeEvent = msg.payload;
            options?.onBatchFinalizeEvent?.(finalizeEvent);
          } else if (msg.type === 'announcement:new' && msg.data) {
            options?.onAnnouncementNew?.(msg.data);
          } else if (msg.event && msg.payload) {
            options?.onCustomEvent?.(msg.type, msg.event, msg.payload);
          }
        } catch {
          // 忽略无法解析的消息
        }
      };

      ws.onclose = () => {
        const wasConnected = isConnected.value;
        isConnected.value = false;
        if (wasConnected) {
          connectionStatus.value = 'reconnecting';
          options?.onReconnect?.();
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws?.close();
      };
    } catch {
      isConnected.value = false;
      connectionStatus.value = 'disconnected';
    }
  }

  function scheduleReconnect() {
    if (disabledOnMobile) return;
    if (isDestroyed || reconnectTimer) return;

    connectionStatus.value = 'reconnecting';

    // 指数退避 + jitter：防止多客户端同时断线时惊群重连
    const baseDelay = Math.min(RECONNECT_BASE * Math.pow(2, reconnectAttempt), RECONNECT_MAX);
    const jitter = Math.random() * Math.min(baseDelay * 0.3, 3000);
    const delay = baseDelay + jitter;
    reconnectAttempt++;

    // 倒计时显示
    reconnectCountdown.value = Math.ceil(delay / 1000);
    countdownTimer = setInterval(() => {
      reconnectCountdown.value = Math.max(0, reconnectCountdown.value - 1);
    }, 1000);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      connect();
    }, delay);
  }

  function disconnect() {
    isDestroyed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      ws = null;
    }
    isConnected.value = false;
    connectionStatus.value = 'disconnected';
  }

  onMounted(() => {
    if (disabledOnMobile) return;
    connect();
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    connectionStatus,
    reconnectCountdown,
  };
}
