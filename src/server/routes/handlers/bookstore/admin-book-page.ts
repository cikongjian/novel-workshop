import { z } from 'zod';
import type { Request, Response } from 'express';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import { PaginationQuerySchema } from '../../../../bookstore/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { requireBookstoreAuth } from './route-support.js';
import { enrichBookStoreItems } from './list-support.js';

const AdminBookPageQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['draft', 'pending', 'approved', 'rejected', 'offline']).optional(),
  keyword: z.string().trim().max(100).optional(),
});

export async function handleAdminBookPage(
  req: Request,
  res: Response,
  bookStoreManager: BookStoreManager,
  novelManager: NovelManager,
  contentAuditService?: ContentAuditService,
  authDb?: AuthDb,
): Promise<void> {
  try {
    const auth = requireBookstoreAuth(req);
    if (auth.role !== 'admin') {
      res.status(403).json({ error: '仅管理员可访问' });
      return;
    }

    const query = AdminBookPageQuerySchema.parse(req.query);
    const result = await bookStoreManager.adminListBooksPage(query);
    const items = await enrichBookStoreItems(
      result.items,
      bookStoreManager,
      novelManager,
      contentAuditService,
      authDb,
    );
    res.json({ ...result, items });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err, '获取书城列表失败') });
  }
}
