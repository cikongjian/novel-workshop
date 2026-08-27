import type { Router } from 'express';
import { sendAdvancedDeprecated } from './advanced-route-support.js';

export function registerAdvancedDeprecatedRoutes(router: Router): void {
  router.post('/dialogue-check', async (_req, res) => {
    sendAdvancedDeprecated(res, 'GENERATE_DIALOGUE_CHECK_DEPRECATED');
  });

  router.post('/parallel-compare', async (_req, res) => {
    sendAdvancedDeprecated(res, 'GENERATE_PARALLEL_COMPARE_DEPRECATED');
  });
}
