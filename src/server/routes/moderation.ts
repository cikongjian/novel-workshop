import express from 'express';
import type { Request, Response } from 'express';
import { UserBanManager } from '../../bookstore/user-ban-manager.js';
import { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { ComplianceEventManager } from '../../compliance/compliance-event-manager.js';
import { buildComplianceRequestContext } from '../../compliance/compliance-event-manager.js';
import { BanUserRequestSchema, OfflineRequestSchema } from '../../bookstore/types.js';
import { requireAdmin } from '../middleware/auth.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

export function createModerationRoutes(
  userBanManager: UserBanManager,
  bookStoreManager: BookStoreManager,
  complianceEventManager?: ComplianceEventManager,
) {
  const router = express.Router();

  router.use(requireAdmin());

  function sendDeprecated(res: Response, code: string) {
    const messageByCode: Record<string, string> = {
      MODERATION_CHECK_BAN_DEPRECATED: '该封禁检查接口已下线。',
      MODERATION_CLEANUP_EXPIRED_DEPRECATED: '该过期封禁清理接口已下线，请改用 nw moderation cleanup-expired-bans。',
    };
    return res.status(410).json({
      error: messageByCode[code] ?? '该管理接口已下线。',
      code,
    });
  }

  router.post('/offline-chapter', async (req: Request, res: Response) => {
    try {
      const request = OfflineRequestSchema.parse(req.body);

      if (!request.chapterId) {
        return res.status(400).json({ error: '请提供章节 ID' });
      }

      res.status(501).json({
        error: '章节级下架尚未实现，请改用全书下架或举报处置流程',
      });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '章节下架操作失败') });
    }
  });

  router.post('/offline-book', async (req: Request, res: Response) => {
    try {
      const request = OfflineRequestSchema.parse(req.body);

      const book = await bookStoreManager.getBookByNovelId(request.novelId);
      if (!book) {
        return res.status(404).json({ error: '作品不存在' });
      }

      await bookStoreManager.offlineBook(book.id, request.reason);
      await complianceEventManager?.record({
        category: 'moderation',
        eventType: 'offline_book',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'novel',
        targetId: request.novelId,
        targetLabel: book.title,
        request: buildComplianceRequestContext(req),
        detail: {
          bookId: book.id,
          reason: request.reason,
        },
      });

      res.json({ success: true, message: '作品已下架' });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '作品下架操作失败') });
    }
  });

  router.post('/reonline-book', async (req: Request, res: Response) => {
    try {
      const { novelId } = req.body;
      if (!novelId) {
        return res.status(400).json({ error: '请提供小说 ID' });
      }

      const book = await bookStoreManager.getBookByNovelId(novelId);
      if (!book) {
        return res.status(404).json({ error: '作品不存在' });
      }

      await bookStoreManager.reOnlineBook(book.id);
      await complianceEventManager?.record({
        category: 'moderation',
        eventType: 'reonline_book',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'novel',
        targetId: novelId,
        targetLabel: book.title,
        request: buildComplianceRequestContext(req),
        detail: {
          bookId: book.id,
        },
      });

      res.json({ success: true, message: '作品已重新上架' });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '作品重新上架操作失败') });
    }
  });

  router.post('/ban-user', async (req: Request, res: Response) => {
    try {
      const operatorId = req.auth!.id;
      const request = BanUserRequestSchema.parse(req.body);

      const ban = await userBanManager.banUser(operatorId, request);
      await complianceEventManager?.record({
        category: 'moderation',
        eventType: 'ban_user',
        status: 'success',
        actorUserId: operatorId,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'user',
        targetId: request.userId,
        targetLabel: request.banType,
        request: buildComplianceRequestContext(req),
        detail: {
          reason: request.reason,
          duration: request.duration ?? null,
          relatedNovelId: request.relatedNovelId ?? null,
          relatedReportId: request.relatedReportId ?? null,
          banId: ban.id,
        },
      });

      res.json({
        success: true,
        banId: ban.id,
        message: `用户已${request.banType === 'permanent_ban' ? '永久' : '临时'}封禁`,
      });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '封禁用户操作失败') });
    }
  });

  router.post('/unban-user', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: '请提供用户 ID' });
      }

      await userBanManager.unbanUser(userId);
      await complianceEventManager?.record({
        category: 'moderation',
        eventType: 'unban_user',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'user',
        targetId: userId,
        targetLabel: userId,
        request: buildComplianceRequestContext(req),
      });

      res.json({ success: true, message: '已解除封禁' });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '解除封禁操作失败') });
    }
  });

  router.get('/ban-history/:userId', async (req: Request, res: Response) => {
    try {
      const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      const history = await userBanManager.getUserBanHistory(userId);

      res.json(history);
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取封禁历史失败') });
    }
  });

  router.get('/check-ban/:userId', async (req: Request, res: Response) => {
    void req;
    return sendDeprecated(res, 'MODERATION_CHECK_BAN_DEPRECATED');
  });

  router.get('/banned-users', async (_req: Request, res: Response) => {
    try {
      const bannedUsers = await userBanManager.getBannedUsers();
      res.json(bannedUsers);
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取封禁用户列表失败') });
    }
  });

  router.get('/banned-users/count', async (_req: Request, res: Response) => {
    try {
      const count = await userBanManager.getBannedUserCount();
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取封禁用户数量失败') });
    }
  });

  router.post('/cleanup-expired', async (_req: Request, res: Response) => {
    return sendDeprecated(res, 'MODERATION_CLEANUP_EXPIRED_DEPRECATED');
  });

  return router;
}
