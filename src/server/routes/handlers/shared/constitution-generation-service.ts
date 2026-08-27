import { randomUUID } from 'node:crypto';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { NovelMetadata } from '../../../../novel/types.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../../ai/usage-context.js';
import { createLogger } from '../../../../utils/logger.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { generateAndPersistConstitution } from './constitution-service.js';

const log = createLogger('constitution-generation-service');
const TASK_RETENTION_MS = 10 * 60_000;

export type ConstitutionGenerationTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ConstitutionGenerationTask = {
  taskId: string;
  novelId: string;
  status: ConstitutionGenerationTaskStatus;
  progress: number;
  stage: string;
  message: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
};

type BroadcastJson = (frame: Record<string, unknown>) => void;

type StartConstitutionGenerationParams = {
  novel: NovelMetadata;
  novelManager: NovelManager;
  modelClient: ModelClient;
  broadcastJson?: BroadcastJson;
};

class ConstitutionGenerationService {
  private tasksByNovelId = new Map<string, ConstitutionGenerationTask>();

  getTask(novelId: string): ConstitutionGenerationTask | null {
    this.cleanupExpiredTasks();
    return this.cloneTask(this.tasksByNovelId.get(novelId));
  }

  startTask(params: StartConstitutionGenerationParams): ConstitutionGenerationTask {
    this.cleanupExpiredTasks();
    const existing = this.tasksByNovelId.get(params.novel.id);
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      return this.cloneTask(existing)!;
    }

    const now = new Date().toISOString();
    const task: ConstitutionGenerationTask = {
      taskId: randomUUID(),
      novelId: params.novel.id,
      status: 'queued',
      progress: 3,
      stage: '排队中',
      message: '任务已提交，正在准备生成创作宪章',
      startedAt: now,
      updatedAt: now,
    };

    this.tasksByNovelId.set(params.novel.id, task);
    this.emitTask('constitution:queued', task, params.broadcastJson);

    const aiUsageContext = getAiUsageContext();
    setImmediate(() => {
      void runWithAiUsageContextAsync(
        {
          ...(aiUsageContext ?? {
            scope: 'http',
            operationKey: 'novel.constitution.generate',
            operationLabel: 'Novel constitution generation',
            operationRegistered: false,
          }),
          novelId: params.novel.id,
        },
        async () => {
          await this.runTask(task, params);
        },
      );
    });

    return this.cloneTask(task)!;
  }

  private async runTask(
    task: ConstitutionGenerationTask,
    params: StartConstitutionGenerationParams,
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutMs = 90_000;
    const timer = setTimeout(() => {
      controller.abort(new Error(`宪章生成超时（>${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);

    try {
      this.patchTask(task, {
        status: 'running',
        progress: 10,
        stage: '整理输入',
        message: '正在读取题材、书名、简介和宪章标签',
      }, params.broadcastJson);

      this.patchTask(task, {
        progress: 26,
        stage: '分析卖点',
        message: '正在提炼核心幻想、核心回报和防漂移约束',
      }, params.broadcastJson);

      const constitution = await generateAndPersistConstitution({
        novel: params.novel,
        novelManager: params.novelManager,
        modelClient: params.modelClient,
        source: 'generate',
        signal: controller.signal,
      });

      this.patchTask(task, {
        progress: 82,
        stage: '写入宪章',
        message: '正在保存结构化条款与关键词配置',
      }, params.broadcastJson);

      this.patchTask(
        task,
        {
          status: 'completed',
          progress: 100,
          stage: '已完成',
          message: '创作宪章已生成并写入当前小说',
          finishedAt: new Date().toISOString(),
        },
        params.broadcastJson,
        'constitution:complete',
      );
      log.info('宪章异步生成完成', { novelId: params.novel.id, taskId: task.taskId });
    } catch (err) {
      const message = safeErrorMessage(err, '生成宪章失败');
      this.patchTask(
        task,
        {
          status: 'failed',
          progress: Math.min(task.progress, 94),
          stage: '生成失败',
          message,
          error: message,
          finishedAt: new Date().toISOString(),
        },
        params.broadcastJson,
        'constitution:failed',
      );
      log.error('宪章异步生成失败', { novelId: params.novel.id, taskId: task.taskId, error: message });
    } finally {
      clearTimeout(timer);
    }
  }

  private patchTask(
    task: ConstitutionGenerationTask,
    updates: Partial<ConstitutionGenerationTask>,
    broadcastJson?: BroadcastJson,
    event = 'constitution:progress',
  ): void {
    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    this.emitTask(event, task, broadcastJson);
  }

  private emitTask(event: string, task: ConstitutionGenerationTask, broadcastJson?: BroadcastJson): void {
    broadcastJson?.({
      type: 'constitution',
      event,
      payload: this.cloneTask(task),
    });
  }

  private cleanupExpiredTasks(): void {
    const now = Date.now();
    for (const [novelId, task] of this.tasksByNovelId) {
      if (task.status === 'queued' || task.status === 'running') continue;
      const updatedAt = Date.parse(task.updatedAt);
      if (!Number.isFinite(updatedAt) || now - updatedAt > TASK_RETENTION_MS) {
        this.tasksByNovelId.delete(novelId);
      }
    }
  }

  private cloneTask(task?: ConstitutionGenerationTask | null): ConstitutionGenerationTask | null {
    if (!task) return null;
    return { ...task };
  }
}

export const constitutionGenerationService = new ConstitutionGenerationService();
