import { Router } from 'express';
import { collectSystemResourcesSnapshot } from '../../services/system-resources.js';

export function createSystemResourcesRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: '需要管理员权限' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json(await collectSystemResourcesSnapshot());
  });

  return router;
}
