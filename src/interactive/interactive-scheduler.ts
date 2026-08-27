/**
 * 互动小说调度器。
 *
 * 职责：每分钟 tick 一次，调用 InteractiveNovelOrchestrator.scanAndAdvance()
 * 推进所有互动小说的状态机。
 *
 * 设计完全照搬 BookstoreAutoUpdateScheduler 的极简实现
 * （src/bookstore/auto-update-scheduler.ts），保持一致的启动/停止模式。
 */

import { InteractiveNovelOrchestrator } from './interactive-orchestrator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('InteractiveScheduler');
const TICK_INTERVAL_MS = 60 * 1000; // 每分钟

export class InteractiveNovelScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly orchestrator: InteractiveNovelOrchestrator) {}

  start(): void {
    if (this.timer) return;
    // 启动时立即跑一次（扫描有待推进的小说）
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    logger.info('互动小说调度器已启动（每分钟 tick）');
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('互动小说调度器已停止');
  }

  private async tick(): Promise<void> {
    try {
      await this.orchestrator.scanAndAdvance();
    } catch (err) {
      logger.error('调度器 tick 失败', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
