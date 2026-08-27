/**
 * 作家分定时重算调度器
 *
 * 每日凌晨 2:00 全量重算所有发布过作品的用户的作家分。
 */
import { createLogger } from '../utils/logger.js';
import type { WriterScoreService } from './writer-score-service.js';

const log = createLogger('writer-score-scheduler');

export class WriterScoreScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly scoreService: WriterScoreService) {}

  start(): void {
    // 首次延迟到下一个凌晨 2:00
    const now = new Date();
    const next2am = new Date(now);
    next2am.setHours(2, 0, 0, 0);
    if (next2am <= now) {
      next2am.setDate(next2am.getDate() + 1);
    }
    const initialDelay = next2am.getTime() - now.getTime();

    log.info(`作家分定时任务将在 ${Math.round(initialDelay / 60000)} 分钟后首次执行`);

    // 首次执行
    setTimeout(() => {
      this.runDaily().catch((err) => {
        log.error('作家分定时重算失败', { error: err instanceof Error ? err.message : String(err) });
      });
      // 之后每 24 小时执行一次
      this.timer = setInterval(() => {
        this.runDaily().catch((err) => {
          log.error('作家分定时重算失败', { error: err instanceof Error ? err.message : String(err) });
        });
      }, 24 * 60 * 60 * 1000);
    }, initialDelay);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runDaily(): Promise<void> {
    log.info('开始每日作家分全量重算');
    const startTime = Date.now();
    const results = await this.scoreService.calculateAllScores();
    for (const r of results) {
      this.scoreService.saveScore(r);
    }
    const elapsed = Date.now() - startTime;
    log.info(`作家分全量重算完成，共 ${results.length} 位作家，耗时 ${elapsed}ms`);
  }
}
