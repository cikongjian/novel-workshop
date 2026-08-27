import { Router } from 'express';
import type { AuthDb } from '../../auth/types.js';
import type { BillingService } from '../../billing/billing-service.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../bookstore/content-audit-service.js';
import type { ImageGenerationClient, ModelClient } from '../../models/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { registerNovelCoverGenerationRoutes } from './handlers/novel-cover/generation-routes.js';
import { registerNovelCoverPromptRoutes } from './handlers/novel-cover/prompt-routes.js';

export function createNovelCoverGenerationRouter(
  novelManager: NovelManager,
  modelClient?: ModelClient,
  imageClient?: ImageGenerationClient,
  authDb?: AuthDb,
  bookStoreManager?: BookStoreManager,
  contentAuditService?: ContentAuditService,
  billingService?: BillingService,
) {
  const router = Router({ mergeParams: true });

  registerNovelCoverPromptRoutes(router, {
    authDb,
    modelClient,
    novelManager,
  });
  registerNovelCoverGenerationRoutes(router, {
    authDb,
    billingService,
    bookStoreManager,
    contentAuditService,
    imageClient,
    modelClient,
    novelManager,
  });

  return router;
}
