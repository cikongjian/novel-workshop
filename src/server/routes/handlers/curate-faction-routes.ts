import type { Router } from 'express';
import { CurateFactionBody } from './world-schemas.js';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  runFactionCuration,
} from './curate-faction-support.js';
import { broadcastCurateFactionError } from './curate-faction-stage-support.js';
import { replaceFactionEntries } from './curate-faction-apply-support.js';

export function registerCurateFactionWorldRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, modelClient, broadcast } = deps;
  const novelMemory = deps.novelMemory;

  router.post('/curate-faction-world', async (req, res) => {
    const timestamp = new Date().toISOString();
    try {
      const parsed = CurateFactionBody.safeParse(req.body);
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
        res.status(503).json({ error: 'AI 模型未配置，无法梳理势力体系' });
        return;
      }

      const result = await runFactionCuration({
        deps,
        novelId,
        novel,
        activeModelClient,
        maxItems,
        timestamp,
      });

      if (result.sanitizedEntries.length === 0) {
        if (apply) {
          res.status(422).json({ error: '势力体系梳理结果为空，已拒绝覆盖原数据' });
          return;
        }
        res.json({
          applied: false,
          summary: '梳理器未产出可用结果，已回退为当前势力条目预览。',
          beforeCount: result.factionEntries.length,
          afterCount: result.factionEntries.length,
          entries: result.factionEntries,
          degraded: true,
          stageReports: result.stageReports,
        });
        return;
      }

      if (apply) {
        await replaceFactionEntries({
          novelId,
          novelManager,
          nextFactionEntries: result.sanitizedEntries,
          existingWorldEntries: result.worldEntries,
        });
        if (novelMemory) {
          await Promise.all(result.sanitizedEntries.map(item =>
            novelMemory.indexWorldEntry(novelId, item).catch(() => {}),
          ));
        }
      }

      res.json({
        applied: apply,
        summary: result.finalSummary,
        beforeCount: result.factionEntries.length,
        afterCount: result.sanitizedEntries.length,
        entries: result.sanitizedEntries,
        stageReports: result.stageReports,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '势力体系协同梳理失败');
      broadcastCurateFactionError({
        deps,
        novelId: (req.body as { novelId?: string }).novelId ?? '',
        message,
      });
      res.status(500).json({ error: message });
    }
  });
}
