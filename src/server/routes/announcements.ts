import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AnnouncementManager } from '../../announcement/announcement-manager.js';
import {
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
  ListAnnouncementsQuery,
} from '../../announcement/types.js';
import { AppError, ValidationError } from '../errors.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('announcements-route');

type BroadcastFn = (data: unknown) => void;

export function createAnnouncementsRouter(
  announcementManager: AnnouncementManager,
  broadcastJson?: BroadcastFn,
) {
  const router = Router();

  function sendDeprecated(res: Response, code: string) {
    const messageByCode: Record<string, string> = {
      ANNOUNCEMENT_ADMIN_DETAIL_DEPRECATED: '该公告详情接口已下线，请改用当前公告列表接口。',
    };
    return res.status(410).json({
      error: messageByCode[code] ?? '该公告接口已下线。',
      code,
    });
  }

  // ==================== 用户端 API ====================

  // 获取当前用户的活跃公告（已发布 + 未过期 + 角色匹配）
  router.get('/announcements', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user) {
      throw new AppError('未认证', 401);
    }

    const userId = Array.isArray(user.id) ? user.id[0] : user.id;
    const announcements = await announcementManager.listActiveAnnouncementsForUser(
      userId,
      user.role,
    );

    res.json({ announcements });
  });

  // 获取未读公告数量
  router.get('/announcements/unread-count', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user) {
      throw new AppError('未认证', 401);
    }

    const userId = Array.isArray(user.id) ? user.id[0] : user.id;
    const count = await announcementManager.getUnreadCount(userId, user.role);
    res.json({ count });
  });

  // 标记公告为已读
  router.post('/announcements/:id/read', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user) {
      throw new AppError('未认证', 401);
    }

    const announcementId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const userId = Array.isArray(user.id) ? user.id[0] : user.id;
    await announcementManager.markAsRead(announcementId, userId);
    res.json({ success: true });
  });

  // ==================== 管理员 API ====================

  // 创建公告（草稿）
  router.post('/admin/announcements', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user || user.role !== 'admin') {
      throw new AppError('需要管理员权限', 403);
    }

    const parsed = CreateAnnouncementRequest.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('请求参数错误', parsed.error.errors);
    }

    const userId = Array.isArray(user.id) ? user.id[0] : user.id;
    const announcement = await announcementManager.createAnnouncement(
      parsed.data,
      userId,
    );

    logger.info(`管理员 ${user.username} 创建公告: ${announcement.id}`);
    res.status(201).json({ announcement });
  });

  // 获取所有公告（含草稿、已归档）
  router.get('/admin/announcements', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user || user.role !== 'admin') {
      throw new AppError('需要管理员权限', 403);
    }

    const parsed = ListAnnouncementsQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('查询参数错误', parsed.error.errors);
    }

    const result = await announcementManager.listAnnouncements(parsed.data);
    res.json(result);
  });

  // 获取单个公告详情
  router.get('/admin/announcements/:id', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user || user.role !== 'admin') {
      throw new AppError('需要管理员权限', 403);
    }
    return sendDeprecated(res, 'ANNOUNCEMENT_ADMIN_DETAIL_DEPRECATED');
  });

  // 更新公告
  router.put('/admin/announcements/:id', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user || user.role !== 'admin') {
      throw new AppError('需要管理员权限', 403);
    }

    const announcementId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const parsed = UpdateAnnouncementRequest.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('请求参数错误', parsed.error.errors);
    }

    const announcement = await announcementManager.updateAnnouncement(announcementId, parsed.data);
    logger.info(`管理员 ${user.username} 更新公告: ${announcementId}`);
    res.json({ announcement });
  });

  // 删除公告
  router.delete('/admin/announcements/:id', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user || user.role !== 'admin') {
      throw new AppError('需要管理员权限', 403);
    }

    const announcementId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await announcementManager.deleteAnnouncement(announcementId);
    logger.info(`管理员 ${user.username} 删除公告: ${announcementId}`);
    res.json({ success: true });
  });

  // 发布公告
  router.post('/admin/announcements/:id/publish', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user || user.role !== 'admin') {
      throw new AppError('需要管理员权限', 403);
    }

    const announcementId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const announcement = await announcementManager.publishAnnouncement(announcementId);
    logger.info(`管理员 ${user.username} 发布公告: ${announcementId}`);

    // WebSocket 实时推送新公告
    if (broadcastJson) {
      broadcastJson({
        type: 'announcement:new',
        data: {
          id: announcement.id,
          title: announcement.title,
          type: announcement.type,
          priority: announcement.priority,
          targetRoles: announcement.targetRoles,
        },
      });
    }

    res.json({ announcement });
  });

  // 归档公告
  router.post('/admin/announcements/:id/archive', async (req: Request, res: Response) => {
    const user = (req as any).auth;
    if (!user || user.role !== 'admin') {
      throw new AppError('需要管理员权限', 403);
    }

    const announcementId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const announcement = await announcementManager.archiveAnnouncement(announcementId);
    logger.info(`管理员 ${user.username} 归档公告: ${announcementId}`);
    res.json({ announcement });
  });

  return router;
}
