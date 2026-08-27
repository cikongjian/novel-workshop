import type { Router } from 'express';
import type { AnchorRouteDeps } from './route-support.js';
import { startAnchorGeneration } from './route-support.js';

export function registerAnchorGenerationRoutes(router: Router, deps: AnchorRouteDeps): void {
  router.post('/generate/:novelId', async (req, res) => {
    await startAnchorGeneration(req, res, deps);
  });
}
