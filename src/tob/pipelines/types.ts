import type { Logger } from '../../utils/logger.js';
import type { AgentEvent } from '../../agents/types.js';
import type { TobRepository } from '../storage/tob-repository.js';
import type { TobJob, TobJobRunResult, TobPipelineSummary, TobProject } from '../types.js';
import type { TobPipelineRuntime } from '../services/tob-pipeline-runtime.js';

export interface TobPipelineRunContext {
  job: TobJob;
  project: TobProject;
  runtime: TobPipelineRuntime;
  repository: TobRepository;
  logger: Logger;
  allowMockGeneration: boolean;
  broadcaster?: {
    broadcast: (event: AgentEvent) => void;
    broadcastJson: (frame: Record<string, unknown>) => void;
  };
}

export interface TobPipelineRunner {
  readonly summary: TobPipelineSummary;
  runGenerate(context: TobPipelineRunContext): Promise<TobJobRunResult>;
  runIntervention?(context: TobPipelineRunContext): Promise<TobJobRunResult>;
}
