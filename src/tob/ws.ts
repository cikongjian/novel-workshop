import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AgentEvent } from '../agents/types.js';

const MAX_BUFFERED_BYTES = 1024 * 1024;
const HEARTBEAT_INTERVAL = 30_000;
const EVENT_RING_SIZE = 200;

interface TimestampedEvent {
  timestamp: number;
  frame: string;
}

interface TobOutputBuffer {
  isGenerating: boolean;
  jobId: string;
  projectId: string;
  events: Array<{ type: string; payload: unknown; timestamp: number }>;
}

/** WebSocket 鉴权失败关闭码（RFC 6455 政策违规） */
const WS_CLOSE_POLICY_VIOLATION = 1008;

/**
 * 恒定时间比较，避免通过响应时间差逐字节爆破 token
 */
function isTokenValid(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * @param wss WebSocket 服务器
 * @param apiToken 连接所需 token；留空表示不校验（仅本机开发）
 */
export function createTobBroadcaster(wss: WebSocketServer, apiToken = '') {
  const buffer: TobOutputBuffer = {
    isGenerating: false,
    jobId: '',
    projectId: '',
    events: [],
  };

  const eventRing: TimestampedEvent[] = [];
  const aliveMap = new WeakMap<WebSocket, boolean>();

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (!aliveMap.get(client)) {
        client.terminate();
        continue;
      }
      aliveMap.set(client, false);
      client.ping();
    }
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    aliveMap.set(ws, true);

    ws.on('pong', () => {
      aliveMap.set(ws, true);
    });

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // 配置了 token 时必须校验，且要在下发任何缓冲事件之前完成
    if (apiToken && !isTokenValid(url.searchParams.get('token') ?? '', apiToken)) {
      ws.close(WS_CLOSE_POLICY_VIOLATION, 'unauthorized');
      return;
    }

    const sinceParam = url.searchParams.get('since');
    const sinceTs = sinceParam ? Number(sinceParam) : 0;

    if (sinceTs > 0) {
      for (const entry of eventRing) {
        if (entry.timestamp > sinceTs && ws.readyState === WebSocket.OPEN) {
          ws.send(entry.frame);
        }
      }
    } else if (buffer.isGenerating && buffer.events.length > 0) {
      for (const event of buffer.events) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      }
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: Date.now(),
        clientCount: wss.clients.size,
      }));
    }
  });

  const broadcast = (event: AgentEvent) => {
    const frame = JSON.stringify({
      type: 'event',
      event: event.type,
      payload: event,
      timestamp: Date.now(),
    });

    if (event.type === 'agent:start') {
      buffer.isGenerating = true;
      buffer.events = [];
    } else if (event.type === 'pipeline:complete') {
      buffer.isGenerating = false;
    }

    buffer.events.push({
      type: 'event',
      payload: event,
      timestamp: Date.now(),
    });

    if (buffer.events.length > 100) {
      buffer.events.shift();
    }

    if (eventRing.length >= EVENT_RING_SIZE) {
      eventRing.shift();
    }
    eventRing.push({ timestamp: Date.now(), frame });

    for (const client of wss.clients) {
      if (
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < MAX_BUFFERED_BYTES
      ) {
        client.send(frame);
      }
    }
  };

  const broadcastJson = (frame: Record<string, unknown>) => {
    const ts = Date.now();
    const raw = JSON.stringify({ ...frame, timestamp: ts });

    if (eventRing.length >= EVENT_RING_SIZE) {
      eventRing.shift();
    }
    eventRing.push({ timestamp: ts, frame: raw });

    for (const client of wss.clients) {
      if (
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < MAX_BUFFERED_BYTES
      ) {
        client.send(raw);
      }
    }
  };

  return { broadcast, broadcastJson };
}
