import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { type LoadNovelRouteFn } from './route-support.js';

type NovelTrashRouteDeps = {
  novelManager: NovelManager;
  loadTrashNovel: LoadNovelRouteFn;
};

export function registerNovelTrashRoutes(
  router: Router,
  { novelManager, loadTrashNovel }: NovelTrashRouteDeps,
): void {
  router.get('/trash/list', async (req, res) => {
    try {
      const items = await novelManager.listTrash();
      const filtered = req.auth?.role === 'admin'
        ? items
        : items.filter(item => (item.ownerId ?? 'dev') === (req.auth?.id ?? 'dev'));
      res.json(filtered);
    } catch (err) {
      const message = safeErrorMessage(err, '获取回收站列表失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/trash/:id/restore', async (req, res) => {
    try {
      if (!(await loadTrashNovel(req, res))) return;
      const novel = await novelManager.restoreNovel(req.params.id);
      res.json(novel);
    } catch (err) {
      const message = safeErrorMessage(err, '恢复小说失败');
      if (message.includes('不存在')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.delete('/trash/:id', async (req, res) => {
    try {
      if (!(await loadTrashNovel(req, res))) return;
      await novelManager.permanentDeleteNovel(req.params.id);
      res.json({ success: true });
    } catch (err) {
      const message = safeErrorMessage(err, '永久删除失败');
      if (message.includes('不存在')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
