/**
 * 作家分路由
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { WriterScoreService, WriterScoreResult } from '../../services/writer-score-service.js';

export function createWriterScoresRouter(scoreService: WriterScoreService) {
  const router = Router();

  function getUserId(req: Request): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((req as any).auth as { id?: string } | undefined)?.id;
  }

  /** 获取当前用户的作家分 */
  router.get('/my', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.json(zeroResult());
        return;
      }

      // 优先返回缓存，若超过 1 小时则重新计算
      const cached = scoreService.getCachedScore(userId);
      if (cached) {
        const cacheAge = Date.now() - new Date(cached.calculatedAt).getTime();
        if (cacheAge < 60 * 60 * 1000) {
          res.json(cached);
          return;
        }
      }

      const result = await scoreService.recalculateAndSave(userId);
      res.json(result);
    } catch {
      // 服务未就绪时返回零值，前端不报错
      res.json(zeroResult());
    }
  });

  /** 根据 userId 查询作家分（公开） */
  router.get('/:userId', async (req: Request, res: Response) => {
    try {
      const userId = String(req.params.userId);
      if (!userId) {
        res.status(400).json({ error: '缺少 userId' });
        return;
      }

      const cached = scoreService.getCachedScore(userId);
      if (cached) {
        res.json(cached);
        return;
      }

      const result = await scoreService.recalculateAndSave(userId);
      res.json(result);
    } catch {
      res.json(zeroResult());
    }
  });

  return router;
}

function zeroResult() {
  return { userId: '', score: 0, level: 0, levelName: '初涉文墨', dimensions: { bili: 0, pinzhi: 0, renqi: 0, duoyuan: 0 }, burstScore: 0, comboDays: 0, comboMultiplier: 1.0, calculatedAt: new Date().toISOString() };
}
