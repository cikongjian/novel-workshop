import type { Router } from 'express';
import type { AnchorRouteDeps } from './route-support.js';
import { ensureNovelAccess, log } from './route-support.js';

export function registerAnchorLinkRoutes(router: Router, deps: AnchorRouteDeps): void {
  router.get('/links/:novelId', async (req, res) => {
    try {
      if (!(await ensureNovelAccess(req, res, deps.novelManager, req.params.novelId as string))) {
        return;
      }
      const links = await deps.anchorManager.getAnchorLinks(req.params.novelId as string);
      res.json(links);
    } catch (err) {
      log.error('获取锚点关联失败', { error: err });
      res.status(500).json({ error: '获取锚点关联失败' });
    }
  });

  router.post('/links/:novelId', async (req, res) => {
    try {
      if (!(await ensureNovelAccess(req, res, deps.novelManager, req.params.novelId as string))) {
        return;
      }
      const { anchorId, timeRelation, priority } = req.body;
      if (!anchorId || !timeRelation) {
        res.status(400).json({ error: '缺少 anchorId 或 timeRelation' });
        return;
      }
      const anchor = await deps.anchorManager.getAnchor(anchorId);
      if (!anchor) {
        res.status(404).json({ error: '锚点不存在' });
        return;
      }
      if (!(await ensureNovelAccess(req, res, deps.novelManager, anchor.sourceNovelId))) {
        return;
      }

      const links = await deps.anchorManager.linkAnchor(req.params.novelId as string, {
        anchorId,
        anchorNovelTitle: anchor.sourceNovelTitle,
        timeRelation,
        priority: priority ?? 1,
      });
      res.json(links);
    } catch (err) {
      log.error('添加锚点关联失败', { error: err });
      res.status(500).json({ error: '添加锚点关联失败' });
    }
  });

  router.delete('/links/:novelId/:anchorId', async (req, res) => {
    try {
      if (!(await ensureNovelAccess(req, res, deps.novelManager, req.params.novelId as string))) {
        return;
      }
      const links = await deps.anchorManager.unlinkAnchor(req.params.novelId as string, req.params.anchorId as string);
      res.json(links);
    } catch (err) {
      log.error('解除锚点关联失败', { error: err });
      res.status(500).json({ error: '解除锚点关联失败' });
    }
  });

  router.put('/links/:novelId/:anchorId', async (req, res) => {
    try {
      if (!(await ensureNovelAccess(req, res, deps.novelManager, req.params.novelId as string))) {
        return;
      }
      const { timeRelation, priority } = req.body;
      const links = await deps.anchorManager.updateAnchorLink(
        req.params.novelId as string,
        req.params.anchorId as string,
        { timeRelation, priority },
      );
      res.json(links);
    } catch (err) {
      log.error('更新锚点关联失败', { error: err });
      res.status(500).json({ error: '更新锚点关联失败' });
    }
  });
}
