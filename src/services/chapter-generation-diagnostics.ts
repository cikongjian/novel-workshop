import type { AgentOutput } from '../agents/types.js';
import type { Chapter } from '../novel/types.js';

function toNonNegativeInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item ?? '').trim()).filter(Boolean)
    : [];
}

export function buildAgentTrace(agentOutputs: AgentOutput[]): NonNullable<Chapter['diagnostics']>['agentTrace'] {
  return agentOutputs.map(output => {
    const metadata = output.metadata ?? {};
    return {
      agentRole: output.agentRole,
      inputChars: toNonNegativeInt(metadata.inputChars),
      systemPromptChars: toNonNegativeInt(metadata.systemPromptChars),
      outputChars: toNonNegativeInt(metadata.outputChars) ?? output.content.length,
      inputTokens: toNonNegativeInt(metadata.inputTokens),
      outputTokens: toNonNegativeInt(metadata.outputTokens),
      provider: typeof metadata.provider === 'string' ? metadata.provider : undefined,
      model: typeof metadata.model === 'string' ? metadata.model : undefined,
      latencyMs: toNonNegativeInt(metadata.latencyMs),
      skillIds: toStringArray(metadata.skillIds),
      droppedByBudget: toNonNegativeInt(metadata.droppedByBudget),
      timestamp: output.timestamp,
    };
  });
}

export function mergeChapterDiagnostics(
  existing: Chapter['diagnostics'] | undefined,
  patch: Partial<NonNullable<Chapter['diagnostics']>>,
  updatedAt: string,
): Chapter['diagnostics'] {
  const agentTrace = patch.agentTrace ?? existing?.agentTrace;
  const next = {
    ...existing,
    ...patch,
    ...(agentTrace ? { agentTrace } : {}),
    updatedAt,
  };
  return next;
}

export function buildTitleTrace(params: {
  candidateTitle: string;
  adopted: boolean;
  currentScore?: number | null;
  generatedScore?: number;
  reasons?: string[];
  fullContent: string;
  recentTitles: string[];
  provider?: string;
  model?: string;
  updatedAt: string;
  /** 标题来源：editor（编辑建议）、title-generator（独立生成）或 fallback（确定性兜底） */
  source?: 'editor' | 'title-generator' | 'fallback';
}): NonNullable<Chapter['diagnostics']>['titleTrace'] {
  return {
    candidateTitle: params.candidateTitle,
    adopted: params.adopted,
    currentScore: params.currentScore,
    generatedScore: params.generatedScore,
    reasons: params.reasons ?? [],
    fullContentChars: params.fullContent.length,
    recentTitles: params.recentTitles,
    provider: params.provider,
    model: params.model,
    source: params.source,
    updatedAt: params.updatedAt,
  };
}
