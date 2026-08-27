import type { Logger } from '../../utils/logger.js';
import type { AgentEvent } from '../../agents/types.js';
import { TobRepository } from '../storage/tob-repository.js';
import type { TobJob, TobJobRunResult, TobPipelineSummary, TobProject } from '../types.js';
import type { TobPipelineRuntime } from './tob-pipeline-runtime.js';
import { TobPipelineRegistry } from '../pipelines/registry.js';
import type { TobPipelineRunContext } from '../pipelines/types.js';
import { runWithAiUsageContextAsync } from '../../ai/usage-context.js';

export class TobGenerationService {
  private readonly repository: TobRepository;
  private readonly allowMockGeneration: boolean;
  private readonly logger: Logger;
  private readonly runtime: TobPipelineRuntime;
  private readonly pipelineRegistry: TobPipelineRegistry;
  private readonly broadcaster?: {
    broadcast: (event: AgentEvent) => void;
    broadcastJson: (frame: Record<string, unknown>) => void;
  };

  constructor(params: {
    repository: TobRepository;
    allowMockGeneration: boolean;
    logger: Logger;
    runtime: TobPipelineRuntime;
    pipelineRegistry: TobPipelineRegistry;
    broadcaster?: {
      broadcast: (event: AgentEvent) => void;
      broadcastJson: (frame: Record<string, unknown>) => void;
    };
  }) {
    this.repository = params.repository;
    this.allowMockGeneration = params.allowMockGeneration;
    this.logger = params.logger;
    this.runtime = params.runtime;
    this.pipelineRegistry = params.pipelineRegistry;
    this.broadcaster = params.broadcaster;
  }

  listPipelines(): TobPipelineSummary[] {
    return this.pipelineRegistry.listSummaries();
  }

  async run(job: TobJob, project: TobProject): Promise<TobJobRunResult> {
    const context = this.buildContext(job, project);
    const operationKey = job.type === 'generate' ? 'system.tob.generate' : 'system.tob.intervene';
    const pipelineKey = this.resolveGeneratePipelineKey(job) ?? this.resolveInterventionPipelineKey(job);

    return runWithAiUsageContextAsync(
      {
        scope: 'system',
        operationKey,
        operationLabel: pipelineKey
          ? `${job.type === 'generate' ? 'ToB 生成任务' : 'ToB 干预任务'}:${pipelineKey}`
          : job.type === 'generate'
            ? 'ToB 生成任务'
            : 'ToB 干预任务',
        operationRegistered: true,
        novelId: project.pipelineNovelId ?? project.sourceNovelId,
      },
      async () => {
        if (job.type === 'generate') {
          const generatePipelineKey = this.resolveGeneratePipelineKey(job);
          const runner = this.pipelineRegistry.resolveRunner(generatePipelineKey);
          return runner.runGenerate(context);
        }

        const interventionPipelineKey = this.resolveInterventionPipelineKey(job);
        const runner = this.pipelineRegistry.resolveRunner(interventionPipelineKey);
        if (!runner.runIntervention) {
          throw new Error('PIPELINE_INTERVENTION_NOT_SUPPORTED');
        }
        return runner.runIntervention(context);
      },
    );
  }

  private buildContext(job: TobJob, project: TobProject): TobPipelineRunContext {
    return {
      job,
      project,
      runtime: this.runtime,
      repository: this.repository,
      logger: this.logger,
      allowMockGeneration: this.allowMockGeneration,
      broadcaster: this.broadcaster,
    };
  }

  private resolveGeneratePipelineKey(job: TobJob): string | undefined {
    const payload = job.payload;
    if (!('pipelineKey' in payload)) return undefined;
    return payload.pipelineKey;
  }

  private resolveInterventionPipelineKey(job: TobJob): string | undefined {
    const payload = job.payload;
    if ('pipelineKey' in payload && typeof payload.pipelineKey === 'string' && payload.pipelineKey.trim()) {
      return payload.pipelineKey.trim();
    }

    if ('baseJobId' in payload && typeof payload.baseJobId === 'string' && payload.baseJobId.trim()) {
      const sourceJob = this.repository.getJob(payload.baseJobId);
      return sourceJob?.pipeline?.pipelineKey;
    }

    return undefined;
  }
}
