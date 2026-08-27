/**
 * 写作统计路由
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { WriterStatsService } from '../../services/writer-stats-service.js';

export function createWriterStatsRouter(statsService: WriterStatsService) {
  const router = Router();

  function getUserId(req: Request): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((req as any).auth as { id?: string } | undefined)?.id;
  }

  // 获取写作统计（未登录返回零值，前端展示空状态引导）
  router.get('/', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.json({
        todayWords: 0, todayGoal: 2000, todayPercent: 0,
        streak: 0, totalWords: 0, thisWeekWords: 0, thisMonthWords: 0,
        weeklyHeatmap: [0, 0, 0, 0, 0, 0, 0],
        milestones: [],
      });
      return;
    }
    res.json(statsService.getStats(userId));
  });

  // 记录字数（供保存章节后调用）
  router.post('/record', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { addedWords, novelCount } = req.body ?? {};
    statsService.recordWords(userId, Number(addedWords) || 0, Number(novelCount) || 1);
    res.json({ ok: true });
  });

  // 获取每日目标（未登录返回默认值）
  router.get('/goal', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.json({ goal: 2000 });
      return;
    }
    res.json({ goal: statsService.getDailyGoal(userId) });
  });

  router.put('/goal', (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { goal } = req.body ?? {};
    statsService.setDailyGoal(userId, Number(goal) || 2000);
    res.json({ goal: statsService.getDailyGoal(userId) });
  });

  return router;
}
