import type { Router } from 'express';
import { auditNovelData } from '../../../../novel/novel-data-audit.js';
import type { AdminNovelDebugDeps } from '../../admin-novel-debug.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  firstZodMessage,
  NovelDebugListQuery,
  NovelDebugParams,
} from './route-support.js';

export function registerAdminNovelDebugReadRoutes(
  router: Router,
  { novelManager, novelMemory, backupManager }: AdminNovelDebugDeps,
): void {
  router.get('/capabilities', (_req, res) => {
    const backupAvailable = Boolean(backupManager);
    res.json({
      protocol: {
        name: 'novel-data-maintenance',
        version: 2,
      },
      serverTime: new Date().toISOString(),
      features: {
        audit: true,
        organizationPreview: true,
        organizationApply: backupAvailable,
        planTokens: true,
        backups: backupAvailable,
        rollback: backupAvailable,
        chapterIntegrity: true,
        chapterRepair: backupAvailable,
        memoryCoverage: Boolean(novelMemory),
        memoryReindex: Boolean(novelMemory),
        coverPromptDiagnostics: true,
      },
      limits: {
        listPageSize: 100,
        organizationScopes: 6,
      },
    });
  });

  router.get('/novels', async (req, res) => {
    const parsed = NovelDebugListQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: firstZodMessage(parsed.error) });
      return;
    }

    try {
      const { search, ownerId, limit, offset } = parsed.data;
      const normalizedSearch = search?.toLocaleLowerCase();
      const all = (await novelManager.listNovels())
        .filter(novel => !ownerId || (novel.ownerId ?? 'dev') === ownerId)
        .filter(novel => !normalizedSearch
          || novel.id.toLocaleLowerCase().includes(normalizedSearch)
          || novel.title.toLocaleLowerCase().includes(normalizedSearch))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      const novels = all.slice(offset, offset + limit).map(novel => ({
        id: novel.id,
        title: novel.title,
        ownerId: novel.ownerId ?? 'dev',
        status: novel.status,
        genre: novel.genre,
        chapterCount: novel.chapterCount,
        finalizedChapterCount: novel.finalizedChapterCount,
        wordCount: novel.wordCount,
        updatedAt: novel.updatedAt,
      }));

      res.json({ novels, total: all.length, limit, offset });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '读取小说维护清单失败') });
    }
  });

  router.get('/novels/:novelId/audit', async (req, res) => {
    const parsed = NovelDebugParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: firstZodMessage(parsed.error) });
      return;
    }
    try {
      res.json(await auditNovelData(novelManager, parsed.data.novelId));
    } catch (error) {
      const message = safeErrorMessage(error, '审计小说数据失败');
      res.status(message.includes('不存在') ? 404 : 500).json({ error: message });
    }
  });
}
