import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { NovelMetadata } from '../../../../novel/types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { type LoadNovelRouteFn } from './route-support.js';
import { shouldUseNovelBindingView, shouldUseNovelSummaryView } from './read-support.js';

type AttachNovelOwnerNames = <T extends { ownerId?: string }>(
  novels: T[],
  authDb?: AuthDb,
) => Promise<Array<T & { ownerName?: string }>>;

type NovelReadRouteDeps = {
  novelManager: NovelManager;
  authDb?: AuthDb;
  attachNovelOwnerNames: AttachNovelOwnerNames;
  loadAccessibleNovel: LoadNovelRouteFn;
};

export function registerNovelReadRoutes(
  router: Router,
  { novelManager, authDb, attachNovelOwnerNames, loadAccessibleNovel }: NovelReadRouteDeps,
): void {
  router.get('/', async (req, res) => {
    try {
      const novels = shouldUseNovelBindingView(req.query.view)
        ? await novelManager.listNovelBindingSummaries()
        : shouldUseNovelSummaryView(req.query.view)
          ? await novelManager.listNovelSummaries()
          : await novelManager.listNovels();
      const userId = req.auth?.id ?? 'dev';
      const filtered = novels.filter(
        novel => (novel.ownerId ?? 'dev') === userId || req.auth?.role === 'admin',
      );
      res.json(await attachNovelOwnerNames(filtered, authDb));
    } catch (err) {
      const message = safeErrorMessage(err, '获取小说列表失败');
      res.status(500).json({ error: message });
    }
  });

  router.get('/:id/marketing-packages', async (req, res) => {
    try {
      const novel = await loadAccessibleNovel(req, res);
      if (!novel) return;
      res.json(novel.marketingPackages || []);
    } catch (err) {
      const message = safeErrorMessage(err, '获取营销包装历史失败');
      if (message.includes('不存在')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.get('/:id/character-events', async (req, res) => {
    try {
      const novelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const characterId = req.query.characterId as string | undefined;
      const events = await novelManager.getCharacterEvents(novel.id, characterId);
      res.json(events);
    } catch (err) {
      const message = safeErrorMessage(err, '获取角色事件失败');
      res.status(500).json({ error: message });
    }
  });

  router.get('/:id/subplot-board', async (req, res) => {
    const novel = await loadAccessibleNovel(req, res);
    if (!novel) return;
    res.status(410).json({
      error: '支线进度板公开接口已弃用',
      code: 'SUBPLOT_BOARD_DEPRECATED',
    });
  });
}
