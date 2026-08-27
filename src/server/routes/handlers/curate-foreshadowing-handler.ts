import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { CurateForeshadowingBody, ApplyCuratedForeshadowingBody } from './world-schemas.js';
import {
  applyCuratedForeshadowingEntries,
  broadcastCurateForeshadowingError,
  runCurateForeshadowingWorkflow,
} from './curate-foreshadowing-support.js';

export function registerCurateForeshadowingRoutes(router: Router, deps: GenerateDeps): void {
  const { modelClient, novelManager, authDb } = deps;

  router.post('/curate-foreshadowing', async (req, res) => {
    const requestNovelId = (req.body as { novelId?: string }).novelId ?? '';
    try {
      const parsed = CurateForeshadowingBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { novelId, apply, maxItems } = parsed.data;
      const [novel, outline, chapterMetas] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getOutline(novelId),
        novelManager.listChapters(novelId),
      ]);
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

      const result = await runCurateForeshadowingWorkflow({
        deps,
        novelId,
        novel,
        outline,
        chapterMetas,
        maxItems,
        apply,
        activeModelClient,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '伏笔智能梳理失败');
      broadcastCurateForeshadowingError({
        deps,
        novelId: requestNovelId,
        message,
      });
      const status = message.includes('小说不存在') ? 404 : message.includes('拒绝覆盖') ? 422 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post('/apply-curated-foreshadowing', async (req, res) => {
    try {
      const parsed = ApplyCuratedForeshadowingBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const { novelId, foreshadowing, maxItems, summary } = parsed.data;
      const [novel, outline, chapterMetas] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getOutline(novelId),
        novelManager.listChapters(novelId),
      ]);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const result = await applyCuratedForeshadowingEntries({
        deps,
        novelId,
        outline,
        chapterMetas,
        foreshadowing,
        maxItems,
        summary,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '应用梳理结果失败');
      const status = message.includes('拒绝覆盖') ? 422 : 500;
      res.status(status).json({ error: message });
    }
  });
}
