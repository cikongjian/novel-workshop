import type { ReferralService } from './referral-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ReferralScheduler');

const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // 每小时运行一次

/**
 * 启动拉新奖励定时结算器。
 * 每小时扫描并结算：
 *   1. 到期的注册奖励（active + scheduled_at <= now）
 *   2. 到期的充值佣金（pending + settle_at <= now）
 */
export function startReferralScheduler(referralService: ReferralService): NodeJS.Timeout {
  const run = async (): Promise<void> => {
    try {
      await referralService.settlePendingRegisterRewards();
    } catch (err) {
      log.warn('注册奖励结算异常', { message: err instanceof Error ? err.message : String(err) });
    }

    try {
      await referralService.settleDueCommissions();
    } catch (err) {
      log.warn('佣金结算异常', { message: err instanceof Error ? err.message : String(err) });
    }
  };

  // 启动后先运行一次
  void run();

  const timer = setInterval(() => { void run(); }, SCHEDULER_INTERVAL_MS);
  log.info('拉新调度器已启动，间隔 1 小时');
  return timer;
}
