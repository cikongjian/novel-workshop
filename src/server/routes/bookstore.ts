import express from 'express';
import { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../bookstore/content-audit-service.js';
import type { AuditQueueManager } from '../../bookstore/audit-queue.js';
import { NovelManager } from '../../novel/novel-manager.js';
import type { AuthDb } from '../../auth/types.js';
import type { ComplianceEventManager } from '../../compliance/compliance-event-manager.js';
import { registerBookstoreChapterAccessRoutes } from './handlers/bookstore/chapter-access-routes.js';
import { registerBookstoreChapterRoutes } from './handlers/bookstore/chapter-routes.js';
import { registerBookstoreCatalogRoutes } from './handlers/bookstore/catalog-routes.js';
import { registerBookstoreEngagementRoutes } from './handlers/bookstore/engagement-routes.js';
import { registerBookstoreLifecycleRoutes } from './handlers/bookstore/lifecycle-routes.js';
import { registerBookstoreAdminAutoUpdateRoutes } from './handlers/bookstore/admin-auto-update-routes.js';
import type { BookstoreAutoUpdateService } from '../../bookstore/auto-update-service.js';
import type { BookStoreStorefrontConfigManager } from '../../bookstore/storefront-config-manager.js';
import type { ForkService } from '../../services/fork-service.js';
import { registerBookstoreAdminStorefrontConfigRoutes } from './handlers/bookstore/admin-storefront-config-routes.js';

/** 阅读量防刷：同一 IP + 书籍 1 小时内只计 1 次 */
const VIEW_COOLDOWN_MS = 60 * 60 * 1000;
const VIEW_CLEANUP_INTERVAL_MS = 2 * 60 * 60 * 1000;
const viewCooldownMap = new Map<string, number>();

// 定期清理过期条目，防止内存无限增长
const viewCooldownCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of viewCooldownMap) {
    if (now - ts >= VIEW_COOLDOWN_MS) viewCooldownMap.delete(key);
  }
}, VIEW_CLEANUP_INTERVAL_MS);
viewCooldownCleanupTimer.unref();

function shouldIncrementView(ip: string, bookId: string): boolean {
  const key = `${ip}:${bookId}`;
  const last = viewCooldownMap.get(key);
  const now = Date.now();
  if (last !== undefined && now - last < VIEW_COOLDOWN_MS) return false;
  viewCooldownMap.set(key, now);
  return true;
}

export function createBookStoreRoutes(
  bookStoreManager: BookStoreManager,
  auditQueueManager: AuditQueueManager,
  novelManager: NovelManager,
  contentAuditService?: ContentAuditService,
  authDb?: AuthDb,
  autoUpdateService?: BookstoreAutoUpdateService,
  storefrontConfigManager?: BookStoreStorefrontConfigManager,
  complianceEventManager?: ComplianceEventManager,
  forkService?: ForkService,
) {
  const router = express.Router();

  registerBookstoreCatalogRoutes(router, {
    bookStoreManager,
    storefrontConfigManager,
    novelManager,
    contentAuditService,
    authDb,
    shouldIncrementView,
  });

  registerBookstoreLifecycleRoutes(router, {
    bookStoreManager,
    auditQueueManager,
    novelManager,
    contentAuditService,
    authDb,
    complianceEventManager,
    forkService,
  });

  registerBookstoreEngagementRoutes(router, {
    bookStoreManager,
    contentAuditService,
    authDb,
    complianceEventManager,
  });

  registerBookstoreChapterAccessRoutes(router, {
    bookStoreManager,
    novelManager,
    contentAuditService,
  });

  registerBookstoreChapterRoutes(router, {
    bookStoreManager,
    auditQueueManager,
    novelManager,
    authDb,
    complianceEventManager,
  });

  if (autoUpdateService) {
    registerBookstoreAdminAutoUpdateRoutes(router, {
      bookStoreManager,
      autoUpdateService,
    });
  }

  if (storefrontConfigManager) {
    registerBookstoreAdminStorefrontConfigRoutes(router, {
      storefrontConfigManager,
    });
  }

  return router;
}
