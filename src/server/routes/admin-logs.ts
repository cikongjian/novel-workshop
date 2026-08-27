import type { Router } from 'express';
import type { RequestHandler } from 'express';
import { registerAdminLogFileRoutes } from './handlers/admin-logs/file-routes.js';
import { registerAdminLogInsightRoutes } from './handlers/admin-logs/insight-routes.js';

export async function createAdminLogsRouter(createRequireAdmin: () => RequestHandler): Promise<Router> {
  const { default: express } = await import('express');
  const router = express.Router();

  router.use(createRequireAdmin());
  registerAdminLogFileRoutes(router);
  registerAdminLogInsightRoutes(router);

  return router;
}
