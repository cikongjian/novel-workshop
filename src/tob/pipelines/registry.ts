import type { TobPipelineRunner } from './types.js';
import type { TobPipelineSummary } from '../types.js';

const DEFAULT_PIPELINE_KEY = 'longform-novel';

export class TobPipelineRegistry {
  private readonly runners = new Map<string, TobPipelineRunner>();

  constructor(runners: TobPipelineRunner[]) {
    for (const runner of runners) {
      this.runners.set(runner.summary.key, runner);
    }
  }

  resolveRunner(pipelineKey?: string): TobPipelineRunner {
    const key = (pipelineKey ?? DEFAULT_PIPELINE_KEY).trim() || DEFAULT_PIPELINE_KEY;
    const runner = this.runners.get(key);
    if (!runner) {
      throw new Error(`PIPELINE_NOT_FOUND:${key}`);
    }
    return runner;
  }

  listSummaries(): TobPipelineSummary[] {
    return Array.from(this.runners.values())
      .map((runner) => runner.summary)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
