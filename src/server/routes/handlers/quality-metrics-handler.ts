/**
 * 质量度量 API handler
 *
 * 提供小说质量报告的 REST API 端点。
 */

import { Router } from 'express';
import type { NovelManager } from '../../../novel/novel-manager.js';

export function createQualityMetricsRouter(_novelManager: NovelManager): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET /api/novels/:id/quality-report
   * 返回小说的完整质量报告（度量 + 趋势）
   */
  router.get('/:id/quality-report', async (req, res) => {
    void req;
    res.status(410).json({
      error: 'This quality report endpoint has been deprecated.',
      code: 'QUALITY_REPORT_DEPRECATED',
    });
  });

  return router;
}
