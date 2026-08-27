import { Router } from 'express';
import type { GuestVisitManager } from '../../guest-visits/guest-visit-manager.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

export function createGuestVisitRoutes(guestVisitManager: GuestVisitManager): Router {
  const router = Router();

  router.get('/summary', async (req, res) => {
    try {
      if (req.auth?.role !== 'admin') {
        res.status(403).json({ error: '仅管理员可查看游客访问概览' });
        return;
      }

      const summary = await guestVisitManager.getSummary();
      res.json({
        ...summary,
        latestVisitAt: summary.latestVisitAt?.toISOString(),
        recentVisitors: summary.recentVisitors.map((item) => ({
          ...item,
          firstSeenAt: item.firstSeenAt.toISOString(),
          lastSeenAt: item.lastSeenAt.toISOString(),
        })),
      });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取游客访问概览失败') });
    }
  });

  return router;
}
