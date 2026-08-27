/**
 * 管理员 IP 黑名单管理路由
 */

import { Router } from 'express';
import type { IpBlacklistService } from '../middleware/ip-blacklist.js';
import { requireAdmin } from '../middleware/auth.js';

export interface AdminIpBlacklistDeps {
  ipBlacklistService: IpBlacklistService;
}

export function createAdminIpBlacklistRouter(deps: AdminIpBlacklistDeps): Router {
  const router = Router();
  void deps;

  function sendDeprecated(res: import('express').Response, code: string) {
    const messageByCode: Record<string, string> = {
      IP_BLACKLIST_LIST_DEPRECATED: 'HTTP IP 黑名单管理接口已下线，请改用 nw auth ip-blacklist list。',
      IP_BLACKLIST_BLOCK_DEPRECATED: 'HTTP IP 黑名单封禁接口已下线，请改用 nw auth ip-blacklist block --ip <ip> [--minutes <n>]。',
      IP_BLACKLIST_UNBLOCK_DEPRECATED: 'HTTP IP 黑名单解封接口已下线，请改用 nw auth ip-blacklist unblock --ip <ip>。',
    };
    return res.status(410).json({
      error: messageByCode[code] ?? '该 IP 黑名单管理接口已下线。',
      code,
    });
  }

  /** 列出当前封禁的 IP */
  router.get('/', requireAdmin(), async (_req, res) =>
    sendDeprecated(res, 'IP_BLACKLIST_LIST_DEPRECATED'));

  /** 手动封禁 IP */
  router.post('/', requireAdmin(), async (_req, res) =>
    sendDeprecated(res, 'IP_BLACKLIST_BLOCK_DEPRECATED'));

  /** 解封 IP */
  router.delete('/:ip', requireAdmin(), async (_req, res) =>
    sendDeprecated(res, 'IP_BLACKLIST_UNBLOCK_DEPRECATED'));

  return router;
}
