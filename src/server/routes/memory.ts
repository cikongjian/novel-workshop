/**
 * 记忆管理 API 路由
 */

import { Router } from 'express';
import { z } from 'zod';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { executeReindexMemory } from '../../scripts/reindex-memory.js';
import { checkNovelAccess } from '../middleware/novel-access.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

export interface MemoryDeps {
  novelMemory: NovelMemory;
  novelManager: NovelManager;
}

export function createMemoryRouter(deps: MemoryDeps): Router {
  const router = Router();
  const { novelMemory, novelManager } = deps;
  const ReindexBody = z.object({
    clearBeforeRebuild: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }).optional();

  router.use('/novels/:novelId/memory', async (req, res, next) => {
    const novelId = Array.isArray(req.params.novelId) ? req.params.novelId[0] : req.params.novelId;
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    next();
  });

  /** 获取记忆统计 */
  router.get('/novels/:novelId/memory/stats', async (req, res) => {
    const stats = await novelMemory.getMemoryStats(req.params.novelId);
    res.json(stats);
  });

  /** 单本小说重建向量记忆索引 */
  router.post('/novels/:novelId/memory/reindex', async (req, res) => {
    const parsed = ReindexBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }
    const novelId = req.params.novelId;
    const clearBeforeRebuild = parsed.data?.clearBeforeRebuild ?? true;
    const dryRun = parsed.data?.dryRun ?? false;
    if (!dryRun) {
      novelMemory.close(novelId);
    }
    try {
      const summary = await executeReindexMemory({
        novelIds: [novelId],
        clearBeforeRebuild,
        dryRun,
      });
      const ok = summary.ok && summary.failedNovels === 0;
      res.status(ok ? 200 : 500).json({
        success: ok,
        message: dryRun ? '记忆索引预检完成' : '记忆索引重建完成',
        summary,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: 'memory reindex failed',
        detail: safeErrorMessage(err, '记忆索引重建失败'),
      });
    } finally {
      if (!dryRun) {
        novelMemory.close(novelId);
      }
    }
  });

  /** 优化存储（兼容旧接口） */
  router.post('/novels/:novelId/memory/vacuum', async (req, res) => {
    await novelMemory.optimize(req.params.novelId);
    res.json({ success: true, message: '存储优化完成' });
  });

  /** 清除分类 */
  const ValidCategoryParam = z.enum([
    'world', 'character', 'chapter', 'digest', 'arc',
    'fact', 'thread', 'character_state',
  ]);
  router.delete('/novels/:novelId/memory/:category', async (req, res) => {
    const parsed = ValidCategoryParam.safeParse(req.params.category);
    if (!parsed.success) {
      res.status(400).json({ error: '无效的记忆分类' });
      return;
    }
    await novelMemory.clearCategory(req.params.novelId, parsed.data);
    res.json({ success: true });
  });

  /** 检索日志 */
  router.get('/novels/:novelId/memory/retrieval-logs', (_req, res) => {
    res.status(410).json({
      error: '记忆检索日志公开接口已弃用',
      code: 'MEMORY_RETRIEVAL_LOGS_DEPRECATED',
    });
  });

  /** 获取索引覆盖度（源数据 vs 向量库） */
  router.get('/novels/:novelId/memory/coverage', async (req, res) => {
    const coverage = await novelMemory.getMemoryCoverage(req.params.novelId);
    res.json(coverage);
  });

  /** 清除检索日志 */
  router.delete('/novels/:novelId/memory/retrieval-logs', (_req, res) => {
    res.status(410).json({
      error: '记忆检索日志公开接口已弃用',
      code: 'MEMORY_RETRIEVAL_LOGS_DEPRECATED',
    });
  });

  /** 调试搜索 */
  router.get('/novels/:novelId/memory/search', async (req, res) => {
    const { query, category, limit } = req.query;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: '缺少 query 参数' });
      return;
    }
    try {
      const results = await novelMemory.debugSearch(
        req.params.novelId,
        query,
        typeof category === 'string' ? category : undefined,
        typeof limit === 'string' ? parseInt(limit, 10) : 10,
      );
      res.json(results);
    } catch (err) {
      console.error('[memory:search] error:', err);
      res.status(500).json({ error: '搜索失败', detail: String(err) });
    }
  });

  return router;
}
