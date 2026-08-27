import type { Logger } from '../../utils/logger.js';
import { TobGenerationService } from './tob-generation-service.js';
import { TobRepository } from '../storage/tob-repository.js';

export class TobWorker {
  private readonly repository: TobRepository;
  private readonly generationService: TobGenerationService;
  private readonly logger: Logger;
  private readonly concurrency: number;
  private readonly pollMs: number;
  private timer?: NodeJS.Timeout;
  private activeCount = 0;

  constructor(params: {
    repository: TobRepository;
    generationService: TobGenerationService;
    logger: Logger;
    concurrency: number;
    pollMs: number;
  }) {
    this.repository = params.repository;
    this.generationService = params.generationService;
    this.logger = params.logger;
    this.concurrency = params.concurrency;
    this.pollMs = params.pollMs;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollMs);
    this.timer.unref();
    void this.tick();
    this.logger.info('ToB worker started', { concurrency: this.concurrency, pollMs: this.pollMs });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.logger.info('ToB worker stopped');
  }

  private async tick(): Promise<void> {
    while (this.activeCount < this.concurrency) {
      const job = await this.repository.claimNextQueuedJob();
      if (!job) {
        return;
      }
      const project = this.repository.getProject(job.projectId);
      if (!project) {
        await this.repository.failJob(job.id, 'PROJECT_NOT_FOUND');
        continue;
      }
      this.activeCount += 1;
      void this.processJob(job.id, project.id).finally(() => {
        this.activeCount -= 1;
      });
    }
  }

  private async processJob(jobId: string, projectId: string): Promise<void> {
    const job = this.repository.getJob(jobId);
    const project = this.repository.getProject(projectId);
    if (!job || !project) {
      return;
    }

    try {
      const result = await this.generationService.run(job, project);
      await this.repository.completeJob(jobId, result);
      this.logger.info('ToB job finished', { jobId, projectId, model: result.model });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.failJob(jobId, message);
      this.logger.error('ToB job failed', { jobId, projectId, error: message });
    }
  }
}
