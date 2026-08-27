import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2/promise';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { StoryStateManager } from '../../novel/story-state-manager.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { AuthDb } from '../../auth/types.js';
import { exportNovel } from '../../novel/exporter.js';
import {
  encryptNovelApiKey,
  decryptNovelApiKey,
  maskApiKeyForDisplay,
  isApiKeyMasked,
} from './helpers/novel-api-key-crypto.js';
import { NOVEL_CONSTITUTION_TAG_IDS } from '../../config/novel-constitution-tags.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';
import type { ModelClient } from '../../models/types.js';
import type { NovelMetadata } from '../../novel/types.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { UniverseManager } from '../../novel/universe-manager.js';
import { resolveUserModelAccess } from './helpers/user-api-model-resolver.js';
import { registerNovelTrashRoutes } from './handlers/novels/trash-routes.js';
import { registerNovelCoverRoutes } from './handlers/novels/cover-routes.js';
import { registerNovelConstitutionRoutes } from './handlers/novels/constitution-routes.js';
import { registerNovelReadRoutes } from './handlers/novels/read-routes.js';
import { registerNovelLifecycleRoutes } from './handlers/novels/lifecycle-routes.js';
import { registerNovelExportForkRoutes } from './handlers/novels/export-fork-routes.js';
import { canAccessNovel } from '../middleware/novel-ownership.js';

interface NovelOwnerRow extends RowDataPacket {
  id: string;
  username: string;
  pen_name: string | null;
}

async function attachNovelOwnerNames<T extends { ownerId?: string }>(
  novels: T[],
  authDb?: AuthDb,
): Promise<Array<T & { ownerName?: string }>> {
  if (novels.length === 0) return novels;

  const fallbackName = (ownerId?: string): string => {
    const normalized = ownerId?.trim() || 'dev';
    return normalized === 'dev' ? '本地用户' : normalized;
  };

  if (!authDb) {
    return novels.map((novel) => ({
      ...novel,
      ownerName: fallbackName(novel.ownerId),
    }));
  }

  const ownerIds = Array.from(new Set(
    novels
      .map((novel) => novel.ownerId?.trim())
      .filter((ownerId): ownerId is string => Boolean(ownerId) && ownerId !== 'dev'),
  ));

  if (ownerIds.length === 0) {
    return novels.map((novel) => ({
      ...novel,
      ownerName: fallbackName(novel.ownerId),
    }));
  }

  const placeholders = ownerIds.map(() => '?').join(', ');
  const [rows] = await authDb.execute<NovelOwnerRow[]>(
    `SELECT id, username, pen_name FROM users WHERE id IN (${placeholders})`,
    ownerIds,
  );
  const ownerNameMap = new Map<string, string>();
  for (const row of rows) {
    ownerNameMap.set(row.id, row.pen_name?.trim() || row.username);
  }

  return novels.map((novel) => {
    const ownerId = novel.ownerId?.trim() || 'dev';
    return {
      ...novel,
      ownerName: ownerNameMap.get(ownerId) ?? fallbackName(ownerId),
    };
  });
}

/** 创建小说请求体 schema */
const CreateNovelBody = z.object({
  title: z.string().min(1, '标题不能为空'),
  genre: z.enum(['fantasy', 'mystery', 'modern', 'scifi', 'historical', 'romance', 'custom']),
  synopsis: z.string().optional(),
  description: z.string().optional(),
  constitutionTags: z.array(z.enum(NOVEL_CONSTITUTION_TAG_IDS as [string, ...string[]])).max(6).optional(),
});

/**
 * 创建小说 CRUD 路由
 * 前缀: /api/novels
 */
export function createNovelsRouter(
  novelManager: NovelManager,
  storyStateManager?: StoryStateManager,
  novelMemory?: NovelMemory,
  authDb?: AuthDb,
  modelClient?: ModelClient,
  broadcastJson?: (frame: Record<string, unknown>) => void,
  universeManager?: UniverseManager,
  bookStoreManager?: BookStoreManager,
): Router {
  const router = Router();

  async function tryAttachForkToUniverse(sourceNovelId: string, forkedNovel: NovelMetadata, fromChapter: number): Promise<void> {
    if (!universeManager) return;
    const universe = await universeManager.findUniverseByNovel(sourceNovelId);
    if (!universe) return;

    await universeManager.addNovel(universe.id, {
      novelId: forkedNovel.id,
      title: forkedNovel.title,
      genre: forkedNovel.genre,
      status: forkedNovel.status,
      notes: `从《${(await novelManager.getNovel(sourceNovelId)).title}》第${fromChapter}章分歧创建`,
    });
    await universeManager.addRelation(universe.id, {
      fromNovelId: sourceNovelId,
      toNovelId: forkedNovel.id,
      type: 'alt-branch',
      anchorChapterNumber: fromChapter,
      timelineSpan: `从第${fromChapter}章分歧`,
      notes: '由旧版分支创建流程自动补录到宇宙关系',
    });
  }

  /** 判定委派给共享真实来源，避免与 novel-ownership 语义分化 */
  function canAccessNovelRequest(req: Request, novel: NovelMetadata): boolean {
    return canAccessNovel(req.auth, novel);
  }

  async function loadAccessibleNovel(req: Request, res: Response): Promise<NovelMetadata | null> {
    try {
      const novelId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return null;
      }
      if (!canAccessNovelRequest(req, novel)) {
        res.status(403).json({ error: '无权访问此小说' });
        return null;
      }
      return novel;
    } catch (err) {
      res.status(404).json({ error: safeErrorMessage(err, '小说不存在') });
      return null;
    }
  }

  async function loadTrashNovel(req: Request, res: Response): Promise<NovelMetadata | null> {
    try {
      const items = await novelManager.listTrash();
      const novel = items.find((item) => item.id === req.params.id) ?? null;
      if (!novel) {
        res.status(404).json({ error: `回收站中不存在该小说: ${req.params.id}` });
        return null;
      }
      if (!canAccessNovelRequest(req, novel)) {
        res.status(403).json({ error: '无权操作此小说' });
        return null;
      }
      return novel;
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '读取回收站失败') });
      return null;
    }
  }

  async function loadOwnedNovelForWrite(req: Request, res: Response): Promise<NovelMetadata | null> {
    const novel = await loadAccessibleNovel(req, res);
    if (!novel) {
      return null;
    }
    return novel;
  }

  registerNovelReadRoutes(router, {
    novelManager,
    authDb,
    attachNovelOwnerNames,
    loadAccessibleNovel,
  });

  // 创建小说
  router.post('/', async (req, res) => {
    try {
      const parsed = CreateNovelBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const userId = req.auth?.id ?? 'dev';
      const novel = await novelManager.createNovel({ ...parsed.data, ownerId: userId });
      res.status(201).json(novel);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '创建小说失败') });
    }
  });

  registerNovelTrashRoutes(router, { novelManager, loadTrashNovel });

  registerNovelCoverRoutes(router, { novelManager, bookStoreManager, loadOwnedNovelForWrite });

  registerNovelConstitutionRoutes(router, {
    novelManager,
    authDb,
    modelClient,
    broadcastJson,
    loadAccessibleNovel,
    loadOwnedNovelForWrite,
  });
  registerNovelLifecycleRoutes(router, {
    novelManager,
    storyStateManager,
    novelMemory,
    bookStoreManager,
    loadAccessibleNovel,
  });

  registerNovelExportForkRoutes(router, {
    novelManager,
    loadAccessibleNovel,
    tryAttachForkToUniverse,
  });

  return router;
}
