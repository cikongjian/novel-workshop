import type { Router } from 'express';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import type { GenerateDeps } from './types.js';
import {
  WorldBibleApplyBody,
  WorldBiblePreviewBody,
} from './world-bible-schema.js';
import {
  applyWorldBibleProposals,
  runWorldBiblePreview,
} from './world-bible-support.js';

export function registerWorldBibleRoutes(router: Router, deps: GenerateDeps): void {
  router.post('/world-bible/preview', async (req, res) => {
    try {
      const parsed = WorldBiblePreviewBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const novel = await deps.novelManager.getNovel(parsed.data.novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const activeModelClient = modelAccess.client ?? deps.modelClient;
      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 模型未配置，暂时无法构建世界圣经' });
        return;
      }

      const result = await runWorldBiblePreview({
        deps,
        novelId: parsed.data.novelId,
        maxItems: parsed.data.maxItems,
        activeModelClient,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '世界圣经生成失败');
      const status = message.includes('小说不存在') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post('/world-bible/apply', async (req, res) => {
    try {
      const parsed = WorldBibleApplyBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const result = await applyWorldBibleProposals({
        deps,
        novelId: parsed.data.novelId,
        proposals: parsed.data.entries,
        summary: parsed.data.summary,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '世界圣经应用失败');
      const status = message.includes('小说不存在') ? 404 : 422;
      res.status(status).json({ error: message });
    }
  });
}
