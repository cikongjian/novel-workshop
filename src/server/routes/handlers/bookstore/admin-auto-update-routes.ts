import type { Request, Response, Router } from 'express';
import { BookAutoUpdateConfigRequestSchema } from '../../../../bookstore/types.js';
import type { BookstoreAutoUpdateService } from '../../../../bookstore/auto-update-service.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { getRouteParam, requireBookstoreAuth } from './route-support.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';

type BookstoreAdminAutoUpdateRouteDeps = {
  bookStoreManager: BookStoreManager;
  autoUpdateService: BookstoreAutoUpdateService;
};

function ensureAdmin(req: Request, res: Response): boolean {
  const auth = requireBookstoreAuth(req);
  if (auth.role !== 'admin') {
    res.status(403).json({ error: '仅管理员可操作自动更新' });
    return false;
  }
  return true;
}

export function registerBookstoreAdminAutoUpdateRoutes(
  router: Router,
  {
    bookStoreManager,
    autoUpdateService,
  }: BookstoreAdminAutoUpdateRouteDeps,
): void {
  router.get('/admin/books/:id/auto-update', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const bookId = getRouteParam(req, 'id');
      const book = await bookStoreManager.getBook(bookId);
      if (!book) {
        return res.status(404).json({ error: '作品不存在' });
      }

      const autoUpdate = await autoUpdateService.getBookAutoUpdate(bookId);
      res.json({
        bookId: book.id,
        novelId: book.novelId,
        title: book.title,
        publishStatus: book.publishStatus,
        autoUpdate,
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取自动更新配置失败') });
    }
  });

  router.put('/admin/books/:id/auto-update', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const bookId = getRouteParam(req, 'id');
      const book = await bookStoreManager.getBook(bookId);
      if (!book) {
        return res.status(404).json({ error: '作品不存在' });
      }

      const payload = BookAutoUpdateConfigRequestSchema.parse(req.body);
      const autoUpdate = await autoUpdateService.updateBookAutoUpdate(bookId, payload, req.auth!.id);
      res.json({
        bookId: book.id,
        novelId: book.novelId,
        title: book.title,
        publishStatus: book.publishStatus,
        autoUpdate,
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '更新自动更新配置失败') });
    }
  });

  router.post('/admin/books/:id/auto-update/run-now', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const bookId = getRouteParam(req, 'id');
      const book = await bookStoreManager.getBook(bookId);
      if (!book) {
        return res.status(404).json({ error: '作品不存在' });
      }
      if (book.publishStatus !== 'approved') {
        return res.status(400).json({ error: '只有已上架作品才能立即执行自动更新' });
      }

      const job = await autoUpdateService.runNow(bookId, req.auth!.id);
      res.json({
        bookId: book.id,
        novelId: book.novelId,
        title: book.title,
        publishStatus: book.publishStatus,
        job: {
          id: job.id,
          chapterNumber: job.chapterNumber,
          status: job.status,
          scheduledAt: job.scheduledAt.toISOString(),
        },
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '执行自动更新失败') });
    }
  });
}
