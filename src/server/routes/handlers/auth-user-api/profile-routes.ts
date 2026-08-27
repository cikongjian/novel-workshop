import type { Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import {
  requireManagePermission,
  UpsertUserApiProfileSchema,
  userApiService,
  validateStorageMode,
} from './route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export function registerAuthUserApiProfileRoutes(router: Router, db: AuthDb): void {
  router.get('/user-api/profiles', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const items = await userApiService.listUserApiProfiles(db, req.auth.id);
    res.json(items);
  });

  router.post('/user-api/profiles', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const parsed = UpsertUserApiProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数无效' });
      return;
    }

    const permission = await requireManagePermission(db, req.auth.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.reason });
      return;
    }
    const storageValidation = validateStorageMode(parsed.data.storageMode);
    if (!storageValidation.ok) {
      res.status(storageValidation.status).json({ error: storageValidation.error });
      return;
    }

    try {
      const created = await userApiService.createUserApiProfile(db, req.auth.id, parsed.data);
      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ error: safeErrorMessage(error, '创建失败') });
    }
  });

  router.put('/user-api/profiles/:profileId', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const parsed = UpsertUserApiProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数无效' });
      return;
    }

    const permission = await requireManagePermission(db, req.auth.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.reason });
      return;
    }
    const storageValidation = validateStorageMode(parsed.data.storageMode);
    if (!storageValidation.ok) {
      res.status(storageValidation.status).json({ error: storageValidation.error });
      return;
    }

    try {
      const updated = await userApiService.updateUserApiProfile(db, req.auth.id, String(req.params.profileId), parsed.data);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: safeErrorMessage(error, '更新失败') });
    }
  });

  router.delete('/user-api/profiles/:profileId', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const permission = await requireManagePermission(db, req.auth.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.reason });
      return;
    }
    const deleted = await userApiService.deleteUserApiProfile(db, req.auth.id, String(req.params.profileId));
    res.json({ ok: deleted });
  });

  router.get('/user-api/profiles/:profileId/secrets', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const permission = await requireManagePermission(db, req.auth.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.reason });
      return;
    }
    const profile = await userApiService.getUserApiProfileWithSecret(db, req.auth.id, String(req.params.profileId));
    if (!profile) {
      res.status(404).json({ error: '用户 API 配置不存在' });
      return;
    }
    res.json({
      apiKeys: profile.storageMode === 'server' ? profile.apiKeys : [],
    });
  });
}
