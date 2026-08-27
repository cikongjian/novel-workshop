import type { Router } from 'express';
import { getNovelsDir } from '../../../config/index.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { inspectNovelMemory, listNovelIds, resolveNovelsContentRoot } from './memory-health.js';
import {
  MemoryHealthBody,
  isSelectedScopeMissingNovelIds,
  resolveSelectedNovelIds,
} from './memory-support.js';

export function registerMemoryHealthRoutes(router: Router): void {
  router.post('/memory-health', async (req, res) => {
    const parsed = MemoryHealthBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    const { scope, novelIds } = parsed.data;
    const selectedNovelIds = resolveSelectedNovelIds(scope, novelIds);
    if (isSelectedScopeMissingNovelIds(scope, selectedNovelIds)) {
      res.status(400).json({ error: 'novelIds is required when scope is selected' });
      return;
    }

    try {
      const memoryBaseDir = getNovelsDir();
      const contentRoot = resolveNovelsContentRoot(memoryBaseDir);
      const targetNovelIds = listNovelIds(contentRoot, selectedNovelIds);
      const items = await Promise.all(
        targetNovelIds.map(novelId => inspectNovelMemory(novelId, memoryBaseDir)),
      );
      const statusSummary = {
        vectorReady: items.filter(item => item.status === 'vector_ready').length,
        vectorIncomplete: items.filter(item => item.status === 'vector_incomplete').length,
        ftsOnly: items.filter(item => item.status === 'fts_only').length,
        empty: items.filter(item => item.status === 'empty').length,
        missingDb: items.filter(item => item.status === 'missing_db').length,
        error: items.filter(item => item.status === 'error').length,
      };

      res.json({
        ok: statusSummary.error === 0 && statusSummary.missingDb === 0,
        scope,
        totalNovels: targetNovelIds.length,
        runtime: { enabled: true, engine: 'lancedb' },
        summary: statusSummary,
        items,
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to inspect memory health',
        detail: safeErrorMessage(err, '检查记忆健康状态失败'),
      });
    }
  });
}
