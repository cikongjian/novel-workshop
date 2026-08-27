import type { AgentCostRecord, ChapterCostSummary, NovelCostData } from '../types';

export function isSuspiciousZeroCostAgent(agent: AgentCostRecord): boolean {
  const totalTokens = agent.inputTokens + agent.outputTokens;
  return totalTokens > 0 && agent.totalCost === 0;
}

export function getSuspiciousZeroCostAgents(agents: AgentCostRecord[]): AgentCostRecord[] {
  return agents.filter(isSuspiciousZeroCostAgent);
}

export function getChapterSuspiciousZeroCostCount(chapter: ChapterCostSummary): number {
  return getSuspiciousZeroCostAgents(chapter.agentCosts).length;
}

export function getNovelSuspiciousZeroCostCount(costData: NovelCostData): number {
  return costData.chapters.reduce((sum, chapter) => sum + getChapterSuspiciousZeroCostCount(chapter), 0);
}
