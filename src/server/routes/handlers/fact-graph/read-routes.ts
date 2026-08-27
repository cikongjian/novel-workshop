import type { Router } from 'express';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { buildContradictions, sendDeprecated } from './route-support.js';

export function registerFactGraphReadRoutes(
  router: Router,
  novelManager: NovelManager,
  novelMemory?: NovelMemory,
): void {
  router.get('/', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      const graph = await novelManager.getFactGraph(novelId);
      res.json(graph);
    } catch (err) {
      const message = safeErrorMessage(err, '获取事实图谱失败');
      res.status(500).json({ error: message });
    }
  });

  router.get('/timeline', (_req, res) => {
    sendDeprecated(res, 'FACT_GRAPH_TIMELINE_DEPRECATED', '事实图谱时间线公开接口已弃用');
  });

  router.get('/character/:name/track', (_req, res) => {
    sendDeprecated(res, 'FACT_GRAPH_CHARACTER_TRACK_DEPRECATED', '事实图谱角色追踪公开接口已弃用');
  });

  router.get('/items', (_req, res) => {
    sendDeprecated(res, 'FACT_GRAPH_ITEMS_DEPRECATED', '事实图谱物品时间线公开接口已弃用');
  });

  router.get('/contradictions', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      res.json(await buildContradictions(novelId, novelManager, novelMemory));
    } catch (err) {
      const message = safeErrorMessage(err, '获取矛盾数据失败');
      res.status(500).json({ error: message });
    }
  });

  router.get('/graph/neighbors/:entityName', (_req, res) => {
    sendDeprecated(res, 'FACT_GRAPH_NEIGHBORS_DEPRECATED', '事实图谱邻居查询公开接口已弃用');
  });

  router.get('/graph/involved/:charA/:charB', (_req, res) => {
    sendDeprecated(res, 'FACT_GRAPH_INVOLVED_DEPRECATED', '事实图谱共同事件查询公开接口已弃用');
  });
}
