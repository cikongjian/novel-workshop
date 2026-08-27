import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';

export interface ChapterCollaborationDeps {
  novelManager: NovelManager;
}

export function registerCollaborationRoutes(router: Router, deps: ChapterCollaborationDeps): void {
  void deps;

  // GET /chapters/:num/collaboration-log — 已弃用的历史协作日志查询入口
  router.get('/:num/collaboration-log', (_req, res) => {
    res.status(410).json({
      error: '章节协作日志公开接口已弃用',
      code: 'CHAPTER_COLLABORATION_LOG_DEPRECATED',
    });
  });
}
