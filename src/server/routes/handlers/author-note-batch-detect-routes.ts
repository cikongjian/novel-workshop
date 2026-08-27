import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { detectKeyChapters } from './author-note-batch-support.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

export function registerAuthorNoteBatchDetectRoutes(router: Router, deps: GenerateDeps): void {
  router.post('/batch-author-notes/detect', async (req, res) => {
    try {
      const { novelId, threshold, skipExisting = true } = req.body;
      if (!novelId) {
        res.status(400).json({ error: '缺少 novelId' });
        return;
      }

      const result = await detectKeyChapters(deps, novelId, threshold, skipExisting);
      res.json(result);
    } catch (err: unknown) {
      const message = safeErrorMessage(err, '关键章节检测失败');
      res.status(500).json({ error: message });
    }
  });
}
