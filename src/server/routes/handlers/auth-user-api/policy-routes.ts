import type { Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import { getConfig } from '../../../../config/index.js';
import {
  canManageUserApi,
  getPlatformCacheUnavailableReason,
  isPlatformCacheAvailable,
} from './route-support.js';
import { getProfile } from '../../../../auth/user-service.js';

export function registerAuthUserApiPolicyRoutes(router: Router, db: AuthDb): void {
  router.get('/user-api/policy', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }

    const profile = await getProfile(db, req.auth.id);
    const config = getConfig().userApi;
    const platformCacheAvailable = isPlatformCacheAvailable();
    res.json({
      enabled: config.enabled,
      allowPlatformCache: config.allowPlatformCache && platformCacheAvailable,
      allowLocalOnly: config.allowLocalOnly,
      canManage: canManageUserApi(profile),
      role: profile?.role ?? 'user',
      creatorStatus: profile?.creatorStatus ?? 'none',
      platformCacheReason: platformCacheAvailable ? '' : getPlatformCacheUnavailableReason(),
    });
  });
}
