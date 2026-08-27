import type { Router } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import {
  normalizeApiKeys,
  requireManagePermission,
  testImageGenerationConnection,
  testUserApiConnection,
  TestUserApiDraftSchema,
  TestUserApiProfileSchema,
  userApiService,
  validateStorageMode,
} from './route-support.js';

export function registerAuthUserApiTestRoutes(router: Router, db: AuthDb): void {
  router.post('/user-api/test-draft', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const parsed = TestUserApiDraftSchema.safeParse(req.body);
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

    const apiKeys = normalizeApiKeys(parsed.data.apiKeys, parsed.data.apiKey);
    if (apiKeys.length === 0) {
      res.status(400).json({ success: false, error: '请先填写至少一个 API Key' });
      return;
    }

    const result = parsed.data.scope === 'image-generation'
      ? await testImageGenerationConnection({
          provider: parsed.data.provider,
          model: parsed.data.model,
          baseUrl: parsed.data.baseUrl,
          apiKeys,
        })
      : await testUserApiConnection({
          provider: parsed.data.provider,
          model: parsed.data.model,
          baseUrl: parsed.data.baseUrl,
          apiKeys,
        });
    res.status(200).json(result);
  });

  router.post('/user-api/profiles/:profileId/test', async (req, res) => {
    if (!req.auth?.id) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    const permission = await requireManagePermission(db, req.auth.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.reason });
      return;
    }
    const parsed = TestUserApiProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数无效' });
      return;
    }

    const profile = await userApiService.getUserApiProfileWithSecret(db, req.auth.id, String(req.params.profileId));
    if (!profile) {
      res.status(404).json({ error: '用户 API 配置不存在' });
      return;
    }

    const apiKeys = profile.storageMode === 'local'
      ? normalizeApiKeys(parsed.data.apiKeys, parsed.data.apiKey)
      : profile.apiKeys;
    if (apiKeys.length === 0) {
      res.status(400).json({ success: false, error: '当前配置缺少 API Key' });
      return;
    }

    const result = profile.scope === 'image-generation'
      ? await testImageGenerationConnection({
          provider: profile.provider,
          model: profile.model,
          baseUrl: profile.baseUrl,
          apiKeys,
        })
      : await testUserApiConnection({
          provider: profile.provider,
          model: profile.model,
          baseUrl: profile.baseUrl,
          apiKeys,
        });
    res.status(200).json(result);
  });
}
