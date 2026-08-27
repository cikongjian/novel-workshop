import { CostTracker } from './cost-tracker.js';
import type { AgentOutput } from '../agents/types.js';
import type { ChapterCostSummary, CostOperationType } from './cost-types.js';

export function buildChapterCost(
  novelId: string,
  chapterNumber: number,
  agentOutputs: AgentOutput[],
  options: {
    operationType?: CostOperationType;
    operationLabel?: string;
    generatedAt?: string;
  } = {},
): ChapterCostSummary {
  const costTracker = new CostTracker();

  for (const output of agentOutputs) {
    const meta = output.metadata ?? {};
    if (typeof meta.inputTokens !== 'number' || typeof meta.outputTokens !== 'number') continue;
    costTracker.recordAgentCall({
      novelId,
      chapterNumber,
      agentRole: output.agentRole,
      provider: String(meta.provider ?? ''),
      model: String(meta.model ?? ''),
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      latencyMs: typeof meta.latencyMs === 'number' ? meta.latencyMs : 0,
    });
  }

  return costTracker.finalizeChapter(novelId, chapterNumber, options);
}
