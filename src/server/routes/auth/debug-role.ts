/**
 * 调试：查看当前用户的角色（仅开发环境）
 */

import type { Router } from 'express';

export function registerDebugRoleRoutes(router: Router): void {
  if (process.env.NODE_ENV === 'production') return;

  // GET /api/auth/debug/role - 查看当前用户的角色信息
  router.get('/debug/role', (req, res) => {
    res.json({
      auth: req.auth,
      hasAuth: !!req.auth,
      role: req.auth?.role,
      username: req.auth?.username,
      userId: req.auth?.id,
    });
  });
}
