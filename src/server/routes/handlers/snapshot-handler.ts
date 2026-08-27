import { Router } from 'express';
import type { NovelManager } from '../../../novel/novel-manager.js';

export function createSnapshotRouter(novelManager: NovelManager): Router {
  void novelManager;
  const router = Router({ mergeParams: true });

  const sendDeprecated = (res: import('express').Response): void => {
    res.status(410).json({
      error: '快照与回滚公开接口已弃用，请改用受控的本地维护流程执行快照管理',
      code: 'NOVEL_SNAPSHOT_HTTP_DEPRECATED',
    });
  };

  /**
   * GET /api/novels/:id/snapshots
   * 已弃用：列出小说快照
   */
  router.get('/:id/snapshots', (_req, res) => sendDeprecated(res));

  /**
   * POST /api/novels/:id/snapshots
   * 已弃用：手动创建快照
   */
  router.post('/:id/snapshots', (_req, res) => sendDeprecated(res));

  /**
   * POST /api/novels/:id/rollback/:chapter
   * 已弃用：请求回滚影响评估
   */
  router.post('/:id/rollback/:chapter', (_req, res) => sendDeprecated(res));

  /**
   * POST /api/novels/:id/rollback/:chapter/confirm
   * 已弃用：确认执行回滚
   */
  router.post('/:id/rollback/:chapter/confirm', (_req, res) => sendDeprecated(res));

  return router;
}
