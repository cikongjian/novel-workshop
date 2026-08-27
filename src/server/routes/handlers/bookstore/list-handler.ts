import type { Request, Response } from 'express';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import type { BookStoreStorefrontConfigManager } from '../../../../bookstore/storefront-config-manager.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import { BookStoreListQuerySchema } from '../../../../bookstore/types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { buildBookStoreListResponse } from './list-support.js';

export async function handleBookStoreList(
  req: Request,
  res: Response,
  bookStoreManager: BookStoreManager,
  storefrontConfigManager: BookStoreStorefrontConfigManager | undefined,
  novelManager: NovelManager,
  contentAuditService?: ContentAuditService,
  authDb?: AuthDb,
): Promise<void> {
  try {
    const query = BookStoreListQuerySchema.parse(req.query);
    const appliedSort = query.sort ?? (await storefrontConfigManager?.getConfig())?.defaultSort ?? 'updated';
    const result = await buildBookStoreListResponse(
      bookStoreManager,
      novelManager,
      {
        ...query,
        sort: appliedSort,
      },
      appliedSort,
      contentAuditService,
      authDb,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err, '获取书城列表失败') });
  }
}
