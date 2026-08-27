import type { Router } from 'express';
import { ApplyCuratedFactionBody } from './world-schemas.js';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { applyCuratedFactionEntries } from './curate-faction-apply-support.js';

export function registerApplyCuratedFactionWorldRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager } = deps;

  router.post('/apply-curated-faction-world', async (req, res) => {
    try {
      const parsed = ApplyCuratedFactionBody.safeParse(req.body);
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

      const result = await applyCuratedFactionEntries({
        novelId,
        deps,
        worldEntries,
        entries,
        maxItems,
        summary,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '应用势力梳理结果失败');
      const status = message.includes('拒绝覆盖') ? 422 : 500;
      res.status(status).json({ error: message });
    }
  });
}
