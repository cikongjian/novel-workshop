/**
 * 通知相关路由
 * 职责：推送订阅注册/注销 + 应用内通知查询/标记已读
 * 认证由全局 auth 中间件处理（挂载于 /api）
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { NotificationService } from '../../services/notification-service.js';

export function createNotificationRouter(notificationService: NotificationService) {
  const router = Router();

  function getUserId(req: Request): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = (req as any).auth as { id?: string } | undefined;
    return auth?.id;
  }

  // 获取 VAPID 公钥（公开接口，用于前端注册）
  router.get('/vapid-public-key', (_req: Request, res: Response) => {
    const key = notificationService.getVapidPublicKey();
    if (!key) {
      res.status(503).json({ error: 'Push notification service not available' });
      return;
    }
    res.json({ publicKey: key });
  });

  // 注册/更新推送订阅
  router.post('/subscribe', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { endpoint, keys, deviceTag } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Invalid subscription payload' });
      return;
    }

    notificationService.subscribe({
      userId,
      endpoint,
      keys,
      deviceTag,
      createdAt: new Date().toISOString(),
    });

    res.json({ ok: true });
  });

  // 注销推送订阅
  router.delete('/subscribe', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { endpoint } = req.body ?? {};
    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' });
      return;
    }

    notificationService.unsubscribe(userId, endpoint);
    res.json({ ok: true });
  });

  // 获取应用内通知列表
  router.get('/in-app', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const type = req.query.type as string | undefined;
    const readParam = req.query.read;
    const read = readParam === 'true' ? true : readParam === 'false' ? false : undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const validTypes = ['chapter_ready', 'favorite_update', 'comment', 'like', 'reminder', 'system'] as const;
    const typeFilter = validTypes.includes(type as typeof validTypes[number])
      ? (type as typeof validTypes[number])
      : undefined;

    const result = notificationService.getInAppNotifications(userId, {
      type: typeFilter,
      read,
      limit,
      offset,
    });

    res.json(result);
  });

  // 获取未读数量
  router.get('/unread-count', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const count = notificationService.getUnreadCount(userId);
    res.json({ count });
  });

  // 标记单条已读
  router.post('/read/:id', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    notificationService.markRead(userId, String(req.params.id));
    res.json({ ok: true });
  });

  // 标记全部已读
  router.post('/read-all', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    notificationService.markAllRead(userId);
    res.json({ ok: true });
  });

  return router;
}
