import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { WorldEntry } from '../../novel/types.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import { canAccessNovel } from '../middleware/novel-ownership.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

/** 创建/更新世界观条目请求体 schema */
const WorldEntryBody = z.object({
  category: z.enum(['geography', 'history', 'faction', 'power', 'culture', 'rule', 'other']),
  name: z.string().min(1, '条目名称不能为空'),
  description: z.string(),
  details: z.record(z.string(), z.string()).optional(),
  relatedEntries: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
});

async function tryIndexWorldEntry(
  novelMemory: NovelMemory | undefined,
  novelId: string,
  entry: WorldEntry,
): Promise<void> {
  if (!novelMemory) return;
  try {
    await novelMemory.indexWorldEntry(novelId, entry);
  } catch {
    // 记忆索引失败不影响主流程
  }
}

function getSingleParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * 创建世界观路由
 * 前缀: /api/novels/:novelId/world
 */
export function createWorldRouter(
  novelManager: NovelManager,
  novelMemory?: NovelMemory,
): Router {
  const router = Router({ mergeParams: true });

  // 权限检查中间件：验证用户是否有权访问该小说
  router.use(async (req, res, next) => {
    const novelId = getSingleParam(req.params.novelId);
    if (!novelId) {
      res.status(400).json({ error: 'novelId is required' });
      return;
    }

    try {
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      if (!canAccessNovel(req.auth, novel)) {
        res.status(403).json({ error: '无权访问此小说的世界观' });
        return;
      }

      next();
    } catch (err) {
      res.status(500).json({ error: '验证权限失败' });
    }
  });

  // 获取世界观条目列表
  router.get('/', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const entries = await novelManager.getWorldEntries(novelId);
      res.json(entries);
    } catch (err) {
      const isNotFound = err instanceof Error && (err.message.includes('不存在') || err.message.includes('not found'));
      res.status(isNotFound ? 404 : 500).json({ error: safeErrorMessage(err, '获取世界观条目失败') });
    }
  });

  // 创建世界观条目
  router.post('/', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = WorldEntryBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const timestamp = new Date().toISOString();
      const entry: WorldEntry = {
        id: uuidv4(),
        category: parsed.data.category,
        name: parsed.data.name,
        description: parsed.data.description,
        details: parsed.data.details ?? {},
        relatedEntries: parsed.data.relatedEntries ?? [],
        dependencies: [],
        conflicts: [],
        tags: parsed.data.tags ?? [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await novelManager.saveWorldEntry(novelId, entry);
      await tryIndexWorldEntry(novelMemory, novelId, entry);
      res.status(201).json(entry);
    } catch (err) {
      const isNotFound = err instanceof Error && (err.message.includes('不存在') || err.message.includes('not found'));
      res.status(isNotFound ? 404 : 500).json({ error: safeErrorMessage(err, '创建世界观条目失败') });
    }
  });

  // 更新世界观条目
  router.put('/:entryId', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const { entryId } = req.params;
      const parsed = WorldEntryBody.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      // 获取已有条目
      const entries = await novelManager.getWorldEntries(novelId);
      const existing = entries.find((e: WorldEntry) => e.id === entryId);
      if (!existing) {
        res.status(404).json({ error: '世界观条目不存在' });
        return;
      }

      const updated: WorldEntry = {
        ...existing,
        ...parsed.data,
        id: entryId,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await novelManager.saveWorldEntry(novelId, updated);
      await tryIndexWorldEntry(novelMemory, novelId, updated);
      res.json(updated);
    } catch (err) {
      const isNotFound = err instanceof Error && (err.message.includes('不存在') || err.message.includes('not found'));
      res.status(isNotFound ? 404 : 500).json({ error: safeErrorMessage(err, '更新世界观条目失败') });
    }
  });

  // 删除世界观条目
  router.delete('/:entryId', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const { entryId } = req.params;
      await novelManager.deleteWorldEntry(novelId, entryId);
      res.status(204).send();
    } catch (err) {
      const isNotFound = err instanceof Error && (err.message.includes('不存在') || err.message.includes('not found'));
      res.status(isNotFound ? 404 : 500).json({ error: safeErrorMessage(err, '删除世界观条目失败') });
    }
  });

  // GET /world/conflicts — 已弃用的孤立诊断入口
  router.get('/conflicts', (_req, res) => {
    res.status(410).json({
      error: '世界观冲突检测公开接口已弃用',
      code: 'WORLD_CONFLICTS_HTTP_DEPRECATED',
    });
  });

  return router;
}
