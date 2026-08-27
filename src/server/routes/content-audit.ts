import express from 'express';
import type { Request, Response } from 'express';
import { ContentAuditService } from '../../bookstore/content-audit-service.js';
import { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { AuditQueueManager } from '../../bookstore/audit-queue.js';
import { PaginationQuerySchema } from '../../bookstore/types.js';
import { requireAdmin } from '../middleware/auth.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';
import type { NovelManager } from '../../novel/novel-manager.js';

function sendDeprecated(res: Response, code: string) {
  return res.status(410).json({
    error: '该内容审核接口已下线，请改用当前审核工作台能力。',
    code,
  });
}

export function createContentAuditRoutes(
  auditService: ContentAuditService,
  bookStoreManager: BookStoreManager,
  _novelManager: NovelManager,
  _auditQueueManager?: AuditQueueManager,
) {
  const router = express.Router();

  router.use('/admin', requireAdmin());

  router.get('/status/:novelId', (_req: Request, res: Response) => sendDeprecated(res, 'CONTENT_AUDIT_STATUS_DEPRECATED'));

  router.get('/admin/pending', async (req: Request, res: Response) => {
    try {
      const query = PaginationQuerySchema.parse(req.query);
      const audits = await auditService.getPendingManualAudits();

      const total = audits.length;
      const totalPages = Math.ceil(total / query.pageSize);
      const start = (query.page - 1) * query.pageSize;
      const items = audits.slice(start, start + query.pageSize);

      res.json({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages,
      });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取待审核列表失败') });
    }
  });

  router.post('/admin/:id/approve', async (req: Request, res: Response) => {
    try {
      const auditId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const auditorId = req.auth!.id;

      const novelId = await auditService.getNovelIdByAuditId(auditId);
      await auditService.manualAudit(auditId, auditorId, 'pass');

      if (novelId) {
        const book = await bookStoreManager.getBookByNovelId(novelId);
        if (book) {
          await bookStoreManager.updateAuditStatus(book.id, 'pass');
        }
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '审核通过操作失败') });
    }
  });

  router.post('/admin/:id/reject', async (req: Request, res: Response) => {
    try {
      const auditId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { reason } = req.body;
      const auditorId = req.auth!.id;

      if (!reason) {
        return res.status(400).json({ error: '请提供拒绝原因' });
      }

      const novelId = await auditService.getNovelIdByAuditId(auditId);
      await auditService.manualAudit(auditId, auditorId, 'reject');

      if (novelId) {
        const book = await bookStoreManager.getBookByNovelId(novelId);
        if (book) {
          await bookStoreManager.updateAuditStatus(book.id, 'reject');
        }
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '审核拒绝操作失败') });
    }
  });

  router.get('/admin/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await auditService.getAuditStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取审核统计失败') });
    }
  });

  router.get('/admin/cover-pending', async (_req: Request, res: Response) => {
    try {
      const books = await bookStoreManager.getCoverPendingBooks();
      res.json(books);
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取封面待审列表失败') });
    }
  });

  router.get('/admin/cover-pending-page', async (req: Request, res: Response) => {
    try {
      const query = PaginationQuerySchema.parse(req.query);
      const result = await bookStoreManager.getCoverPendingBooksPage(query);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '鑾峰彇灏侀潰寰呭鍒楄〃澶辫触') });
    }
  });

  router.get('/admin/queue', (_req: Request, res: Response) =>
    sendDeprecated(res, 'CONTENT_AUDIT_QUEUE_DEPRECATED'));

  router.post('/admin/queue/retry', (_req: Request, res: Response) =>
    sendDeprecated(res, 'CONTENT_AUDIT_QUEUE_RETRY_DEPRECATED'));

  return router;
}
