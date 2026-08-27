import type { TrendsService } from './trends-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('trends-scheduler');

const MS_PER_DAY = 86_400_000;

/**
 * 趋势定时刷新调度器
 * 使用 setTimeout 链式调度，每日在配置的时间点自动刷新。
 */
export class TrendsScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly service: TrendsService) {}

  /** 根据当前配置启动调度 */
  async start(): Promise<void> {
    const config = await this.service.getConfig();
    if (!config.enabled) {
      log.info('趋势定时刷新已禁用');
      return;
    }
    this.scheduleNext(config.scheduleHour, config.scheduleMinute);
    const timeStr = `${String(config.scheduleHour).padStart(2, '0')}:${String(config.scheduleMinute).padStart(2, '0')}`;
    log.info(`趋势定时刷新已启动，每日 ${timeStr}`);
  }

  /** 停止调度 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 重启调度（配置变更后调用） */
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  /** 计算到下一个目标时刻的延迟并设置定时器 */
  private scheduleNext(hour: number, minute: number): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    // 若今天的时间点已过，推到明天
    if (next.getTime() <= now.getTime()) {
      next.setTime(next.getTime() + MS_PER_DAY);
    }

    const delay = next.getTime() - now.getTime();
    const hoursUntil = (delay / 3_600_000).toFixed(1);
    log.info(`下次趋势刷新: ${next.toLocaleString()} (${hoursUntil} 小时后)`);

    this.timer = setTimeout(() => {
      void this.runAndReschedule(hour, minute);
    }, delay);
  }

  /** 执行刷新并重新调度下一次 */
  private async runAndReschedule(hour: number, minute: number): Promise<void> {
    try {
      await this.service.refresh();
      log.info('定时趋势分析完成');
    } catch (err) {
      log.error('定时趋势分析失败', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // 无论成败都调度下一次
    this.scheduleNext(hour, minute);
  }
}
