import { createLogger } from '../utils/logger.js';
import type { BookstoreAutoUpdateService } from './auto-update-service.js';

const log = createLogger('BookstoreAutoUpdateScheduler');
const AUTO_UPDATE_INTERVAL_MS = 60 * 1000;

export class BookstoreAutoUpdateScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly autoUpdateService: BookstoreAutoUpdateService) {}

  start(): void {
    if (this.timer) return;
    void this.autoUpdateService.runDueJobs();
    this.timer = setInterval(() => {
      void this.autoUpdateService.runDueJobs();
    }, AUTO_UPDATE_INTERVAL_MS);
    log.info('bookstore auto update scheduler started');
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
