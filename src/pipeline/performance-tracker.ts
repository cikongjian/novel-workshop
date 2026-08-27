import type { AgentRole } from '../agents/types.js';

export type PerfStepType = 'agent' | 'gate' | 'memory' | 'io';

export type PerfStep = {
  name: string;
  type: PerfStepType;
  agentRole?: AgentRole;
  startTime: number;
  endTime: number;
  durationMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  metadata?: Record<string, unknown>;
};

export type PerfReport = {
  novelId: string;
  chapterNumber: number;
  totalDurationMs: number;
  steps: PerfStep[];
  bottleneck: PerfStep | null;
  agentBreakdown: Record<string, { count: number; totalMs: number; avgMs: number }>;
  gateBreakdown: Record<string, { durationMs: number; passed?: boolean }>;
  timestamp: string;
};

const MAX_HISTORY = 50;

export class PerformanceTracker {
  private steps: PerfStep[] = [];
  private startTime = 0;
  private novelId = '';
  private chapterNumber = 0;

  /** 最近 N 次生成的性能报告 */
  private static history: PerfReport[] = [];

  begin(novelId: string, chapterNumber: number): void {
    this.steps = [];
    this.startTime = Date.now();
    this.novelId = novelId;
    this.chapterNumber = chapterNumber;
  }

  startStep(name: string, type: PerfStepType, agentRole?: AgentRole): (metadata?: Record<string, unknown>) => PerfStep {
    const step: PerfStep = {
      name,
      type,
      agentRole,
      startTime: Date.now(),
      endTime: 0,
      durationMs: 0,
    };

    return (metadata?: Record<string, unknown>) => {
      step.endTime = Date.now();
      step.durationMs = step.endTime - step.startTime;
      if (metadata) step.metadata = metadata;
      this.steps.push(step);
      return step;
    };
  }

  recordTokenUsage(stepName: string, usage: { prompt: number; completion: number; total: number }): void {
    const step = this.steps.findLast(s => s.name === stepName);
    if (step) step.tokenUsage = usage;
  }

  finish(): PerfReport {
    const totalDurationMs = Date.now() - this.startTime;
    const bottleneck = this.steps.length > 0
      ? this.steps.reduce((max, s) => s.durationMs > max.durationMs ? s : max)
      : null;

    const agentBreakdown: PerfReport['agentBreakdown'] = {};
    for (const step of this.steps.filter(s => s.type === 'agent')) {
      const key = step.agentRole ?? step.name;
      if (!agentBreakdown[key]) agentBreakdown[key] = { count: 0, totalMs: 0, avgMs: 0 };
      agentBreakdown[key].count++;
      agentBreakdown[key].totalMs += step.durationMs;
      agentBreakdown[key].avgMs = Math.round(agentBreakdown[key].totalMs / agentBreakdown[key].count);
    }

    const gateBreakdown: PerfReport['gateBreakdown'] = {};
    for (const step of this.steps.filter(s => s.type === 'gate')) {
      gateBreakdown[step.name] = {
        durationMs: step.durationMs,
        passed: step.metadata?.passed as boolean | undefined,
      };
    }

    const report: PerfReport = {
      novelId: this.novelId,
      chapterNumber: this.chapterNumber,
      totalDurationMs,
      steps: this.steps,
      bottleneck,
      agentBreakdown,
      gateBreakdown,
      timestamp: new Date().toISOString(),
    };

    PerformanceTracker.history.push(report);
    if (PerformanceTracker.history.length > MAX_HISTORY) {
      PerformanceTracker.history.shift();
    }

    return report;
  }

  static getHistory(): PerfReport[] {
    return [...PerformanceTracker.history];
  }

  static getLatest(novelId?: string): PerfReport | null {
    const filtered = novelId
      ? PerformanceTracker.history.filter(r => r.novelId === novelId)
      : PerformanceTracker.history;
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }

  static clearHistory(): void {
    PerformanceTracker.history = [];
  }
}
