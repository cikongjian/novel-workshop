import type { Router } from 'express';
import { checkNovelAccess } from '../../../middleware/novel-access.js';
import type { AnchorRouteDeps } from './route-support.js';
import { loadAccessibleAnchor, log, sendDeprecated } from './route-support.js';

export function registerAnchorCrudRoutes(router: Router, deps: AnchorRouteDeps): void {
  router.get('/', async (req, res) => {
    try {
      const anchors = await deps.anchorManager.listAnchors();
      const visibleAnchors = [];
      for (const anchor of anchors) {
        const access = await checkNovelAccess(req, deps.novelManager, anchor.sourceNovelId);
        if (access.allowed) {
          visibleAnchors.push(anchor);
        }
      }
      res.json(visibleAnchors);
    } catch (err) {
      log.error('列出锚点失败', { error: err });
      res.status(500).json({ error: '列出锚点失败' });
    }
  });

  router.get('/:anchorId', (_req, res) => sendDeprecated(res, 'ANCHOR_GET_ONE_DEPRECATED'));

  router.delete('/:anchorId', async (req, res) => {
    try {
      const anchor = await loadAccessibleAnchor(req, res, deps, req.params.anchorId as string);
      if (!anchor) return;
      const ok = await deps.anchorManager.deleteAnchor(req.params.anchorId as string);
      if (!ok) {
        res.status(404).json({ error: '锚点不存在' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      log.error('删除锚点失败', { error: err });
      res.status(500).json({ error: '删除锚点失败' });
    }
  });
}
