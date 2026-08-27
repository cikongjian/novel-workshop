import type { Router } from 'express';
import type { ShuangwenDeps } from './types.js';

export function registerCreateRoutes(router: Router, deps: ShuangwenDeps): void {
  void deps;
  // /create：已废弃，保留显式响应避免继续暴露重型同步入口
  router.post('/create', async (req, res) => {
    void req;
    res.status(410).json({
      error: '同步爽文创建入口已废弃，请改用 /api/shuangwen/create-async；已有小说请使用 /api/shuangwen/apply',
    });
  });
}
