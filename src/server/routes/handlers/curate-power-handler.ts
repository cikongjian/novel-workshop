import { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  ApplyCuratedPowerBody,
  CuratePowerBody,
} from './world-schemas.js';
import {
  applyCuratedPowerEntries,
  broadcastCuratePowerError,
  runCuratePowerWorkflow,
} from './curate-power-support.js';

export function registerCuratePowerRoutes(router: Router, deps: GenerateDeps): void {
  const { modelClient, novelManager } = deps;

  router.post('/curate-power-world', async (req, res) => {
    const requestNovelId = (req.body as { novelId?: string }).novelId ?? '';
    try {
      const parsed = CuratePowerBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { novelId, apply, maxItems } = parsed.data;
      const novel = await novelManager.getNovel(novelId);
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
      const activeModelClient = modelAccess.client ?? modelClient;
      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 模型未配置，无法梳理力量体系' });
        return;
      }

      const result = await runCuratePowerWorkflow({
        deps,
        novelId,
        maxItems,
        apply,
        activeModelClient,
      });
      res.json(result);
    }
    catch (err) {
      const message = safeErrorMessage(err, '力量体系协同梳理失败');
      broadcastCuratePowerError({
        deps,
        novelId: requestNovelId,
        message,
      });
      const status = message.includes('小说不存在') ? 404 : message.includes('拒绝覆盖') ? 422 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post('/apply-curated-power-world', async (req, res) => {
    try {
      const parsed = ApplyCuratedPowerBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { novelId, entries, maxItems, summary } = parsed.data;
      const [novel, worldEntries] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getWorldEntries(novelId),
      ]);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const result = await applyCuratedPowerEntries({
        novelId,
        novelManager,
        novelMemory: deps.novelMemory,
        worldEntries,
        entries,
        maxItems,
        summary,
      });
      res.json(result);
    }
    catch (err) {
      const message = safeErrorMessage(err, '应用力量梳理结果失败');
      const status = message.includes('拒绝覆盖') ? 422 : 500;
      res.status(status).json({ error: message });
    }
  });
}
