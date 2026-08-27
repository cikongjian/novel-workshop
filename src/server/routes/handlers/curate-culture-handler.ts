import { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  ApplyCuratedCultureBody,
  CurateCultureBody,
} from './world-schemas.js';
import {
  applyCuratedCultureEntries,
  broadcastCurateCultureError,
  runCurateCultureWorkflow,
} from './curate-culture-support.js';

export function registerCurateCultureRoutes(router: Router, deps: GenerateDeps): void {
  const { modelClient, novelManager, authDb } = deps;

  router.post('/curate-culture-world', async (req, res) => {
    const requestNovelId = (req.body as { novelId?: string }).novelId ?? '';
    try {
      const parsed = CurateCultureBody.safeParse(req.body);
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
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      const activeModelClient = modelAccess.client ?? modelClient;

      const result = await runCurateCultureWorkflow({
        deps,
        novelId,
        novel,
        activeModelClient,
        maxItems,
        apply,
      });
      res.json(result);
    }
    catch (err) {
      const message = safeErrorMessage(err, '文化设定梳理失败');
      broadcastCurateCultureError({
        deps,
        novelId: requestNovelId,
        message,
      });
      const status = message.includes('小说不存在') ? 404 : message.includes('拒绝覆盖') ? 422 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post('/apply-curated-culture-world', async (req, res) => {
    try {
      const parsed = ApplyCuratedCultureBody.safeParse(req.body);
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

      const result = await applyCuratedCultureEntries({
        novelId,
        deps,
        worldEntries,
        entries,
        maxItems,
        summary,
      });
      res.json(result);
    }
    catch (err) {
      const message = safeErrorMessage(err, '应用文化梳理结果失败');
      const status = message.includes('拒绝覆盖') ? 422 : 500;
      res.status(status).json({ error: message });
    }
  });
}
