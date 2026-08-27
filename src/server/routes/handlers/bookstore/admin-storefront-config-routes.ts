import type { Request, Response, Router } from 'express';
import {
  UpdateBookStoreStorefrontConfigRequestSchema,
} from '../../../../bookstore/storefront-types.js';
import type { BookStoreStorefrontConfigManager } from '../../../../bookstore/storefront-config-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { requireBookstoreAuth } from './route-support.js';

type BookstoreAdminStorefrontConfigRouteDeps = {
  storefrontConfigManager: BookStoreStorefrontConfigManager;
};

function ensureAdmin(req: Request, res: Response): boolean {
  const auth = requireBookstoreAuth(req);
  if (auth.role !== 'admin') {
    res.status(403).json({ error: '仅管理员可调整书城默认展示' });
    return false;
  }
  return true;
}

export function registerBookstoreAdminStorefrontConfigRoutes(
  router: Router,
  { storefrontConfigManager }: BookstoreAdminStorefrontConfigRouteDeps,
): void {
  router.get('/admin/storefront-config', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;
      res.json(await storefrontConfigManager.getConfig());
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取书城配置失败') });
    }
  });

  router.put('/admin/storefront-config', async (req: Request, res: Response) => {
    try {
      if (!ensureAdmin(req, res)) return;

      const payload = UpdateBookStoreStorefrontConfigRequestSchema.parse(req.body);
      const config = await storefrontConfigManager.updateConfig(payload, req.auth!.id);
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '更新书城配置失败') });
    }
  });
}
