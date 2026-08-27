import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AuthDb } from '../../auth/types.js';
import { listUsers } from '../../auth/admin-user-service.js';
import type { UnifiedMessageService } from '../../services/unified-message-service.js';
import { readJson, writeJson, pathExists } from '../../novel/fs-helpers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('admin-notifications');

const MAX_BROADCAST_BODY = 600;
const MAX_BROADCAST_TITLE = 80;

type BroadcastRecord = {
  id: string;
  title: string;
  body: string;
  targetUserId?: string;
  sentCount: number;
  sentAt: string;
  revokedAt?: string;
};

type BroadcastStore = {
  items: BroadcastRecord[];
};

function broadcastStorePath(dataDir: string) {
  return path.join(dataDir, 'broadcasts.json');
}

async function loadBroadcasts(dataDir: string): Promise<BroadcastStore> {
  if (!(await pathExists(broadcastStorePath(dataDir)))) {
    return { items: [] };
  }
  return readJson<BroadcastStore>(broadcastStorePath(dataDir), { items: [] });
}

async function saveBroadcasts(dataDir: string, store: BroadcastStore) {
  await writeJson(broadcastStorePath(dataDir), store);
}

async function doSendBroadcast(
  unifiedMessageService: UnifiedMessageService,
  authDb: AuthDb | undefined,
  title: string,
  body: string,
  targetUserId?: string,
): Promise<{ sent: number; total: number; broadcastId: string }> {
  const broadcastId = randomUUID();
  const recipients: string[] = [];

  if (targetUserId) {
    recipients.push(targetUserId);
  } else if (authDb) {
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const page = await listUsers(authDb, { limit: 200, offset });
      for (const u of page.items) recipients.push(u.id);
      hasMore = page.items.length === 200;
      offset += 200;
    }
  } else {
    throw new Error('广播模式下需要指定 targetUserId 或确保 authDb 可用');
  }

  let sent = 0;
  for (const userId of recipients) {
    try {
      unifiedMessageService.addMessage(userId, {
        userId,
        type: 'system',
        conversationId: 'system_broadcast',
        conversationName: '系统通知',
        title,
        body,
        data: { broadcastId },
      });
      sent++;
    } catch { /* skip */ }
  }

  return { sent, total: recipients.length, broadcastId };
}

export function createAdminNotificationRouter(
  unifiedMessageService: UnifiedMessageService,
  authDb?: AuthDb,
  dataDir?: string,
) {
  const router = Router();
  const dir = dataDir || path.resolve('data');

  function ensureAdmin(req: Request, res: Response): boolean {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: '需要管理员权限' });
      return false;
    }
    return true;
  }

  function validate(trimmedTitle: string, trimmedBody: string, res: Response): boolean {
    if (!trimmedTitle || !trimmedBody) { res.status(400).json({ error: '标题和内容不能为空' }); return false; }
    if (trimmedTitle.length > MAX_BROADCAST_TITLE) { res.status(400).json({ error: `标题不能超过 ${MAX_BROADCAST_TITLE} 字` }); return false; }
    if (trimmedBody.length > MAX_BROADCAST_BODY) { res.status(400).json({ error: `内容不能超过 ${MAX_BROADCAST_BODY} 字` }); return false; }
    return true;
  }

  // ── 发送广播 ──
  router.post('/broadcast', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const { title, body, targetUserId } = (req.body ?? {}) as {
        title?: string; body?: string; targetUserId?: string;
      };

      const trimmedTitle = (title ?? '').trim();
      const trimmedBody = (body ?? '').trim();
      if (!validate(trimmedTitle, trimmedBody, res)) return;

      const result = await doSendBroadcast(unifiedMessageService, authDb, trimmedTitle, trimmedBody, targetUserId);

      const store = await loadBroadcasts(dir);
      store.items.unshift({
        id: result.broadcastId,
        title: trimmedTitle,
        body: trimmedBody,
        targetUserId: targetUserId || undefined,
        sentCount: result.sent,
        sentAt: new Date().toISOString(),
      });
      await saveBroadcasts(dir, store);

      res.json({ sent: result.sent, total: result.total, broadcastId: result.broadcastId });
    } catch (err) {
      log.error(`广播通知失败: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: '发送失败' });
    }
  });

  // ── 广播列表 ──
  router.get('/list', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const store = await loadBroadcasts(dir);
      res.json(store.items);
    } catch (err) {
      res.status(500).json({ error: '读取失败' });
    }
  });

  // ── 撤销广播（真正删除用户消息 + 标记历史） ──
  router.delete('/:broadcastId', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const { broadcastId } = req.params;
      const store = await loadBroadcasts(dir);
      const idx = store.items.findIndex(r => r.id === broadcastId);
      if (idx < 0) { res.status(404).json({ error: '广播记录不存在' }); return; }
      if (store.items[idx].revokedAt) { res.status(400).json({ error: '已撤销' }); return; }

      // 1) 从用户消息中心清除
      const deleted = unifiedMessageService.deleteMessagesByBroadcastId(String(broadcastId));

      // 2) 标记为已撤销
      store.items[idx].revokedAt = new Date().toISOString();
      await saveBroadcasts(dir, store);

      log.info(`管理员撤销广播: ${broadcastId}, 清除 ${deleted} 条消息`);
      res.json({ revoked: true, broadcastId, deletedMessages: deleted });
    } catch (err) {
      log.error(`撤销广播失败: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: '撤销失败' });
    }
  });

  // ── 删除历史记录 ──
  router.delete('/history/:broadcastId', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const { broadcastId } = req.params;
      const store = await loadBroadcasts(dir);
      const idx = store.items.findIndex(r => r.id === broadcastId);
      if (idx < 0) { res.status(404).json({ error: '广播记录不存在' }); return; }

      store.items.splice(idx, 1);
      await saveBroadcasts(dir, store);

      log.info(`管理员删除广播记录: ${broadcastId}`);
      res.json({ deleted: true, broadcastId });
    } catch (err) {
      res.status(500).json({ error: '删除失败' });
    }
  });

  // ── 修改后重新发送 ──
  router.post('/:broadcastId/resend', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const { broadcastId } = req.params;
      const store = await loadBroadcasts(dir);
      const record = store.items.find(r => r.id === broadcastId);
      if (!record) { res.status(404).json({ error: '广播记录不存在' }); return; }

      const body = (req.body ?? {}) as { title?: string; body?: string };
      const newTitle = (body.title ?? record.title).trim();
      const newBody = (body.body ?? record.body).trim();
      if (!validate(newTitle, newBody, res)) return;

      const result = await doSendBroadcast(
        unifiedMessageService,
        authDb,
        newTitle,
        newBody,
        record.targetUserId,
      );

      store.items.unshift({
        id: result.broadcastId,
        title: newTitle,
        body: newBody,
        targetUserId: record.targetUserId,
        sentCount: result.sent,
        sentAt: new Date().toISOString(),
      });
      await saveBroadcasts(dir, store);

      res.json({ sent: result.sent, total: result.total, broadcastId: result.broadcastId });
    } catch (err) {
      log.error(`重发广播失败: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: '重发失败' });
    }
  });

  return router;
}
