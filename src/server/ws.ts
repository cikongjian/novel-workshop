import { WebSocketServer, WebSocket } from 'ws';
import type { AgentEvent, AgentRole } from '../agents/types.js';
import type { IncomingMessage } from 'node:http';
import { verifyAccessToken } from '../auth/jwt-service.js';
import type { Redis } from 'ioredis';
import type { NovelManager } from '../novel/novel-manager.js';

/** 单个客户端最大缓冲字节数，超过则跳过本次发送 */
const MAX_BUFFERED_BYTES = 1024 * 1024; // 1MB

/** 心跳间隔 (ms) */
const HEARTBEAT_INTERVAL = 30_000;

/** 心跳超时：超过此时间未收到 pong 则断开 */

/** 事件环形缓冲区大小 */
const EVENT_RING_SIZE = 200;

/** Buffer 过期时间：超过此时间无更新且 isGenerating=true 则自动清理 (15 分钟) */
const BUFFER_STALE_MS = 15 * 60 * 1000;

/** 生成输出缓冲 Map 的上限，防止长期运行下 novelId 维度无界增长 */
const MAX_OUTPUT_BUFFERS = 500;

/**
 * 带时间戳的事件记录
 */
interface TimestampedEvent {
  timestamp: number;
  frame: string;
  novelId?: string;
  chapterNumber?: number;
}

type SubscriptionFilter = {
  novelId?: string;
  chapterNumber?: number;
};

/**
 * Agent 输出缓冲：存储当前生成中各 Agent 的累积输出
 * 新连接的客户端可以立即同步到最新状态
 */
interface OutputBuffer {
  /** 当前是否正在生成 */
  isGenerating: boolean;
  /** 当前生成的 novelId */
  novelId: string;
  /** 当前生成的章节号 */
  chapterNumber: number;
  /** 各 Agent 的累积输出 */
  agentOutputs: Map<AgentRole, string>;
  /** 各 Agent 的状态 */
  agentStatus: Map<AgentRole, 'active' | 'done' | 'error'>;
  /** 最近一次事件时间，用于 REST 轮询取最新结果 */
  updatedAt: number;
  /** 最近一次小说元数据回填时间，用于移动端详情刷新 */
  metadataUpdatedAt?: number;
}

/**
 * 创建 WebSocket 广播器
 * 支持心跳检测、输出缓冲、事件环形缓冲和断线重连同步
 * @param authEnabled 是否启用认证（传入 true 时需要 JWT token）
 * @param redis Redis 客户端（用于验证 token）
 * @param jwtSecret JWT 密钥（authEnabled=true 时必传）
 */
export function createBroadcaster(wss: WebSocketServer, authEnabled = false, redis?: Redis, jwtSecret?: string, novelManager?: NovelManager) {
  const buffers = new Map<string, OutputBuffer>();

  /** 清理过时的 Buffer（isGenerating=true 但超过 BUFFER_STALE_MS 无更新） */
  const cleanupStaleBuffers = (): void => {
    const now = Date.now();
    for (const [key, buffer] of buffers) {
      if (buffer.isGenerating && (now - buffer.updatedAt) > BUFFER_STALE_MS) {
        console.warn(`[ws] 清理过时生成缓冲 key=${key} novelId=${buffer.novelId} chapter=${buffer.chapterNumber} staleMs=${now - buffer.updatedAt}`);
        buffer.isGenerating = false;
        // 将 status 标记为 error 以便移动端轮询能正确报告失败状态
        buffer.agentStatus.set('writing-assistant', 'error');
        buffer.agentOutputs.set('writing-assistant', `[错误] 生成中断：任务超过 ${Math.round(BUFFER_STALE_MS / 60000)} 分钟无响应，已自动释放。`);
        buffer.updatedAt = now;
      }
    }
    // 上限保护：buffer 数量超限时，优先淘汰最旧的「已完成」buffer（保留生成中的与近期供 REST 轮询的结果）
    if (buffers.size > MAX_OUTPUT_BUFFERS) {
      const completed = [...buffers.entries()]
        .filter(([, b]) => !b.isGenerating)
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      const evictCount = buffers.size - MAX_OUTPUT_BUFFERS;
      for (let i = 0; i < evictCount && i < completed.length; i++) {
        buffers.delete(completed[i][0]);
      }
    }
  };

  // 事件环形缓冲区：存储最近 EVENT_RING_SIZE 条事件，支持断线补发
  const eventRing: TimestampedEvent[] = [];

  // ===== 心跳机制 =====
  const aliveMap = new WeakMap<WebSocket, boolean>();
  const subscriptionMap = new WeakMap<WebSocket, SubscriptionFilter>();
  const userIdMap = new WeakMap<WebSocket, string | null>(); // null = 未认证（authEnabled=false）
  const roleMap = new WeakMap<WebSocket, string | null>(); // admin | user | null

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (!aliveMap.get(client)) {
        client.terminate();
        continue;
      }
      aliveMap.set(client, false);
      client.ping();
    }
    // 每次心跳同时清理过时缓冲
    cleanupStaleBuffers();
  }, HEARTBEAT_INTERVAL);
  // unref：心跳定时器不应阻止进程退出，由优雅停机统一收尾
  heartbeatInterval.unref();

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // ===== 统一连接处理（认证 + 心跳 + 断线重连）=====
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // 如果启用认证，验证 JWT token
    if (authEnabled) {
      const authUrl = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      const token = authUrl.searchParams.get('token');

      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      try {
        if (!jwtSecret) {
          ws.close(1011, 'Authentication service unavailable');
          return;
        }

        const payload = verifyAccessToken(token, jwtSecret);
        if (!payload) {
          ws.close(1008, 'Invalid token');
          return;
        }
        userIdMap.set(ws, payload.userId);
        roleMap.set(ws, payload.role ?? null);
      } catch {
        ws.close(1008, 'Authentication failed');
        return;
      }
    } else {
      // 未启用认证（开发模式），标记为 null（跳过所有权校验）
      userIdMap.set(ws, null);
      roleMap.set(ws, null);
    }

    // 认证通过（或未启用认证），设置心跳
    aliveMap.set(ws, true);

    ws.on('pong', () => {
      aliveMap.set(ws, true);
    });

    // 解析 ?since=<timestamp> 参数，补发遗漏事件
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const sinceParam = url.searchParams.get('since');
    const sinceTs = sinceParam ? Number(sinceParam) : 0;
    const subscription = parseSubscription(url);

    // 所有权校验：启用认证时，验证订阅的 novelId 属于当前用户
    const wsUserId = userIdMap.get(ws);
    if (authEnabled && wsUserId !== null && subscription.novelId && novelManager) {
      try {
        const novel = await novelManager.getNovel(subscription.novelId);
        const ownerId = novel?.ownerId ?? 'dev';
        // 管理员（role 在 JWT payload 中）此处无法直接取到，仅校验 ownerId
        // 管理员在 JWT payload 中有 role 字段，需从 token 重新解析
        const authUrl2 = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
        const token2 = authUrl2.searchParams.get('token');
        let isAdmin = false;
        if (token2 && jwtSecret) {
          try {
            const p = verifyAccessToken(token2, jwtSecret);
            isAdmin = p.role === 'admin';
          } catch { /* ignore */ }
        }
        if (!isAdmin && ownerId !== wsUserId) {
          ws.close(1008, 'Forbidden: novel access denied');
          return;
        }
      } catch {
        ws.close(1011, 'Internal error checking novel access');
        return;
      }
    }

    subscriptionMap.set(ws, subscription);

    if (sinceTs > 0) {
      for (const entry of eventRing) {
        if (
          entry.timestamp > sinceTs &&
          matchesSubscription(subscription, entry) &&
          ws.readyState === WebSocket.OPEN
        ) {
          ws.send(entry.frame);
        }
      }
    }
    syncBuffersToClient(ws, buffers, subscription);

    // 发送连接确认帧（含服务器时间戳，客户端用于后续 since 参数）
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: Date.now(),
        clientCount: wss.clients.size,
      }));
    }
  });

  // ===== 广播函数 =====
  const broadcast = (event: AgentEvent) => {
    // 更新缓冲区（保留完整数据）
    updateBuffer(buffers, event);

    // 对 agent:complete 事件裁剪 data，只广播元数据（客户端可通过 REST 获取完整内容）
    // 保留 usage 字段以便前端追踪 token 消耗
    const broadcastPayload = event.type === 'agent:complete'
      ? { ...event, data: event.data ? `[完成，共${event.data.length}字]` : '' }
      : event;

    // 构建帧
    const frame = JSON.stringify({
      type: 'event',
      event: event.type,
      payload: broadcastPayload,
      timestamp: Date.now(),
    });

    // 写入环形缓冲区
    if (eventRing.length >= EVENT_RING_SIZE) {
      eventRing.shift();
    }
    eventRing.push({
      timestamp: Date.now(),
      frame,
      novelId: event.novelId,
      chapterNumber: event.chapterNumber,
    });

    // 广播给所有客户端（含跨租户隔离）
    for (const client of wss.clients) {
      const subscription = subscriptionMap.get(client) ?? {};
      // 跨租户隔离：启用认证时，仅向该小说所有者或管理员广播
      if (authEnabled && event.novelId) {
        const clientUserId = userIdMap.get(client);
        const clientRole = roleMap.get(client);
        if (clientUserId !== null && clientUserId !== undefined && clientRole !== 'admin') {
          const subNovelId = subscription.novelId;
          if (!subNovelId || subNovelId !== event.novelId) {
            continue; // 未订阅该小说的用户不接收
          }
        }
      }
      if (
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < MAX_BUFFERED_BYTES &&
        matchesSubscription(subscription, event)
      ) {
        try { client.send(frame); } catch { /* 客户端已断开，忽略 */ }
      }
    }
  };

  /**
   * 广播任意 JSON 帧（用于 batch 等非 Agent 事件）
   */
  const broadcastJson = (frame: Record<string, unknown>) => {
    const ts = Date.now();
    const raw = JSON.stringify({ ...frame, timestamp: ts });
    const scope = extractFrameScope(frame);

    // 写入环形缓冲区
    if (eventRing.length >= EVENT_RING_SIZE) {
      eventRing.shift();
    }
    eventRing.push({ timestamp: ts, frame: raw, ...scope });

    for (const client of wss.clients) {
      const subscription = subscriptionMap.get(client) ?? {};
      // 若 scope 无 novelId（系统级事件），只发给无过滤条件的客户端，不广播给已订阅特定小说的客户端
      if (!scope.novelId && subscription.novelId) continue;
      // 跨租户隔离：启用认证时，仅向该小说所有者或管理员广播
      if (authEnabled && scope.novelId) {
        const clientUserId = userIdMap.get(client);
        const clientRole = roleMap.get(client);
        if (clientUserId !== null && clientUserId !== undefined && clientRole !== 'admin') {
          const subNovelId = subscription.novelId;
          if (!subNovelId || subNovelId !== scope.novelId) {
            continue;
          }
        }
      }
      if (
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < MAX_BUFFERED_BYTES &&
        matchesSubscription(subscription, scope)
      ) {
        try { client.send(raw); } catch { /* 客户端已断开，忽略 */ }
      }
    }
  };

  /**
   * 查询指定小说的当前生成状态（用于移动端轮询，替代 WebSocket）
   */
  const getNovelGenerationStatus = (novelId: string): {
    isGenerating: boolean;
    chapterNumber: number | null;
    activeAgents: string[];
    agentStatuses: Record<string, 'active' | 'done' | 'error'>;
    writingAssistantOutput: string;
    lastCompletedChapter: number | null;
    lastCompletedAt: number | null;
    lastFailedChapter: number | null;
    lastFailedAt: number | null;
    lastFailureMessage: string;
    metadataUpdatedAt: number | null;
  } => {
    // 先清理过时缓冲，防止卡死状态被读取
    cleanupStaleBuffers();

    const result = {
      isGenerating: false,
      chapterNumber: null as number | null,
      activeAgents: [] as string[],
      agentStatuses: {} as Record<string, 'active' | 'done' | 'error'>,
      writingAssistantOutput: '',
      lastCompletedChapter: null as number | null,
      lastCompletedAt: null as number | null,
      lastFailedChapter: null as number | null,
      lastFailedAt: null as number | null,
      lastFailureMessage: '',
      metadataUpdatedAt: null as number | null,
    };

    // 遍历所有 buffer，找到匹配 novelId 且正在生成的
    let latestCompleted: OutputBuffer | null = null;
    for (const buffer of buffers.values()) {
      if (buffer.novelId !== novelId) continue;
      if (buffer.metadataUpdatedAt && buffer.metadataUpdatedAt > (result.metadataUpdatedAt ?? 0)) {
        result.metadataUpdatedAt = buffer.metadataUpdatedAt;
      }
      if (!buffer.isGenerating) {
        if (buffer.updatedAt > (latestCompleted?.updatedAt ?? 0)) {
          latestCompleted = buffer;
        }
        continue;
      }

      result.isGenerating = true;
      result.chapterNumber = buffer.chapterNumber || null;

      for (const [role, status] of buffer.agentStatus) {
        result.agentStatuses[role] = status;
        if (status === 'active') {
          result.activeAgents.push(role);
        }
      }

      const waOutput = buffer.agentOutputs.get('writing-assistant');
      if (waOutput) {
        result.writingAssistantOutput = waOutput;
      }
      if (result.activeAgents.length === 0) {
        result.activeAgents.push('writing-assistant');
        result.agentStatuses['writing-assistant'] = 'active';
        result.writingAssistantOutput ||= '章节生成仍在推进，正在衔接下一位创作 Agent。';
      }

      break; // 取第一个活跃的 buffer 即可
    }

    if (!result.isGenerating && latestCompleted) {
      const errorOutput = latestCompleted.agentOutputs.get('writing-assistant') ?? '';
      const failed = latestCompleted.agentStatus.get('writing-assistant') === 'error';
      if (failed) {
        result.lastFailedChapter = latestCompleted.chapterNumber || null;
        result.lastFailedAt = latestCompleted.updatedAt;
        result.lastFailureMessage = errorOutput.replace(/^\[错误]\s*/, '');
      } else {
        result.lastCompletedChapter = latestCompleted.chapterNumber || null;
        result.lastCompletedAt = latestCompleted.updatedAt;
      }
    }

    return result;
  };

  return { broadcast, broadcastJson, getNovelGenerationStatus };
}

function updateBuffer(buffers: Map<string, OutputBuffer>, event: AgentEvent): void {
  const { novelId, chapterNumber } = event;
  const key = `${novelId}:${chapterNumber ?? 0}`;
  let buffer = buffers.get(key);
  if (!buffer) {
    buffer = {
      isGenerating: false,
      novelId,
      chapterNumber: chapterNumber ?? 0,
      agentOutputs: new Map(),
      agentStatus: new Map(),
      updatedAt: Date.now(),
    };
    buffers.set(key, buffer);
  }

  const { type, agentRole, data } = event;
  buffer.updatedAt = Date.now();
  switch (type) {
    case 'agent:start':
      buffer.isGenerating = true;
      buffer.agentOutputs.set(agentRole, '');
      buffer.agentStatus.set(agentRole, 'active');
      break;
    case 'agent:chunk': {
      const current = buffer.agentOutputs.get(agentRole) ?? '';
      buffer.agentOutputs.set(agentRole, current + data);
      break;
    }
    case 'agent:complete':
      if (data) buffer.agentOutputs.set(agentRole, data);
      buffer.agentStatus.set(agentRole, 'done');
      break;
    case 'agent:error':
      buffer.agentOutputs.set(agentRole, `[错误] ${data}`);
      buffer.agentStatus.set(agentRole, 'error');
      break;
    case 'pipeline:complete':
      for (const related of buffers.values()) {
        if (related.novelId === novelId) related.isGenerating = false;
      }
      buffer.isGenerating = false;
      break;
    case 'novel:metadata-updated':
      buffer.metadataUpdatedAt = Date.now();
      break;
  }
}

/**
 * 将当前缓冲状态同步给新连接的客户端
 * 发送合成事件使客户端恢复到当前状态
 */
function syncBufferToClient(ws: WebSocket, buffer: OutputBuffer): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  const { novelId, chapterNumber, agentOutputs, agentStatus } = buffer;

  for (const [role, status] of agentStatus) {
    const output = agentOutputs.get(role) ?? '';

    // 发送 agent:start 让客户端知道这个 Agent 已经启动过
    if (status === 'active') {
      // Agent 仍在工作中：发 start + 累积内容作为单个 chunk
      ws.send(JSON.stringify({
        type: 'event',
        event: 'agent:start',
        payload: {
          type: 'agent:start',
          agentRole: role,
          novelId,
          chapterNumber,
          data: '',
          timestamp: new Date().toISOString(),
        },
      }));

      if (output) {
        ws.send(JSON.stringify({
          type: 'event',
          event: 'agent:chunk',
          payload: {
            type: 'agent:chunk',
            agentRole: role,
            novelId,
            chapterNumber,
            data: output,
            timestamp: new Date().toISOString(),
          },
        }));
      }
    } else if (status === 'done') {
      // Agent 已完成：发 start + complete
      ws.send(JSON.stringify({
        type: 'event',
        event: 'agent:start',
        payload: {
          type: 'agent:start',
          agentRole: role,
          novelId,
          chapterNumber,
          data: '',
          timestamp: new Date().toISOString(),
        },
      }));
      ws.send(JSON.stringify({
        type: 'event',
        event: 'agent:complete',
        payload: {
          type: 'agent:complete',
          agentRole: role,
          novelId,
          chapterNumber,
          data: output,
          timestamp: new Date().toISOString(),
        },
      }));
    }
  }
}

function syncBuffersToClient(
  ws: WebSocket,
  buffers: Map<string, OutputBuffer>,
  subscription: SubscriptionFilter,
): void {
  for (const buffer of buffers.values()) {
    if (!buffer.isGenerating) continue;
    if (!matchesSubscription(subscription, buffer)) continue;
    syncBufferToClient(ws, buffer);
  }
}

function parseSubscription(url: URL): SubscriptionFilter {
  const novelId = url.searchParams.get('novelId')?.trim() || undefined;
  const chapterNumberRaw = url.searchParams.get('chapterNumber');
  const chapterNumber = chapterNumberRaw != null && chapterNumberRaw !== ''
    ? Number(chapterNumberRaw)
    : undefined;

  return {
    novelId,
    chapterNumber: Number.isFinite(chapterNumber) && chapterNumber! > 0 ? chapterNumber : undefined,
  };
}

function extractFrameScope(frame: Record<string, unknown>): SubscriptionFilter {
  const payload = (
    frame.payload && typeof frame.payload === 'object'
      ? frame.payload as Record<string, unknown>
      : undefined
  );
  const novelId = (
    typeof frame.novelId === 'string'
      ? frame.novelId
      : typeof payload?.novelId === 'string'
        ? payload.novelId
        : undefined
  );
  const chapterValue = (
    typeof frame.chapterNumber === 'number'
      ? frame.chapterNumber
      : typeof payload?.chapterNumber === 'number'
        ? payload.chapterNumber
        : undefined
  );

  return {
    novelId,
    chapterNumber: Number.isFinite(chapterValue) ? chapterValue : undefined,
  };
}

function matchesSubscription(subscription: SubscriptionFilter, scope: SubscriptionFilter): boolean {
  if (!subscription.novelId && subscription.chapterNumber == null) {
    return true;
  }
  if (subscription.novelId && scope.novelId !== subscription.novelId) {
    return false;
  }
  if (subscription.chapterNumber != null && scope.chapterNumber !== subscription.chapterNumber) {
    return false;
  }
  return Boolean(scope.novelId);
}
