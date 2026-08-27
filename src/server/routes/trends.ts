import { Router } from 'express';
import { z } from 'zod';
import type { TrendsService } from '../../trends/trends-service.js';
import type { TrendsScheduler } from '../../trends/trends-scheduler.js';
import { TrendsConfigSchema } from '../../trends/trends-types.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('routes:trends');

export type TrendsRouterDeps = {
  trendsService: TrendsService;
  trendsScheduler: TrendsScheduler;
};

export function createTrendsRouter(deps: TrendsRouterDeps): Router {
  const router = Router();
  const { trendsService, trendsScheduler } = deps;

  function ensureAdmin(req: import('express').Request, res: import('express').Response): boolean {
    if (req.auth?.role === 'admin') {
      return true;
    }
    res.status(403).json({ error: '需要管理员权限' });
    return false;
  }

  // GET /api/trends/latest — 获取最新分析结果
  router.get('/latest', async (_req, res) => {
    try {
      const latest = await trendsService.getLatest();
      if (!latest) {
        res.json({ analysis: null, message: '尚未进行趋势分析，请点击刷新' });
        return;
      }
      res.json(latest);
    } catch (err) {
      log.error('获取最新趋势失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取趋势数据失败' });
    }
  });

  // POST /api/trends/refresh — 手动触发刷新
  router.post('/refresh', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      if (trendsService.isRefreshing) {
        res.status(409).json({ error: '趋势分析正在进行中，请稍候' });
        return;
      }
      const snapshot = await trendsService.refresh();
      res.json(snapshot);
    } catch (err) {
      const message = safeErrorMessage(err, '趋势分析失败');
      log.error('趋势刷新失败', { error: message });
      res.status(500).json({ error: message });
    }
  });

  // GET /api/trends/history — 历史快照列表
  router.get('/history', async (_req, res) => {
    try {
      const snapshots = await trendsService.listHistory();
      res.json({ snapshots });
    } catch (err) {
      log.error('获取趋势历史失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取历史数据失败' });
    }
  });

  // GET /api/trends/history/:date — 指定日期快照
  router.get('/history/:date', async (req, res) => {
    try {
      const { date } = req.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: '日期格式无效，应为 YYYY-MM-DD' });
        return;
      }
      const snapshot = await trendsService.getHistorySnapshot(date);
      if (!snapshot) {
        res.status(404).json({ error: `未找到 ${date} 的趋势快照` });
        return;
      }
      res.json(snapshot);
    } catch (err) {
      log.error('获取历史快照失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取历史快照失败' });
    }
  });

  // GET /api/trends/config — 获取配置
  router.get('/config', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const config = await trendsService.getConfig();
      res.json(config);
    } catch (err) {
      log.error('获取趋势配置失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取配置失败' });
    }
  });

  // PUT /api/trends/config — 更新配置
  router.put('/config', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const config = TrendsConfigSchema.parse(req.body);
      await trendsService.saveConfig(config);
      await trendsScheduler.restart();
      res.json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: '配置参数无效', details: err.errors });
        return;
      }
      log.error('保存趋势配置失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '保存配置失败' });
    }
  });

  // GET /api/trends/statistics — 跨日期聚合统计
  router.get('/statistics', async (_req, res) => {
    try {
      const stats = await trendsService.getStatistics();
      res.json(stats);
    } catch (err) {
      log.error('获取趋势统计失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取统计数据失败' });
    }
  });

  // GET /api/trends/status — 查询刷新状态
  router.get('/status', (_req, res) => {
    res.status(410).json({
      error: 'Trends status endpoint has been deprecated.',
      code: 'TRENDS_STATUS_DEPRECATED',
    });
  });

  return router;
}
