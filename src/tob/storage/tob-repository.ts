import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../utils/logger.js';
import { isPathWithin, resolvePathWithin } from '../../utils/path-safety.js';
import type {
  TobGeneratePayload,
  TobIntervenePayload,
  TobJob,
  TobJobRunResult,
  TobProject,
  TobState,
} from '../types.js';

const FORBIDDEN_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function createSafeRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function copySafeRecord<T>(value: unknown): Record<string, T> {
  const record = createSafeRecord<T>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return record;
  for (const [key, item] of Object.entries(value)) {
    if (!FORBIDDEN_RECORD_KEYS.has(key)) record[key] = item as T;
  }
  return record;
}

function createInitialState(): TobState {
  return {
    projects: createSafeRecord<TobProject>(),
    jobs: createSafeRecord<TobJob>(),
    projectJobs: createSafeRecord<string[]>(),
    queue: [],
  };
}

type LockTask<T> = () => Promise<T>;

export class TobRepository {
  private readonly baseDir: string;
  private readonly statePath: string;
  private readonly outputsDir: string;
  private readonly logger: Logger;
  private state: TobState = createInitialState();
  private loaded = false;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(baseDir: string, logger: Logger) {
    this.baseDir = baseDir;
    this.statePath = path.resolve(baseDir, 'state.json');
    this.outputsDir = path.resolve(baseDir, 'outputs');
    this.logger = logger;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.outputsDir, { recursive: true });
    await this.loadState();
  }

  async createProject(input: { name: string; brief?: string }): Promise<TobProject> {
    return this.withLock(async () => {
      const now = new Date().toISOString();
      const project: TobProject = {
        id: randomUUID(),
        name: input.name.trim(),
        brief: (input.brief ?? '').trim(),
        pipelineNovelId: undefined,
        sourceNovelId: undefined,
        createdAt: now,
        updatedAt: now,
      };
      this.state.projects[project.id] = project;
      this.state.projectJobs[project.id] = [];
      await this.persist();
      return project;
    });
  }

  getProject(projectId: string): TobProject | undefined {
    return this.state.projects[projectId];
  }

  async setProjectPipelineNovel(projectId: string, novelId: string): Promise<TobProject> {
    return this.withLock(async () => {
      const project = this.state.projects[projectId];
      if (!project) {
        throw new Error('PROJECT_NOT_FOUND');
      }
      const now = new Date().toISOString();
      project.pipelineNovelId = novelId;
      project.updatedAt = now;
      await this.persist();
      return project;
    });
  }

  async setProjectSourceNovel(projectId: string, sourceNovelId: string): Promise<TobProject> {
    return this.withLock(async () => {
      const project = this.state.projects[projectId];
      if (!project) {
        throw new Error('PROJECT_NOT_FOUND');
      }
      const now = new Date().toISOString();
      project.sourceNovelId = sourceNovelId;
      project.updatedAt = now;
      await this.persist();
      return project;
    });
  }

  listProjects(): TobProject[] {
    return Object.values(this.state.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  listProjectJobs(projectId: string): TobJob[] {
    const ids = this.state.projectJobs[projectId] ?? [];
    return ids
      .map((jobId) => this.state.jobs[jobId])
      .filter((job): job is TobJob => Boolean(job))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createGenerateJob(projectId: string, payload: TobGeneratePayload): Promise<TobJob> {
    return this.withLock(async () => {
      const project = this.state.projects[projectId];
      if (!project) {
        throw new Error('PROJECT_NOT_FOUND');
      }
      const now = new Date().toISOString();
      const job: TobJob = {
        id: randomUUID(),
        projectId,
        type: 'generate',
        status: 'queued',
        payload: {
          pipelineKey: payload.pipelineKey?.trim() || undefined,
          prompt: payload.prompt?.trim() || '',
          constraints: payload.constraints?.trim() || undefined,
          sourceNovelId: payload.sourceNovelId?.trim() || undefined,
          sourceChapterStart: payload.sourceChapterStart,
          sourceChapterEnd: payload.sourceChapterEnd,
          adaptationMode: payload.adaptationMode,
          qualityProfile: payload.qualityProfile,
        },
        createdAt: now,
        updatedAt: now,
      };
      this.state.jobs[job.id] = job;
      this.state.projectJobs[projectId] = this.state.projectJobs[projectId] ?? [];
      this.state.projectJobs[projectId].push(job.id);
      this.state.queue.push(job.id);
      project.updatedAt = now;
      await this.persist();
      return job;
    });
  }

  async createInterventionJob(sourceJobId: string, payload: Omit<TobIntervenePayload, 'baseJobId'>): Promise<TobJob> {
    return this.withLock(async () => {
      const sourceJob = this.state.jobs[sourceJobId];
      if (!sourceJob) {
        throw new Error('JOB_NOT_FOUND');
      }
      if (sourceJob.status !== 'succeeded' || !sourceJob.outputFile) {
        throw new Error('SOURCE_JOB_NOT_READY');
      }

      const project = this.state.projects[sourceJob.projectId];
      if (!project) {
        throw new Error('PROJECT_NOT_FOUND');
      }

      const now = new Date().toISOString();
      const job: TobJob = {
        id: randomUUID(),
        projectId: sourceJob.projectId,
        type: 'intervene',
        status: 'queued',
        payload: {
          baseJobId: sourceJobId,
          instruction: payload.instruction.trim(),
          pipelineKey: payload.pipelineKey?.trim() || undefined,
        },
        createdAt: now,
        updatedAt: now,
      };
      this.state.jobs[job.id] = job;
      this.state.projectJobs[sourceJob.projectId] = this.state.projectJobs[sourceJob.projectId] ?? [];
      this.state.projectJobs[sourceJob.projectId].push(job.id);
      this.state.queue.push(job.id);
      project.updatedAt = now;
      await this.persist();
      return job;
    });
  }

  getJob(jobId: string): TobJob | undefined {
    return this.state.jobs[jobId];
  }

  async claimNextQueuedJob(): Promise<TobJob | undefined> {
    return this.withLock(async () => {
      while (this.state.queue.length > 0) {
        const jobId = this.state.queue.shift();
        if (!jobId) break;
        const job = this.state.jobs[jobId];
        if (!job || job.status !== 'queued') {
          continue;
        }
        const now = new Date().toISOString();
        job.status = 'running';
        job.startedAt = now;
        job.updatedAt = now;
        await this.persist();
        return job;
      }
      await this.persist();
      return undefined;
    });
  }

  async completeJob(jobId: string, result: TobJobRunResult): Promise<void> {
    await this.withLock(async () => {
      const job = this.state.jobs[jobId];
      if (!job) {
        throw new Error('JOB_NOT_FOUND');
      }
      const outputFilePath = await this.writeOutput(job, result.markdown);
      const now = new Date().toISOString();
      job.status = 'succeeded';
      job.updatedAt = now;
      job.finishedAt = now;
      job.outputFile = path.relative(this.baseDir, outputFilePath);
      job.outputPreview = result.markdown.slice(0, 280);
      job.model = result.model;
      job.usage = result.usage;
      job.pipeline = result.pipeline;
      job.error = undefined;

      const project = this.state.projects[job.projectId];
      if (project) {
        project.updatedAt = now;
      }

      await this.persist();
    });
  }

  async failJob(jobId: string, error: string): Promise<void> {
    await this.withLock(async () => {
      const job = this.state.jobs[jobId];
      if (!job) {
        throw new Error('JOB_NOT_FOUND');
      }
      const now = new Date().toISOString();
      job.status = 'failed';
      job.updatedAt = now;
      job.finishedAt = now;
      job.error = error.slice(0, 1000);
      await this.persist();
    });
  }

  async updateJobProgress(jobId: string, progressMessage: string): Promise<void> {
    await this.withLock(async () => {
      const job = this.state.jobs[jobId];
      if (!job) {
        return;
      }
      job.progressMessage = progressMessage;
      job.updatedAt = new Date().toISOString();
      await this.persist();
    });
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.withLock(async () => {
      const job = this.state.jobs[jobId];
      if (!job) {
        throw new Error('JOB_NOT_FOUND');
      }
      if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
        throw new Error('JOB_ALREADY_FINISHED');
      }
      const now = new Date().toISOString();
      job.status = 'cancelled';
      job.updatedAt = now;
      job.finishedAt = now;
      job.error = 'Job cancelled by user';
      await this.persist();
    });
  }

  async readJobOutput(job: TobJob): Promise<string> {
    if (!job.outputFile) {
      throw new Error('JOB_OUTPUT_NOT_FOUND');
    }
    const absolute = resolvePathWithin(this.baseDir, job.outputFile);
    if (!isPathWithin(this.outputsDir, absolute)) throw new Error('INVALID_OUTPUT_PATH');
    return fs.readFile(absolute, 'utf-8');
  }

  private async loadState(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.statePath, 'utf-8');
      const parsed = JSON.parse(raw) as TobState;
      this.state = {
        projects: copySafeRecord<TobProject>(parsed.projects),
        jobs: copySafeRecord<TobJob>(parsed.jobs),
        projectJobs: copySafeRecord<string[]>(parsed.projectJobs),
        queue: Array.isArray(parsed.queue) ? parsed.queue.filter((item): item is string => typeof item === 'string') : [],
      };
      this.loaded = true;
      this.logger.info('ToB repository loaded', {
        projects: Object.keys(this.state.projects).length,
        jobs: Object.keys(this.state.jobs).length,
      });
    } catch {
      this.state = createInitialState();
      this.loaded = true;
      await this.persist();
      this.logger.info('ToB repository initialized');
    }
  }

  private async writeOutput(job: TobJob, markdown: string): Promise<string> {
    const projectDir = resolvePathWithin(this.outputsDir, job.projectId);
    await fs.mkdir(projectDir, { recursive: true });
    const outputFilePath = resolvePathWithin(projectDir, `${job.id}.md`);
    await fs.writeFile(outputFilePath, markdown, 'utf-8');
    return outputFilePath;
  }

  private async persist(): Promise<void> {
    const tempPath = `${this.statePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
    await fs.rename(tempPath, this.statePath);
  }

  private async withLock<T>(task: LockTask<T>): Promise<T> {
    const run = this.lock.then(task, task);
    this.lock = run.then(() => undefined, () => undefined);
    return run;
  }
}
