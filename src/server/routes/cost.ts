import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getNovelAiUsageSummary } from '../../ai/usage-summary-service.js';
import { ModelPricing } from '../../cost/cost-types.js';
import { DEFAULT_PRICING } from '../../cost/pricing.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

export function createCostRouter(novelManager: NovelManager, dataDir: string): Router {
  const router = Router({ mergeParams: true });
  const globalPricingPath = path.resolve(dataDir, 'pricing.json');

  router.use((req, res, next) => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: '仅管理员可查看成本数据' });
      return;
    }
    next();
  });

  router.get('/', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      res.json(await getNovelAiUsageSummary(novelManager, dataDir, novelId));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取费用数据失败') });
    }
  });

  router.get('/chapter/:chapterNumber', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      const chapterNumber = Number.parseInt(req.params.chapterNumber, 10);
      if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
        res.status(400).json({ error: '无效的章节编号' });
        return;
      }

      const data = await getNovelAiUsageSummary(novelManager, dataDir, novelId);
      const chapter = data.chapters.find((item) => item.chapterNumber === chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: `未找到第 ${chapterNumber} 章的费用数据` });
        return;
      }

      res.json(chapter);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取章节费用失败') });
    }
  });

  router.get('/pricing', async (_req, res) => {
    try {
      const raw = await fs.readFile(globalPricingPath, 'utf-8').catch(() => null);
      if (!raw) {
        res.json(DEFAULT_PRICING);
        return;
      }

      const parsed = z.array(ModelPricing).parse(JSON.parse(raw));
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取定价表失败') });
    }
  });

  router.put('/pricing', async (req, res) => {
    try {
      const parsed = z.array(ModelPricing).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      await fs.mkdir(path.dirname(globalPricingPath), { recursive: true });
      await fs.writeFile(globalPricingPath, JSON.stringify(parsed.data, null, 2), 'utf-8');
      res.json(parsed.data);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '更新定价表失败') });
    }
  });

  return router;
}
